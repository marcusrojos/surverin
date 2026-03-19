
-- Add force confirmation tracking to parcours
ALTER TABLE public.parcours
  ADD COLUMN force_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN force_confirmed_by UUID,
  ADD COLUMN force_confirmed_at TIMESTAMPTZ,
  ADD COLUMN force_confirmed_reason TEXT;
