-- ============================================================
-- Quantum Jersey — Previous Customer Reviews Schema Migration
-- ============================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor)
--
-- This additive, idempotent migration:
-- 1. Adds 'review_source' column to public.reviews to distinguish
--    website orders from historical/offline purchases.
-- 2. Adds 'purchase_details' column for optional previous customer verification notes.
-- 3. Hardens RLS to guarantee public submissions are strictly unverified pending reviews.
-- 4. Preserves all existing reviews, foreign keys, and indexes.
-- ============================================================

-- ─── 1. Add Additive Columns ─────────────────────────────────

-- Add review_source column (default: 'website_order')
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS review_source TEXT NOT NULL DEFAULT 'website_order';

-- Add check constraint on review_source if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_review_source_check'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_review_source_check
      CHECK (review_source IN ('website_order', 'previous_customer'));
  END IF;
END $$;

-- Add purchase_details column for historical offline purchase notes
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS purchase_details TEXT;

-- Index for speedy filtering by review_source
CREATE INDEX IF NOT EXISTS idx_reviews_review_source ON public.reviews(review_source);


-- ─── 2. Harden Public Insert RLS Policy ───────────────────────

-- Drop old public insert policy
DROP POLICY IF EXISTS "Public insert pending reviews" ON public.reviews;

-- Recreate public insert policy with strict security:
-- - status must be 'pending'
-- - is_verified_purchase must be false (admin must verify before setting true)
-- - review_source must be a valid source ('website_order' or 'previous_customer')
CREATE POLICY "Public insert pending reviews"
  ON public.reviews
  FOR INSERT
  WITH CHECK (
    status = 'pending' AND
    is_verified_purchase = false AND
    review_source IN ('website_order', 'previous_customer')
  );


-- ─── 3. Ensure Admin Update Policy Allows Verification ────────

DROP POLICY IF EXISTS "Admin update reviews" ON public.reviews;

CREATE POLICY "Admin update reviews"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
