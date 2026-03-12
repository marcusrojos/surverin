-- Fix duplicate client codes first
UPDATE public.pharmacies SET client_code = 'Rm005-2' WHERE id = '1d09aee7-99d2-40ca-b5a6-235f91dc48b3' AND client_code = 'Rm005';
UPDATE public.pharmacies SET client_code = 'Rm007-2' WHERE id = 'fd257102-80d4-431d-9138-3aba5f706708' AND client_code = 'Rm007';

-- Add unique constraint
ALTER TABLE public.pharmacies ADD CONSTRAINT pharmacies_client_code_unique UNIQUE (client_code);