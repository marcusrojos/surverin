
-- Add geolocation columns to pharmacies
ALTER TABLE public.pharmacies
ADD COLUMN latitude double precision DEFAULT NULL,
ADD COLUMN longitude double precision DEFAULT NULL,
ADD COLUMN location_source text DEFAULT NULL;

-- Add driver delivery geolocation columns to deliveries
ALTER TABLE public.deliveries
ADD COLUMN driver_latitude double precision DEFAULT NULL,
ADD COLUMN driver_longitude double precision DEFAULT NULL;
