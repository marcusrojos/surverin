DROP POLICY IF EXISTS "Admins view profiles in site" ON public.profiles;
CREATE POLICY "Admins view profiles in site" ON public.profiles
FOR SELECT USING (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND site_id IS NOT DISTINCT FROM get_user_site(auth.uid()))
);

DROP POLICY IF EXISTS "Admins update profiles in site" ON public.profiles;
CREATE POLICY "Admins update profiles in site" ON public.profiles
FOR UPDATE USING (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND site_id IS NOT DISTINCT FROM get_user_site(auth.uid()))
);

DROP POLICY IF EXISTS "Admins delete profiles in site" ON public.profiles;
CREATE POLICY "Admins delete profiles in site" ON public.profiles
FOR DELETE USING (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND site_id IS NOT DISTINCT FROM get_user_site(auth.uid()))
);