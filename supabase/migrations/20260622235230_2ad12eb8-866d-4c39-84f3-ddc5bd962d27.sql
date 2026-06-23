
-- ============ SITES TABLE ============
CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SITE_ID COLUMNS ============
ALTER TABLE public.profiles   ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.axes       ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.parcours   ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

-- ============ DEFAULT SITE + BACKFILL ============
DO $$
DECLARE s uuid;
BEGIN
  INSERT INTO public.sites(name) VALUES ('Site Principal') RETURNING id INTO s;
  UPDATE public.profiles   SET site_id = s WHERE site_id IS NULL;
  UPDATE public.pharmacies SET site_id = s WHERE site_id IS NULL;
  UPDATE public.axes       SET site_id = s WHERE site_id IS NULL;
  UPDATE public.parcours   SET site_id = s WHERE site_id IS NULL;
  UPDATE public.deliveries SET site_id = s WHERE site_id IS NULL;
END $$;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.get_user_site(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT site_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.admin_can_access_site(_uid uuid, _site uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_uid)
    OR (public.has_role(_uid, 'admin') AND _site IS NOT DISTINCT FROM public.get_user_site(_uid))
$$;

CREATE OR REPLACE FUNCTION public.admin_can_access_parcours(_uid uuid, _parcours uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_uid)
    OR (public.has_role(_uid, 'admin') AND EXISTS (
      SELECT 1 FROM public.parcours p WHERE p.id = _parcours AND p.site_id = public.get_user_site(_uid)))
$$;

CREATE OR REPLACE FUNCTION public.admin_can_access_pharmacy(_uid uuid, _pharmacy uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_uid)
    OR (public.has_role(_uid, 'admin') AND EXISTS (
      SELECT 1 FROM public.pharmacies p WHERE p.id = _pharmacy AND p.site_id = public.get_user_site(_uid)))
$$;

CREATE OR REPLACE FUNCTION public.admin_can_access_axis(_uid uuid, _axis uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_uid)
    OR (public.has_role(_uid, 'admin') AND EXISTS (
      SELECT 1 FROM public.axes a WHERE a.id = _axis AND a.site_id = public.get_user_site(_uid)))
$$;

-- ============ SITES POLICIES ============
CREATE POLICY "Super admins manage sites" ON public.sites FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Admins view their site" ON public.sites FOR SELECT TO authenticated
  USING (id = public.get_user_site(auth.uid()));

-- ============ PHARMACIES ============
DROP POLICY IF EXISTS "Admins can delete pharmacies" ON public.pharmacies;
DROP POLICY IF EXISTS "Admins can insert pharmacies" ON public.pharmacies;
DROP POLICY IF EXISTS "Admins can update pharmacies" ON public.pharmacies;
DROP POLICY IF EXISTS "Authenticated users can view pharmacies" ON public.pharmacies;

CREATE POLICY "Admins delete pharmacies in site" ON public.pharmacies FOR DELETE TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins insert pharmacies in site" ON public.pharmacies FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins update pharmacies in site" ON public.pharmacies FOR UPDATE TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id))
  WITH CHECK (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins view pharmacies in site" ON public.pharmacies FOR SELECT TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Drivers view pharmacies" ON public.pharmacies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'livreur'));

-- ============ AXES ============
DROP POLICY IF EXISTS "Admins can delete axes" ON public.axes;
DROP POLICY IF EXISTS "Admins can insert axes" ON public.axes;
DROP POLICY IF EXISTS "Admins can update axes" ON public.axes;
DROP POLICY IF EXISTS "Admins can view all axes" ON public.axes;

CREATE POLICY "Admins delete axes in site" ON public.axes FOR DELETE TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins insert axes in site" ON public.axes FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins update axes in site" ON public.axes FOR UPDATE TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id))
  WITH CHECK (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins view axes in site" ON public.axes FOR SELECT TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id));

-- ============ PARCOURS ============
DROP POLICY IF EXISTS "Admins can delete parcours" ON public.parcours;
DROP POLICY IF EXISTS "Admins can insert parcours" ON public.parcours;
DROP POLICY IF EXISTS "Admins can select parcours" ON public.parcours;
DROP POLICY IF EXISTS "Admins can update parcours" ON public.parcours;

CREATE POLICY "Admins delete parcours in site" ON public.parcours FOR DELETE TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins insert parcours in site" ON public.parcours FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins select parcours in site" ON public.parcours FOR SELECT TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins update parcours in site" ON public.parcours FOR UPDATE TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id))
  WITH CHECK (public.admin_can_access_site(auth.uid(), site_id));

-- ============ DELIVERIES ============
DROP POLICY IF EXISTS "Admins can delete deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Admins can insert deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Admins can update deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Admins can view all deliveries" ON public.deliveries;

CREATE POLICY "Admins delete deliveries in site" ON public.deliveries FOR DELETE TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins insert deliveries in site" ON public.deliveries FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins update deliveries in site" ON public.deliveries FOR UPDATE TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id))
  WITH CHECK (public.admin_can_access_site(auth.uid(), site_id));
CREATE POLICY "Admins view deliveries in site" ON public.deliveries FOR SELECT TO authenticated
  USING (public.admin_can_access_site(auth.uid(), site_id));

-- ============ PROFILES ============
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow initial or admin profile creation" ON public.profiles;

CREATE POLICY "Admins delete profiles in site" ON public.profiles FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(), 'admin') AND site_id = public.get_user_site(auth.uid())));
CREATE POLICY "Admins update profiles in site" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(), 'admin') AND site_id = public.get_user_site(auth.uid())));
CREATE POLICY "Admins view profiles in site" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(), 'admin') AND site_id = public.get_user_site(auth.uid())));
CREATE POLICY "Allow initial or admin profile creation" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR (NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role IN ('admin','super_admin')))
    OR (auth.uid() = user_id)
  );

-- ============ AXIS_PHARMACIES ============
DROP POLICY IF EXISTS "Admins can delete axis_pharmacies" ON public.axis_pharmacies;
DROP POLICY IF EXISTS "Admins can insert axis_pharmacies" ON public.axis_pharmacies;
DROP POLICY IF EXISTS "Admins can update axis_pharmacies" ON public.axis_pharmacies;
DROP POLICY IF EXISTS "Admins can view axis_pharmacies" ON public.axis_pharmacies;

CREATE POLICY "Admins delete axis_pharmacies in site" ON public.axis_pharmacies FOR DELETE TO authenticated
  USING (public.admin_can_access_axis(auth.uid(), axis_id));
CREATE POLICY "Admins insert axis_pharmacies in site" ON public.axis_pharmacies FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_axis(auth.uid(), axis_id));
CREATE POLICY "Admins update axis_pharmacies in site" ON public.axis_pharmacies FOR UPDATE TO authenticated
  USING (public.admin_can_access_axis(auth.uid(), axis_id));
CREATE POLICY "Admins view axis_pharmacies in site" ON public.axis_pharmacies FOR SELECT TO authenticated
  USING (public.admin_can_access_axis(auth.uid(), axis_id));

-- ============ PARCOURS_PHARMACIES ============
DROP POLICY IF EXISTS "Admins can delete parcours_pharmacies" ON public.parcours_pharmacies;
DROP POLICY IF EXISTS "Admins can insert parcours_pharmacies" ON public.parcours_pharmacies;
DROP POLICY IF EXISTS "Admins can select parcours_pharmacies" ON public.parcours_pharmacies;

CREATE POLICY "Admins delete parcours_pharmacies in site" ON public.parcours_pharmacies FOR DELETE TO authenticated
  USING (public.admin_can_access_parcours(auth.uid(), parcours_id));
CREATE POLICY "Admins insert parcours_pharmacies in site" ON public.parcours_pharmacies FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_parcours(auth.uid(), parcours_id));
CREATE POLICY "Admins select parcours_pharmacies in site" ON public.parcours_pharmacies FOR SELECT TO authenticated
  USING (public.admin_can_access_parcours(auth.uid(), parcours_id));

-- ============ PARCOURS_COLIS ============
DROP POLICY IF EXISTS "Admins can delete parcours_colis" ON public.parcours_colis;
DROP POLICY IF EXISTS "Admins can insert parcours_colis" ON public.parcours_colis;
DROP POLICY IF EXISTS "Admins can select parcours_colis" ON public.parcours_colis;

CREATE POLICY "Admins delete parcours_colis in site" ON public.parcours_colis FOR DELETE TO authenticated
  USING (public.admin_can_access_parcours(auth.uid(), parcours_id));
CREATE POLICY "Admins insert parcours_colis in site" ON public.parcours_colis FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_parcours(auth.uid(), parcours_id));
CREATE POLICY "Admins select parcours_colis in site" ON public.parcours_colis FOR SELECT TO authenticated
  USING (public.admin_can_access_parcours(auth.uid(), parcours_id));

-- ============ PARCOURS_INVENTAIRE ============
DROP POLICY IF EXISTS "Admins can delete parcours_inventaire" ON public.parcours_inventaire;
DROP POLICY IF EXISTS "Admins can insert parcours_inventaire" ON public.parcours_inventaire;
DROP POLICY IF EXISTS "Admins can select parcours_inventaire" ON public.parcours_inventaire;
DROP POLICY IF EXISTS "Admins can update parcours_inventaire" ON public.parcours_inventaire;

CREATE POLICY "Admins delete parcours_inventaire in site" ON public.parcours_inventaire FOR DELETE TO authenticated
  USING (public.admin_can_access_parcours(auth.uid(), parcours_id));
CREATE POLICY "Admins insert parcours_inventaire in site" ON public.parcours_inventaire FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_parcours(auth.uid(), parcours_id));
CREATE POLICY "Admins select parcours_inventaire in site" ON public.parcours_inventaire FOR SELECT TO authenticated
  USING (public.admin_can_access_parcours(auth.uid(), parcours_id));
CREATE POLICY "Admins update parcours_inventaire in site" ON public.parcours_inventaire FOR UPDATE TO authenticated
  USING (public.admin_can_access_parcours(auth.uid(), parcours_id));

-- ============ PARCOURS_INVENTAIRE_SCANS ============
DROP POLICY IF EXISTS "Admins can delete parcours_inventaire_scans" ON public.parcours_inventaire_scans;
DROP POLICY IF EXISTS "Admins can insert parcours_inventaire_scans" ON public.parcours_inventaire_scans;
DROP POLICY IF EXISTS "Admins can select parcours_inventaire_scans" ON public.parcours_inventaire_scans;

CREATE POLICY "Admins delete inv_scans in site" ON public.parcours_inventaire_scans FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND EXISTS (
    SELECT 1 FROM public.parcours_inventaire pi JOIN public.parcours p ON p.id = pi.parcours_id
    WHERE pi.id = parcours_inventaire_scans.inventaire_id AND p.site_id = public.get_user_site(auth.uid()))));
CREATE POLICY "Admins insert inv_scans in site" ON public.parcours_inventaire_scans FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND EXISTS (
    SELECT 1 FROM public.parcours_inventaire pi JOIN public.parcours p ON p.id = pi.parcours_id
    WHERE pi.id = parcours_inventaire_scans.inventaire_id AND p.site_id = public.get_user_site(auth.uid()))));
CREATE POLICY "Admins select inv_scans in site" ON public.parcours_inventaire_scans FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND EXISTS (
    SELECT 1 FROM public.parcours_inventaire pi JOIN public.parcours p ON p.id = pi.parcours_id
    WHERE pi.id = parcours_inventaire_scans.inventaire_id AND p.site_id = public.get_user_site(auth.uid()))));

-- ============ PHARMACY_BACS_BALANCE ============
DROP POLICY IF EXISTS "Admins can delete pharmacy_bacs_balance" ON public.pharmacy_bacs_balance;
DROP POLICY IF EXISTS "Admins can insert pharmacy_bacs_balance" ON public.pharmacy_bacs_balance;
DROP POLICY IF EXISTS "Admins can select pharmacy_bacs_balance" ON public.pharmacy_bacs_balance;
DROP POLICY IF EXISTS "Admins can update pharmacy_bacs_balance" ON public.pharmacy_bacs_balance;

CREATE POLICY "Admins delete bacs_balance in site" ON public.pharmacy_bacs_balance FOR DELETE TO authenticated
  USING (public.admin_can_access_pharmacy(auth.uid(), pharmacy_id));
CREATE POLICY "Admins insert bacs_balance in site" ON public.pharmacy_bacs_balance FOR INSERT TO authenticated
  WITH CHECK (public.admin_can_access_pharmacy(auth.uid(), pharmacy_id));
CREATE POLICY "Admins select bacs_balance in site" ON public.pharmacy_bacs_balance FOR SELECT TO authenticated
  USING (public.admin_can_access_pharmacy(auth.uid(), pharmacy_id));
CREATE POLICY "Admins update bacs_balance in site" ON public.pharmacy_bacs_balance FOR UPDATE TO authenticated
  USING (public.admin_can_access_pharmacy(auth.uid(), pharmacy_id));
