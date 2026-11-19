-- ==============================================================================
-- Pothole Reporter - Phase 5: Civic Priority Engine & Duplicate Linkage
-- Additive Schema Migration for Canonical Duplicate Merging and Explainable Priority Scoring.
--
-- DO NOT EXECUTE AUTOMATICALLY. REQUIRES MANUAL REVIEW AND APPROVAL.
-- ==============================================================================

-- 1. Extend public.reports with canonical duplicate tracking and priority score
-- duplicate_of_id: Points to the master/canonical report when this report is confirmed as a duplicate.
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS duplicate_of_id UUID DEFAULT NULL
    REFERENCES public.reports(id) ON DELETE SET NULL;

-- duplicate_count: Tally of confirmed duplicate citizen reports linked into this canonical report.
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS duplicate_count INTEGER NOT NULL DEFAULT 0;

-- priority_score: Normalized composite severity score (0.0 to 100.0) calculated by the priority engine.
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS priority_score DOUBLE PRECISION DEFAULT NULL;


-- 2. Performance indexes for duplicate queries and priority-ranked triage dispatch
CREATE INDEX IF NOT EXISTS idx_reports_duplicate_of_id
ON public.reports (duplicate_of_id);

CREATE INDEX IF NOT EXISTS idx_reports_priority_score
ON public.reports (priority_score DESC NULLS LAST);


-- 3. Data integrity constraints (scoped to public.reports table identity)
DO $$
BEGIN
    -- Self-referencing constraint guard: a report cannot be marked as a duplicate of itself
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.reports'::regclass
          AND conname = 'chk_reports_no_self_duplicate'
    ) THEN
        ALTER TABLE public.reports
        ADD CONSTRAINT chk_reports_no_self_duplicate CHECK (duplicate_of_id <> id);
    END IF;

    -- duplicate_count non-negative check constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.reports'::regclass
          AND conname = 'chk_reports_duplicate_count_nonnegative'
    ) THEN
        ALTER TABLE public.reports
        ADD CONSTRAINT chk_reports_duplicate_count_nonnegative CHECK (duplicate_count >= 0);
    END IF;

    -- priority_score range check constraint (NULL or 0.0 to 100.0)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.reports'::regclass
          AND conname = 'chk_reports_priority_score_range'
    ) THEN
        ALTER TABLE public.reports
        ADD CONSTRAINT chk_reports_priority_score_range
        CHECK (priority_score IS NULL OR (priority_score >= 0 AND priority_score <= 100));
    END IF;
END $$;
