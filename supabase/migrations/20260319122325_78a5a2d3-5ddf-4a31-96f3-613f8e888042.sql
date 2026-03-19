
-- Create parcours status enum
CREATE TYPE public.parcours_status AS ENUM ('en_attente_inventaire', 'en_cours', 'termine');

-- Main parcours table
CREATE TABLE public.parcours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  axis_id UUID NOT NULL REFERENCES public.axes(id) ON DELETE RESTRICT,
  driver_id UUID NOT NULL,
  status parcours_status NOT NULL DEFAULT 'en_attente_inventaire',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pharmacies in a parcours
CREATE TABLE public.parcours_pharmacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcours_id UUID NOT NULL REFERENCES public.parcours(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colis in a parcours, linked to a pharmacy
CREATE TABLE public.parcours_colis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcours_id UUID NOT NULL REFERENCES public.parcours(id) ON DELETE CASCADE,
  parcours_pharmacy_id UUID NOT NULL REFERENCES public.parcours_pharmacies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('carton', 'sachet', 'bac')),
  barcode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique barcode per parcours
CREATE UNIQUE INDEX parcours_colis_barcode_unique ON public.parcours_colis(parcours_id, barcode);

-- Updated_at trigger for parcours
CREATE TRIGGER update_parcours_updated_at
  BEFORE UPDATE ON public.parcours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.parcours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcours_pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcours_colis ENABLE ROW LEVEL SECURITY;

-- Admins full access on parcours
CREATE POLICY "Admins can select parcours" ON public.parcours FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert parcours" ON public.parcours FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update parcours" ON public.parcours FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete parcours" ON public.parcours FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admins full access on parcours_pharmacies
CREATE POLICY "Admins can select parcours_pharmacies" ON public.parcours_pharmacies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert parcours_pharmacies" ON public.parcours_pharmacies FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete parcours_pharmacies" ON public.parcours_pharmacies FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admins full access on parcours_colis
CREATE POLICY "Admins can select parcours_colis" ON public.parcours_colis FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert parcours_colis" ON public.parcours_colis FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete parcours_colis" ON public.parcours_colis FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
