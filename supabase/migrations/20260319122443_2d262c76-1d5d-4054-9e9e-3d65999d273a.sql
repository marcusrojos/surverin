
-- Drivers can view their own parcours
CREATE POLICY "Drivers can view their parcours" ON public.parcours FOR SELECT TO authenticated USING (driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur'));

-- Drivers can update their own parcours (for inventory validation)
CREATE POLICY "Drivers can update their parcours" ON public.parcours FOR UPDATE TO authenticated USING (driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur'));

-- Drivers can view parcours_pharmacies for their parcours
CREATE POLICY "Drivers can view their parcours_pharmacies" ON public.parcours_pharmacies FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.parcours p WHERE p.id = parcours_id AND p.driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur')));

-- Drivers can view parcours_colis for their parcours
CREATE POLICY "Drivers can view their parcours_colis" ON public.parcours_colis FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.parcours p WHERE p.id = parcours_id AND p.driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur')));
