-- ============================================================
-- Quantum Jersey — Free-Text Customer Reviews Schema Migration
-- Migration: 20261021_freetext_product_reviews.sql
-- ============================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor)
--
-- This additive, backward-compatible migration:
-- 1. Makes 'product_id' nullable in public.reviews to allow reviews
--    for older, discontinued, or offline items not in the current catalogue.
-- 2. Adds 'product_name' TEXT column to public.reviews to store the
--    exact customer-entered product name.
-- 3. Adds constraints to validate product_name length and ensure at least
--    one product identifier (product_id or product_name) is provided.
-- 4. Updates RLS policies to maintain strict public insert isolation:
--    - status must be 'pending'
--    - is_verified_purchase must be false
--    - review_source must be 'website_order' or 'previous_customer'
--    - at least one of product_id or product_name must be present.
-- ============================================================

-- ─── 1. Allow Nullable product_id ────────────────────────────
ALTER TABLE public.reviews
  ALTER COLUMN product_id DROP NOT NULL;

-- ─── 2. Add product_name Column ──────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS product_name TEXT;

-- ─── 3. Add Constraints for Free-Text Product Name ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_product_name_check'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_product_name_check
      CHECK (product_name IS NULL OR (length(trim(product_name)) > 0 AND length(product_name) <= 150));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_product_identifier_check'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_product_identifier_check
      CHECK (product_id IS NOT NULL OR product_name IS NOT NULL);
  END IF;
END $$;

-- ─── 4. Performance Indexes ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reviews_product_name ON public.reviews(product_name);

-- ─── 5. Update Public Insert RLS Policy ──────────────────────
DROP POLICY IF EXISTS "Public insert pending reviews" ON public.reviews;

CREATE POLICY "Public insert pending reviews"
  ON public.reviews
  FOR INSERT
  WITH CHECK (
    status = 'pending' AND
    is_verified_purchase = false AND
    review_source IN ('website_order', 'previous_customer') AND
    (product_id IS NOT NULL OR product_name IS NOT NULL)
  );

-- ─── 6. Maintain Admin Update / Delete Policies ──────────────
DROP POLICY IF EXISTS "Admin update reviews" ON public.reviews;

CREATE POLICY "Admin update reviews"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete reviews" ON public.reviews;

CREATE POLICY "Admin delete reviews"
  ON public.reviews
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
