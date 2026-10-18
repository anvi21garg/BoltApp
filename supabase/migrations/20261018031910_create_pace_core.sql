/*
# Create PAce core workflow

1. New Tables
- `profiles`: one role-scoped account record per authenticated user, including display name and organisation.
- `pa_requests`: canonical prior authorisation cases owned by a patient and optionally assigned to a hospital or insurer.
- `documents`: private document metadata linked to a PA case.
- `document_requests`: persistent patient-to-hospital document requests.
- `pa_timeline`: shared audit timeline for each case.
2. Security
- Row level security is enabled on every table.
- Authenticated users can access their own profile and patient-owned cases.
- Hospital and insurer users can access assigned cases and related workflow records.
- Storage is not created here; document uploads in the first slice use metadata and can be connected to a private bucket later.
3. Important notes
- Roles are patient, hospital, or insurer and are selected during registration.
- Readiness and approval estimates are explicitly indicative values, not insurer decisions.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'hospital', 'insurer')),
  organisation_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pa_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL UNIQUE DEFAULT ('PA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hospital_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  insurer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  hospital_name text,
  insurer_name text,
  procedure_name text,
  diagnosis text,
  policy_number text,
  estimated_cost numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','COLLECTING_DOCUMENTS','HOSPITAL_REVIEW','PATIENT_APPROVAL','SUBMITTED','INSURER_REVIEW','APPROVED','DENIED','RESUBMISSION_REQUESTED')),
  readiness_score integer NOT NULL DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100),
  patient_approved_version integer,
  hospital_approved_version integer,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pa_id uuid NOT NULL REFERENCES public.pa_requests(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_type text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('application/pdf','image/jpeg','image/png')),
  file_size integer NOT NULL DEFAULT 0,
  storage_path text,
  status text NOT NULL DEFAULT 'Uploaded' CHECK (status IN ('Uploaded','Processing','Needs review','Accepted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pa_id uuid NOT NULL REFERENCES public.pa_requests(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Fulfilled','Unavailable')),
  response_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pa_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pa_id uuid NOT NULL REFERENCES public.pa_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pa_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pa_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "pa_select_participants" ON public.pa_requests;
CREATE POLICY "pa_select_participants" ON public.pa_requests FOR SELECT TO authenticated USING (patient_id = auth.uid() OR hospital_id = auth.uid() OR insurer_id = auth.uid());
DROP POLICY IF EXISTS "pa_insert_patient" ON public.pa_requests;
CREATE POLICY "pa_insert_patient" ON public.pa_requests FOR INSERT TO authenticated WITH CHECK (patient_id = auth.uid());
DROP POLICY IF EXISTS "pa_update_participants" ON public.pa_requests;
CREATE POLICY "pa_update_participants" ON public.pa_requests FOR UPDATE TO authenticated USING (patient_id = auth.uid() OR hospital_id = auth.uid() OR insurer_id = auth.uid()) WITH CHECK (patient_id = auth.uid() OR hospital_id = auth.uid() OR insurer_id = auth.uid());
DROP POLICY IF EXISTS "pa_delete_patient" ON public.pa_requests;
CREATE POLICY "pa_delete_patient" ON public.pa_requests FOR DELETE TO authenticated USING (patient_id = auth.uid());
DROP POLICY IF EXISTS "documents_select_participants" ON public.documents;
CREATE POLICY "documents_select_participants" ON public.documents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.pa_requests p WHERE p.id = pa_id AND (p.patient_id = auth.uid() OR p.hospital_id = auth.uid() OR p.insurer_id = auth.uid())));
DROP POLICY IF EXISTS "documents_insert_participants" ON public.documents;
CREATE POLICY "documents_insert_participants" ON public.documents FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() AND EXISTS (SELECT 1 FROM public.pa_requests p WHERE p.id = pa_id AND (p.patient_id = auth.uid() OR p.hospital_id = auth.uid() OR p.insurer_id = auth.uid())));
DROP POLICY IF EXISTS "documents_delete_uploader" ON public.documents;
CREATE POLICY "documents_delete_uploader" ON public.documents FOR DELETE TO authenticated USING (uploaded_by = auth.uid());
DROP POLICY IF EXISTS "requests_select_participants" ON public.document_requests;
CREATE POLICY "requests_select_participants" ON public.document_requests FOR SELECT TO authenticated USING (requested_by = auth.uid() OR assigned_to = auth.uid() OR EXISTS (SELECT 1 FROM public.pa_requests p WHERE p.id = pa_id AND p.patient_id = auth.uid()));
DROP POLICY IF EXISTS "requests_insert_patient" ON public.document_requests;
CREATE POLICY "requests_insert_patient" ON public.document_requests FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid() AND EXISTS (SELECT 1 FROM public.pa_requests p WHERE p.id = pa_id AND p.patient_id = auth.uid()));
DROP POLICY IF EXISTS "requests_update_participants" ON public.document_requests;
CREATE POLICY "requests_update_participants" ON public.document_requests FOR UPDATE TO authenticated USING (requested_by = auth.uid() OR assigned_to = auth.uid()) WITH CHECK (requested_by = auth.uid() OR assigned_to = auth.uid());
DROP POLICY IF EXISTS "timeline_select_participants" ON public.pa_timeline;
CREATE POLICY "timeline_select_participants" ON public.pa_timeline FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.pa_requests p WHERE p.id = pa_id AND (p.patient_id = auth.uid() OR p.hospital_id = auth.uid() OR p.insurer_id = auth.uid())));
DROP POLICY IF EXISTS "timeline_insert_participants" ON public.pa_timeline;
CREATE POLICY "timeline_insert_participants" ON public.pa_timeline FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.pa_requests p WHERE p.id = pa_id AND (p.patient_id = auth.uid() OR p.hospital_id = auth.uid() OR p.insurer_id = auth.uid())));

CREATE INDEX IF NOT EXISTS pa_requests_patient_id_idx ON public.pa_requests(patient_id);
CREATE INDEX IF NOT EXISTS pa_requests_status_idx ON public.pa_requests(status);
CREATE INDEX IF NOT EXISTS documents_pa_id_idx ON public.documents(pa_id);
CREATE INDEX IF NOT EXISTS document_requests_pa_id_idx ON public.document_requests(pa_id);
CREATE INDEX IF NOT EXISTS pa_timeline_pa_id_idx ON public.pa_timeline(pa_id);
