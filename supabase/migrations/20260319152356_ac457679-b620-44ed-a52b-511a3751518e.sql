-- Add parcours_id column to deliveries table
ALTER TABLE public.deliveries ADD COLUMN parcours_id uuid REFERENCES public.parcours(id) ON DELETE SET NULL;

-- Create index for fast lookup
CREATE INDEX idx_deliveries_parcours_id ON public.deliveries(parcours_id);
