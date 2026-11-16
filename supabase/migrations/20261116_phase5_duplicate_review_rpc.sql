-- ==============================================================================
-- Pothole Reporter - Phase 5.3: Transactional Duplicate Review RPC
-- Atomic, Idempotent, Service-Role-Only Stored Procedure for Duplicate Confirmation
--
-- DO NOT EXECUTE AUTOMATICALLY. REQUIRES MANUAL REVIEW AND APPROVAL.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.confirm_duplicate_candidate(
    p_candidate_id UUID,
    p_reviewer_user_id UUID,
    p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_candidate RECORD;
    v_primary RECORD;
    v_incoming RECORD;
    v_now pg_catalog.timestamptz := pg_catalog.clock_timestamp();
BEGIN
    -- 1. Lock and retrieve candidate row
    SELECT * INTO v_candidate
    FROM public.duplicate_candidates
    WHERE id = p_candidate_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidate with ID % not found', p_candidate_id;
    END IF;

    -- 2. Validate report IDs & prevent self-linkage
    IF v_candidate.primary_report_id = v_candidate.incoming_report_id THEN
        RAISE EXCEPTION 'Invalid duplicate candidate: primary and incoming report IDs are identical (%)', v_candidate.primary_report_id;
    END IF;

    -- 3. Lock involved reports in consistent alphabetical order to prevent deadlocks
    PERFORM 1
    FROM public.reports
    WHERE id IN (v_candidate.primary_report_id, v_candidate.incoming_report_id)
    ORDER BY id
    FOR UPDATE;

    -- Fetch locked reports
    SELECT * INTO v_primary
    FROM public.reports
    WHERE id = v_candidate.primary_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Primary report with ID % not found', v_candidate.primary_report_id;
    END IF;

    SELECT * INTO v_incoming
    FROM public.reports
    WHERE id = v_candidate.incoming_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incoming report with ID % not found', v_candidate.incoming_report_id;
    END IF;

    -- 4. Check for conflicting duplicate-master assignments
    IF v_primary.duplicate_of_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot merge into primary report % because it is already marked as a duplicate of %',
            v_primary.id, v_primary.duplicate_of_id;
    END IF;

    -- 5. Candidate State Verification: Idempotent retry for confirmed candidates
    IF v_candidate.status = 'confirmed' THEN
        IF v_incoming.duplicate_of_id = v_primary.id THEN
            -- Already confirmed and linked, return idempotently without incrementing count
            RETURN pg_catalog.jsonb_build_object(
                'success', true,
                'candidate_id', v_candidate.id,
                'primary_report_id', v_primary.id,
                'incoming_report_id', v_incoming.id,
                'already_confirmed', true,
                'newly_confirmed', false,
                'primary_duplicate_count', v_primary.duplicate_count
            );
        ELSE
            RAISE EXCEPTION 'Duplicate candidate % is confirmed but incoming report % is linked to % instead of %',
                v_candidate.id, v_incoming.id, v_incoming.duplicate_of_id, v_primary.id;
        END IF;
    END IF;

    -- 6. Enforce candidate state transition: new confirmations strictly require 'pending'
    -- Rejects candidates marked 'rejected' (preventing resurrection) or in any unsupported state
    IF v_candidate.status <> 'pending' THEN
        RAISE EXCEPTION 'Cannot confirm duplicate candidate %: status is ''%'', only ''pending'' candidates can be confirmed',
            v_candidate.id, v_candidate.status;
    END IF;

    -- 7. Check if incoming report is already linked to another canonical report
    IF v_incoming.duplicate_of_id IS NOT NULL AND v_incoming.duplicate_of_id <> v_primary.id THEN
        RAISE EXCEPTION 'Incoming report % is already linked as duplicate to %',
            v_incoming.id, v_incoming.duplicate_of_id;
    END IF;

    -- 8. Execute atomic state changes
    -- A. Update candidate record with review metadata
    UPDATE public.duplicate_candidates
    SET status = 'confirmed',
        reviewed_at = v_now,
        reviewed_by = p_reviewer_user_id,
        review_notes = p_review_notes,
        updated_at = v_now
    WHERE id = v_candidate.id;

    -- B. Update incoming report (link to primary report and mark status as rejected)
    UPDATE public.reports
    SET duplicate_of_id = v_primary.id,
        status = 'rejected',
        updated_at = v_now
    WHERE id = v_incoming.id;

    -- C. Increment primary duplicate_count exactly once
    IF v_incoming.duplicate_of_id IS NULL THEN
        UPDATE public.reports
        SET duplicate_count = v_primary.duplicate_count + 1,
            updated_at = v_now
        WHERE id = v_primary.id
        RETURNING duplicate_count INTO v_primary.duplicate_count;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'candidate_id', v_candidate.id,
        'primary_report_id', v_primary.id,
        'incoming_report_id', v_incoming.id,
        'already_confirmed', false,
        'newly_confirmed', true,
        'primary_duplicate_count', v_primary.duplicate_count
    );
END;
$$;

-- Security hardening: Restrict execution to service_role only
REVOKE ALL ON FUNCTION public.confirm_duplicate_candidate(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_duplicate_candidate(UUID, UUID, TEXT) TO service_role;
