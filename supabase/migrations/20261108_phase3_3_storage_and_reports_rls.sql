
-- ==============================================================================
-- Pothole Reporter - Phase 3.3
-- Reports: visible to all authenticated citizens.
-- Images: private and restricted to each citizen's own UUID folder.
-- ==============================================================================

-- 1. Reports table
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_reports_user_id
ON public.reports (user_id);

CREATE INDEX IF NOT EXISTS idx_reports_status
ON public.reports (status);

CREATE INDEX IF NOT EXISTS idx_reports_priority
ON public.reports (priority);

CREATE INDEX IF NOT EXISTS idx_reports_created_at
ON public.reports (created_at DESC);


-- 2. Reports RLS policies

-- All authenticated citizens can view city-wide reports.
DROP POLICY IF EXISTS "Citizens can view their own reports"
ON public.reports;

DROP POLICY IF EXISTS "Authenticated users can view reports"
ON public.reports;

CREATE POLICY "Authenticated users can view reports"
ON public.reports
FOR SELECT
TO authenticated
USING (true);


-- Citizens can submit reports only under their own user ID.
DROP POLICY IF EXISTS "Citizens can insert reports under their own user ID"
ON public.reports;

DROP POLICY IF EXISTS "Citizens can submit their own reports"
ON public.reports;

CREATE POLICY "Citizens can submit their own reports"
ON public.reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);


-- 3. Private Storage policies

-- Upload only to the authenticated citizen's own folder.
DROP POLICY IF EXISTS "Citizens can upload original photos to their folder"
ON storage.objects;

DROP POLICY IF EXISTS "Citizens can upload their own pothole images"
ON storage.objects;

CREATE POLICY "Citizens can upload their own pothole images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id IN ('pothole-originals', 'pothole-annotated')
    AND (storage.foldername(name))[1] = auth.uid()::text
);


-- View/download only images in the citizen's own folder.
DROP POLICY IF EXISTS "Authenticated users can read pothole images"
ON storage.objects;

DROP POLICY IF EXISTS "Citizens can read their own images"
ON storage.objects;

DROP POLICY IF EXISTS "Citizens can view their own pothole images"
ON storage.objects;

CREATE POLICY "Citizens can view their own pothole images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id IN ('pothole-originals', 'pothole-annotated')
    AND (storage.foldername(name))[1] = auth.uid()::text
);


-- Delete only images in the citizen's own folder.
DROP POLICY IF EXISTS "Citizens can delete their own images"
ON storage.objects;

DROP POLICY IF EXISTS "Citizens can delete their own pothole images"
ON storage.objects;

CREATE POLICY "Citizens can delete their own pothole images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id IN ('pothole-originals', 'pothole-annotated')
    AND (storage.foldername(name))[1] = auth.uid()::text
);
