
-- 1. Pharmacies: restrict drivers to their own site
DROP POLICY IF EXISTS "Drivers view pharmacies" ON public.pharmacies;
CREATE POLICY "Drivers view pharmacies" ON public.pharmacies
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'livreur'::app_role)
    AND site_id IS NOT DISTINCT FROM get_user_site(auth.uid())
  );

-- 2. Delivery receipts storage: restrict read/insert/update to involved parties
DROP POLICY IF EXISTS "Anyone can read receipts" ON storage.objects;
CREATE POLICY "Receipts readable by involved parties" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-receipts'
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id::text = replace(replace(storage.objects.name, 'bon-livraison-', ''), '.pdf', '')
        AND (
          d.driver_id = auth.uid()
          OR admin_can_access_site(auth.uid(), d.site_id)
          OR EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = d.pharmacy_id AND p.user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
CREATE POLICY "Drivers upload their receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-receipts'
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id::text = replace(replace(storage.objects.name, 'bon-livraison-', ''), '.pdf', '')
        AND d.driver_id = auth.uid()
    )
  );

CREATE POLICY "Drivers update their receipts" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'delivery-receipts'
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id::text = replace(replace(storage.objects.name, 'bon-livraison-', ''), '.pdf', '')
        AND d.driver_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'delivery-receipts'
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id::text = replace(replace(storage.objects.name, 'bon-livraison-', ''), '.pdf', '')
        AND d.driver_id = auth.uid()
    )
  );

-- 3. user_roles: remove privilege-escalation bootstrap path (bootstrap handled server-side)
DROP POLICY IF EXISTS "Allow initial or admin role creation" ON public.user_roles;
CREATE POLICY "Admins can create roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

-- 4. audit_logs: replace always-true insert policy
DROP POLICY IF EXISTS "Audit logs insertable" ON public.audit_logs;
CREATE POLICY "Audit logs insertable" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- 5. Remove plaintext password column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS plain_password;

-- 6. Restrict execution of internal-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.generate_verification_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_client_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_audit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
