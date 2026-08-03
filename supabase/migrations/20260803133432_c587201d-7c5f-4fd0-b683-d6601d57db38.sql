CREATE TABLE public.user_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  role public.app_role NOT NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  identifier text NOT NULL,
  password_encrypted text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.user_credentials TO service_role;

ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: this table is only reachable by
-- server-side functions running with the service role.

CREATE TRIGGER update_user_credentials_updated_at
BEFORE UPDATE ON public.user_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_credentials_site ON public.user_credentials(site_id);