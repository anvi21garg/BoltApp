/*
# Add private PAce document storage

1. Storage
- Creates a private `pace-documents` bucket for PA-related PDFs and images.
- Keeps uploaded files private and tied to the authenticated uploader's folder.
2. Security
- Authenticated users may upload and view files only inside their own user-id folder.
- Authenticated users may delete only files in their own folder.
3. Important notes
- File type and size are validated in the interface before upload.
- The bucket is private; files are never exposed through a public URL.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('pace-documents', 'pace-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pace_upload_own_documents" ON storage.objects;
CREATE POLICY "pace_upload_own_documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pace-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "pace_read_own_documents" ON storage.objects;
CREATE POLICY "pace_read_own_documents" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pace-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "pace_delete_own_documents" ON storage.objects;
CREATE POLICY "pace_delete_own_documents" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pace-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
