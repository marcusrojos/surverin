CREATE OR REPLACE FUNCTION public.admin_can_access_axis(_uid uuid, _axis uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_uid)
    OR (public.has_role(_uid, 'admin') AND EXISTS (
      SELECT 1 FROM public.axes a
      WHERE a.id = _axis
        AND a.site_id IS NOT DISTINCT FROM public.get_user_site(_uid)))
$function$;

CREATE OR REPLACE FUNCTION public.admin_can_access_pharmacy(_uid uuid, _pharmacy uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_uid)
    OR (public.has_role(_uid, 'admin') AND EXISTS (
      SELECT 1 FROM public.pharmacies p
      WHERE p.id = _pharmacy
        AND p.site_id IS NOT DISTINCT FROM public.get_user_site(_uid)))
$function$;

CREATE OR REPLACE FUNCTION public.admin_can_access_parcours(_uid uuid, _parcours uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_uid)
    OR (public.has_role(_uid, 'admin') AND EXISTS (
      SELECT 1 FROM public.parcours p
      WHERE p.id = _parcours
        AND p.site_id IS NOT DISTINCT FROM public.get_user_site(_uid)))
$function$;