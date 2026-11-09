import { supabase, SUPABASE_BUCKETS } from '../lib/supabase';

/**
 * In-memory cache for signed URLs to prevent excessive Supabase Storage API calls.
 * Key: `${bucket}:${path}` -> { url: string; expiresAt: number }
 */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Converts a base64 Data URL (e.g. "data:image/jpeg;base64,...") to a binary Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  if (parts.length < 2) {
    throw new Error('Invalid Data URL: missing comma separator');
  }

  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binaryString = atob(parts[1]);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

/**
 * Generates user-scoped storage paths adhering to security policies:
 * {authenticated_user_id}/{report_id}/original.{ext}
 * {authenticated_user_id}/{report_id}/annotated.jpg
 */
export function generateStoragePaths(
  userId: string,
  reportId: string,
  originalFileName: string
): { originalPath: string; annotatedPath: string } {
  const ext = originalFileName.includes('.')
    ? originalFileName.split('.').pop()?.toLowerCase() || 'jpg'
    : 'jpg';

  const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';

  return {
    originalPath: `${userId}/${reportId}/original.${cleanExt}`,
    annotatedPath: `${userId}/${reportId}/annotated.jpg`,
  };
}

export interface UploadImagesParams {
  userId: string;
  reportId: string;
  originalFile: File | Blob;
  annotatedBase64?: string | null;
}

export interface UploadImagesResult {
  originalPath: string;
  annotatedPath: string | null;
}

/**
 * Uploads original and annotated photographs to their respective private Supabase storage buckets.
 * Implements atomic-like rollback: if annotated upload fails, the original upload is deleted.
 */
export async function uploadReportImages(
  params: UploadImagesParams
): Promise<UploadImagesResult> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { userId, reportId, originalFile, annotatedBase64 } = params;
  const originalFileName = originalFile instanceof File ? originalFile.name : 'original.jpg';
  const { originalPath, annotatedPath } = generateStoragePaths(userId, reportId, originalFileName);

  const originalMime = originalFile.type || 'image/jpeg';

  // 1. Upload Original Photograph
  const { error: origError } = await supabase.storage
    .from(SUPABASE_BUCKETS.ORIGINALS)
    .upload(originalPath, originalFile, {
      contentType: originalMime,
      upsert: false,
    });

  if (origError) {
    throw new Error(`Failed to upload original road photo: ${origError.message}`);
  }

  // 2. Upload Annotated Photograph (if available)
  if (annotatedBase64) {
    try {
      const annotatedBlob = dataUrlToBlob(annotatedBase64);
      const { error: annotError } = await supabase.storage
        .from(SUPABASE_BUCKETS.ANNOTATED)
        .upload(annotatedPath, annotatedBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (annotError) {
        // Rollback original upload to prevent orphaned files
        await supabase.storage.from(SUPABASE_BUCKETS.ORIGINALS).remove([originalPath]);
        throw new Error(`Failed to upload AI annotated photo: ${annotError.message}`);
      }

      return {
        originalPath,
        annotatedPath,
      };
    } catch (err) {
      // Clean up original file on any conversion/upload failure
      await supabase.storage.from(SUPABASE_BUCKETS.ORIGINALS).remove([originalPath]);
      throw err;
    }
  }

  return {
    originalPath,
    annotatedPath: null,
  };
}

/**
 * Cleans up uploaded storage objects (used for database insert rollback).
 */
export async function rollbackUploadedImages(
  paths: { originalPath?: string | null; annotatedPath?: string | null }
): Promise<void> {
  if (!supabase) return;

  const promises: Promise<unknown>[] = [];

  if (paths.originalPath) {
    promises.push(
      supabase.storage.from(SUPABASE_BUCKETS.ORIGINALS).remove([paths.originalPath])
    );
  }

  if (paths.annotatedPath) {
    promises.push(
      supabase.storage.from(SUPABASE_BUCKETS.ANNOTATED).remove([paths.annotatedPath])
    );
  }

  await Promise.allSettled(promises);
}

/**
 * Clears cached signed URLs from memory.
 * If bucket and path are specified, removes that specific object entry.
 * If only bucket is specified, removes entries for that bucket.
 * If neither is specified, purges the entire cache.
 */
export function clearSignedUrlCache(bucket?: string, path?: string): void {
  if (bucket && path) {
    signedUrlCache.delete(`${bucket}:${path}`);
  } else if (bucket) {
    for (const key of signedUrlCache.keys()) {
      if (key.startsWith(`${bucket}:`)) {
        signedUrlCache.delete(key);
      }
    }
  } else {
    signedUrlCache.clear();
  }
}

/**
 * Creates a short-lived signed URL for an object in a private Supabase bucket.
 * Uses an in-memory cache to minimize roundtrips.
 * Pass forceRefresh = true to bypass the cache and fetch a new signed URL.
 */
export async function getSignedImageUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
  forceRefresh = false
): Promise<string | null> {
  if (!supabase || !path) return null;

  const cacheKey = `${bucket}:${path}`;
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);

  // Return cached URL if not forcing refresh and it has at least 5 minutes remaining
  if (!forceRefresh && cached && cached.expiresAt > now + 300 * 1000) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return null;
    }

    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: now + expiresInSeconds * 1000,
    });

    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Generates signed URLs for both original and annotated paths of a report.
 */
export async function getReportSignedUrls(
  imagePath?: string | null,
  annotatedImagePath?: string | null,
  expiresInSeconds = 3600,
  forceRefresh = false
): Promise<{ originalUrl?: string; annotatedUrl?: string }> {
  const result: { originalUrl?: string; annotatedUrl?: string } = {};

  const promises: Promise<void>[] = [];

  if (imagePath) {
    promises.push(
      getSignedImageUrl(SUPABASE_BUCKETS.ORIGINALS, imagePath, expiresInSeconds, forceRefresh).then((url) => {
        if (url) result.originalUrl = url;
      })
    );
  }

  if (annotatedImagePath) {
    promises.push(
      getSignedImageUrl(SUPABASE_BUCKETS.ANNOTATED, annotatedImagePath, expiresInSeconds, forceRefresh).then(
        (url) => {
          if (url) result.annotatedUrl = url;
        }
      )
    );
  }

  await Promise.allSettled(promises);
  return result;
}
