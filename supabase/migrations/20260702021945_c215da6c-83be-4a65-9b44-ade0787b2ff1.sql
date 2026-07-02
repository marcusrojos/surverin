
-- Audit / history log: immutable event trail
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  actor_id uuid,
  actor_name text,
  site_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Read: super admins see everything, admins only their own site
CREATE POLICY "Audit logs readable by admins in scope"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin') AND site_id IS NOT DISTINCT FROM public.get_user_site(auth.uid()))
);

-- Insert allowed (writes come from SECURITY DEFINER triggers). No UPDATE/DELETE
-- policies exist, so audit rows are immutable and non-deletable for all app users.
CREATE POLICY "Audit logs insertable"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (true);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_site ON public.audit_logs (site_id);

-- Generic trigger function recording each change
CREATE OR REPLACE FUNCTION public.record_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec jsonb;
  old jsonb;
  v_action text;
  v_label text;
  v_site uuid;
  v_entity uuid;
  v_actor uuid;
  v_actor_name text;
BEGIN
  v_actor := auth.uid();

  IF TG_OP = 'DELETE' THEN
    rec := to_jsonb(OLD);
  ELSE
    rec := to_jsonb(NEW);
  END IF;

  v_entity := NULLIF(rec->>'id','')::uuid;
  v_label := COALESCE(rec->>'name', rec->>'full_name', rec->>'client_code', rec->>'barcode');
  v_site := NULLIF(rec->>'site_id','')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_action := 'creation';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'suppression';
  ELSE
    old := to_jsonb(OLD);
    IF (old ? 'is_active') AND (old->>'is_active') IS DISTINCT FROM (rec->>'is_active') THEN
      IF (rec->>'is_active')::boolean = false THEN
        v_action := 'desactivation';
      ELSE
        v_action := 'reactivation';
      END IF;
    ELSE
      v_action := 'modification';
    END IF;
  END IF;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE user_id = v_actor LIMIT 1;

  INSERT INTO public.audit_logs(action, entity_type, entity_id, entity_label, actor_id, actor_name, site_id)
  VALUES (v_action, TG_TABLE_NAME, v_entity, v_label, v_actor, v_actor_name, v_site);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Attach to management entities
CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.record_audit();
CREATE TRIGGER audit_pharmacies AFTER INSERT OR UPDATE OR DELETE ON public.pharmacies
  FOR EACH ROW EXECUTE FUNCTION public.record_audit();
CREATE TRIGGER audit_parcours AFTER INSERT OR UPDATE OR DELETE ON public.parcours
  FOR EACH ROW EXECUTE FUNCTION public.record_audit();
CREATE TRIGGER audit_axes AFTER INSERT OR UPDATE OR DELETE ON public.axes
  FOR EACH ROW EXECUTE FUNCTION public.record_audit();
CREATE TRIGGER audit_sites AFTER INSERT OR UPDATE OR DELETE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.record_audit();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.record_audit();
