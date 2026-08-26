-- ============================================================
-- Quantum Jersey — Supabase Database & Storage Security Hardening
-- ============================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor)
--
-- This script:
-- 1. Creates an is_admin() security helper function.
-- 2. Hardens public.products RLS policies (SELECT: public, INSERT/UPDATE/DELETE: admin only).
-- 3. Hardens storage.objects RLS policies for the 'product-images' bucket (SELECT: public, mutations: admin only).
-- ============================================================

-- ─── 1. Admin Role Helper Function ───────────────────────────
-- Strictly checks if the authenticated user has the 'admin' role
-- inside their JWT app_metadata (auth.jwt() -> 'app_metadata' ->> 'role').
-- No email pattern matching or substring fallbacks.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 2. Products Table RLS Hardening ─────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Drop existing legacy policies if present
DROP POLICY IF EXISTS "Public read" ON public.products;
DROP POLICY IF EXISTS "Admin insert" ON public.products;
DROP POLICY IF EXISTS "Admin update" ON public.products;
DROP POLICY IF EXISTS "Admin delete" ON public.products;
DROP POLICY IF EXISTS "Public select products" ON public.products;
DROP POLICY IF EXISTS "Admin insert products" ON public.products;
DROP POLICY IF EXISTS "Admin update products" ON public.products;
DROP POLICY IF EXISTS "Admin delete products" ON public.products;

-- Allow public read access to all in-stock and active products
CREATE POLICY "Public select products"
  ON public.products
  FOR SELECT
  USING (true);

-- Restrict product creation strictly to authorized administrators
CREATE POLICY "Admin insert products"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Restrict product updates strictly to authorized administrators
CREATE POLICY "Admin update products"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Restrict product deletion strictly to authorized administrators
CREATE POLICY "Admin delete products"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ─── 3. Storage Bucket & Policy Hardening ────────────────────
-- Ensure the bucket exists and is marked as Public for fast edge CDN retrieval
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760, -- 10 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- Drop existing legacy storage policies if present
DROP POLICY IF EXISTS "Public Read Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Overwrite Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete" ON storage.objects;

-- Allow public read/download access to product images
CREATE POLICY "Public Read Product Images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

-- Restrict image uploads strictly to administrators
CREATE POLICY "Admin Upload Product Images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
  );

-- Restrict image overwrite strictly to administrators
CREATE POLICY "Admin Overwrite Product Images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
  );

-- Restrict image deletion strictly to administrators
CREATE POLICY "Admin Delete Product Images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_admin()
  );
