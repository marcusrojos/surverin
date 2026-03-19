CREATE POLICY "Drivers can insert deliveries for their parcours"
ON public.deliveries
FOR INSERT
TO authenticated
WITH CHECK (
  driver_id = auth.uid()
  AND has_role(auth.uid(), 'livreur'::app_role)
);