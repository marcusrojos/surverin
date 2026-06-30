-- Allow deleting an axis: cascade its pharmacy associations and detach parcours

ALTER TABLE public.axis_pharmacies
  DROP CONSTRAINT IF EXISTS axis_pharmacies_axis_id_fkey;
ALTER TABLE public.axis_pharmacies
  ADD CONSTRAINT axis_pharmacies_axis_id_fkey
  FOREIGN KEY (axis_id) REFERENCES public.axes(id) ON DELETE CASCADE;

-- Make parcours.axis_id nullable so axis deletion detaches routes instead of being blocked
ALTER TABLE public.parcours ALTER COLUMN axis_id DROP NOT NULL;

ALTER TABLE public.parcours
  DROP CONSTRAINT IF EXISTS parcours_axis_id_fkey;
ALTER TABLE public.parcours
  ADD CONSTRAINT parcours_axis_id_fkey
  FOREIGN KEY (axis_id) REFERENCES public.axes(id) ON DELETE SET NULL;