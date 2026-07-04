
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS has_verification_code boolean
  GENERATED ALWAYS AS (verification_code IS NOT NULL) STORED;
