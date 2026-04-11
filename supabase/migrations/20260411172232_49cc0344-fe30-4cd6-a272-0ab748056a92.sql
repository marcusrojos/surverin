
-- Add bacs recovery columns to deliveries
ALTER TABLE public.deliveries
ADD COLUMN bacs_to_recover integer NOT NULL DEFAULT 0,
ADD COLUMN bacs_recovered integer NOT NULL DEFAULT 0;

-- Create pharmacy bacs balance table
CREATE TABLE public.pharmacy_bacs_balance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  pending_bacs integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(pharmacy_id)
);

ALTER TABLE public.pharmacy_bacs_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select pharmacy_bacs_balance"
ON public.pharmacy_bacs_balance FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert pharmacy_bacs_balance"
ON public.pharmacy_bacs_balance FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pharmacy_bacs_balance"
ON public.pharmacy_bacs_balance FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pharmacy_bacs_balance"
ON public.pharmacy_bacs_balance FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Drivers can select pharmacy_bacs_balance"
ON public.pharmacy_bacs_balance FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'livreur'::app_role));

CREATE POLICY "Drivers can insert pharmacy_bacs_balance"
ON public.pharmacy_bacs_balance FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'livreur'::app_role));

CREATE POLICY "Drivers can update pharmacy_bacs_balance"
ON public.pharmacy_bacs_balance FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'livreur'::app_role));
