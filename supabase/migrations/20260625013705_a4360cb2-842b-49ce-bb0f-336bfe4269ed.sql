-- Allow super admins to view, update, delete and create user roles (same as admins)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow initial or admin role creation" ON public.user_roles;
CREATE POLICY "Allow initial or admin role creation"
ON public.user_roles
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.is_super_admin(auth.uid())
  OR ((NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role = 'admin')) AND auth.uid() = user_id)
);