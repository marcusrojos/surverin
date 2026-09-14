ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.parcours REPLICA IDENTITY FULL;
ALTER TABLE public.parcours_pharmacies REPLICA IDENTITY FULL;
ALTER TABLE public.parcours_colis REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='deliveries') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='parcours') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parcours;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='parcours_pharmacies') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parcours_pharmacies;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='parcours_colis') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parcours_colis;
  END IF;
END $$;