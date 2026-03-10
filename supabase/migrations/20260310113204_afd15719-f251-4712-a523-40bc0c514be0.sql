
-- Create storage bucket for delivery receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('delivery-receipts', 'delivery-receipts', true);

-- Add receipt_pdf_url column to deliveries
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS receipt_pdf_url text DEFAULT NULL;

-- Storage policies: allow authenticated users to upload and read
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'delivery-receipts');

CREATE POLICY "Anyone can read receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'delivery-receipts');
