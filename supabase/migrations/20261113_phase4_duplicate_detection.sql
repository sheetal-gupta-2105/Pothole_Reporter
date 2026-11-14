-- ==============================================================================
-- Pothole Reporter - Phase 4: Geographic Intelligence & Duplicate Detection
-- Additive Schema Migration for Perceptual Hashing and Duplicate Candidates.
--
-- DO NOT EXECUTE AUTOMATICALLY. REQUIRES MANUAL REVIEW AND APPROVAL.
-- ==============================================================================

-- 1. Extend public.reports with perceptual hash (pHash) column
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS phash VARCHAR(64) DEFAULT NULL;

-- Index for pHash exact matching lookups
CREATE INDEX IF NOT EXISTS idx_reports_phash
ON public.reports (phash);

-- Spatial composite index for fast bounding-box spatial queries
CREATE INDEX IF NOT EXISTS idx_reports_coordinates
ON public.reports (latitude, longitude);


-- 2. Create public.duplicate_candidates table
CREATE TABLE IF NOT EXISTS public.duplicate_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    incoming_report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    distance_meters DOUBLE PRECISION NOT NULL,
    hamming_distance INTEGER DEFAULT NULL,
    similarity_pct DOUBLE PRECISION DEFAULT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('strong_duplicate', 'possible_duplicate')),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    reviewed_at TIMESTAMPTZ DEFAULT NULL,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_notes TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_different_reports CHECK (primary_report_id <> incoming_report_id)
);

-- Indexes for fast candidate lookups and joins
CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_primary
ON public.duplicate_candidates (primary_report_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_incoming
ON public.duplicate_candidates (incoming_report_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_status
ON public.duplicate_candidates (status);

CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_created_at
ON public.duplicate_candidates (created_at DESC);

-- Unique index to strictly prevent duplicate candidate pairs regardless of direction
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_candidate_pair
ON public.duplicate_candidates (
    LEAST(primary_report_id, incoming_report_id),
    GREATEST(primary_report_id, incoming_report_id)
);


-- 3. Row Level Security for Duplicate Candidates
--
-- Direct citizen access via PostgREST / Supabase client is strictly blocked.
-- RLS is enabled with no authenticated or anon policies, ensuring default-deny.
-- City-wide duplicate visibility and triage operations are mediated exclusively
-- through authenticated FastAPI backend endpoints using the service-role client.
-- This prevents direct client leakage of internal review notes and reviewer UUIDs.

ALTER TABLE public.duplicate_candidates ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE public.duplicate_candidates
FROM anon, authenticated;

-- Remove any direct client SELECT policy for duplicate candidates
DROP POLICY IF EXISTS "Authenticated users can view duplicate candidates"
ON public.duplicate_candidates;

-- Direct authenticated/anon SELECT, INSERT, UPDATE, and DELETE policies are intentionally omitted.
-- Backend service-role client maintains administrative access and bypasses RLS.
