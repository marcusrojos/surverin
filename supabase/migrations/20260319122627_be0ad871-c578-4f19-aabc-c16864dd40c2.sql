
-- Inventory record per parcours
CREATE TABLE public.parcours_inventaire (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcours_id UUID NOT NULL REFERENCES public.parcours(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours', 'valide', 'ignore')),
  total_expected INTEGER NOT NULL DEFAULT 0,
  total_scanned INTEGER NOT NULL DEFAULT 0,
  total_missing INTEGER NOT NULL DEFAULT 0,
  total_extra INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual scanned items
CREATE TABLE public.parcours_inventaire_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventaire_id UUID NOT NULL REFERENCES public.parcours_inventaire(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'matched' CHECK (status IN ('matched', 'missing', 'extra')),
  pharmacy_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger
CREATE TRIGGER update_parcours_inventaire_updated_at
  BEFORE UPDATE ON public.parcours_inventaire
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.parcours_inventaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcours_inventaire_scans ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY "Admins can select parcours_inventaire" ON public.parcours_inventaire FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert parcours_inventaire" ON public.parcours_inventaire FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update parcours_inventaire" ON public.parcours_inventaire FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete parcours_inventaire" ON public.parcours_inventaire FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can select parcours_inventaire_scans" ON public.parcours_inventaire_scans FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert parcours_inventaire_scans" ON public.parcours_inventaire_scans FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete parcours_inventaire_scans" ON public.parcours_inventaire_scans FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Driver policies
CREATE POLICY "Drivers can view their inventaire" ON public.parcours_inventaire FOR SELECT TO authenticated
  USING (driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur'));
CREATE POLICY "Drivers can insert their inventaire" ON public.parcours_inventaire FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur'));
CREATE POLICY "Drivers can update their inventaire" ON public.parcours_inventaire FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur'));

CREATE POLICY "Drivers can view their inventaire_scans" ON public.parcours_inventaire_scans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parcours_inventaire pi WHERE pi.id = inventaire_id AND pi.driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur')));
CREATE POLICY "Drivers can insert their inventaire_scans" ON public.parcours_inventaire_scans FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.parcours_inventaire pi WHERE pi.id = inventaire_id AND pi.driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur')));
CREATE POLICY "Drivers can delete their inventaire_scans" ON public.parcours_inventaire_scans FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parcours_inventaire pi WHERE pi.id = inventaire_id AND pi.driver_id = auth.uid() AND public.has_role(auth.uid(), 'livreur')));
