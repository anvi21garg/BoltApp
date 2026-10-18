/*
# Add synchronized PAce workflow actions

1. New Tables
- `pa_notifications`: durable in-app notifications linked to a PA case and recipient.
2. Modified Tables
- No existing data is removed. Existing case and document-request tables are used by the workflow functions below.
3. Security
- Notifications are readable, editable, and deletable only by their recipient.
- Workflow functions derive the acting user from `auth.uid()` and verify the assigned case role before changing status or approval fields.
- The database enforces the dual-approval rule: patient submission requires a hospital approval on the exact current PA version.
4. Important notes
- Hospital actions move a case to patient approval or request changes.
- Patient approval moves a hospital-approved current version to submitted.
- Insurer actions move submitted cases through review to approved or denied with a reason.
- Each action creates a timeline entry and notifies the next participant.
*/

CREATE TABLE IF NOT EXISTS public.pa_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pa_id uuid REFERENCES public.pa_requests(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pa_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_recipient" ON public.pa_notifications;
CREATE POLICY "notifications_select_recipient" ON public.pa_notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notifications_insert_recipient" ON public.pa_notifications;
CREATE POLICY "notifications_insert_recipient" ON public.pa_notifications FOR INSERT TO authenticated WITH CHECK (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update_recipient" ON public.pa_notifications;
CREATE POLICY "notifications_update_recipient" ON public.pa_notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notifications_delete_recipient" ON public.pa_notifications;
CREATE POLICY "notifications_delete_recipient" ON public.pa_notifications FOR DELETE TO authenticated USING (recipient_id = auth.uid());

CREATE INDEX IF NOT EXISTS pa_notifications_recipient_idx ON public.pa_notifications(recipient_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.pace_apply_case_action(
  p_pa_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.pa_requests%ROWTYPE;
  v_role text;
  v_next_status text;
  v_detail text;
  v_recipient uuid;
BEGIN
  SELECT * INTO v_case FROM public.pa_requests WHERE id = p_pa_id FOR UPDATE;
  IF v_case.id IS NULL THEN RAISE EXCEPTION 'Case not found'; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;

  IF p_action = 'HOSPITAL_APPROVE' THEN
    IF v_role <> 'hospital' OR v_case.hospital_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF v_case.status NOT IN ('COLLECTING_DOCUMENTS', 'HOSPITAL_REVIEW', 'RESUBMISSION_REQUESTED') THEN RAISE EXCEPTION 'Invalid case status'; END IF;
    v_next_status := 'PATIENT_APPROVAL';
    v_detail := 'Hospital approved version ' || v_case.version::text || ' for patient review';
    UPDATE public.pa_requests SET status = v_next_status, hospital_approved_version = version, updated_at = now() WHERE id = p_pa_id;
    v_recipient := v_case.patient_id;
  ELSIF p_action = 'HOSPITAL_REQUEST_CHANGES' THEN
    IF v_role <> 'hospital' OR v_case.hospital_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
    v_next_status := 'RESUBMISSION_REQUESTED';
    v_detail := 'Hospital requested changes: ' || trim(p_reason);
    UPDATE public.pa_requests SET status = v_next_status, patient_approved_version = NULL, hospital_approved_version = NULL, version = version + 1, updated_at = now() WHERE id = p_pa_id;
    v_recipient := v_case.patient_id;
  ELSIF p_action = 'PATIENT_APPROVE' THEN
    IF v_role <> 'patient' OR v_case.patient_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF v_case.status <> 'PATIENT_APPROVAL' OR v_case.hospital_approved_version IS NULL OR v_case.hospital_approved_version <> v_case.version THEN RAISE EXCEPTION 'The current version needs hospital approval first'; END IF;
    v_next_status := 'SUBMITTED';
    v_detail := 'Patient approved the same version ' || v_case.version::text || '; case submitted';
    UPDATE public.pa_requests SET status = v_next_status, patient_approved_version = version, updated_at = now() WHERE id = p_pa_id;
    v_recipient := v_case.insurer_id;
  ELSIF p_action = 'INSURER_START_REVIEW' THEN
    IF v_role <> 'insurer' OR v_case.insurer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF v_case.status <> 'SUBMITTED' THEN RAISE EXCEPTION 'Case is not ready for insurer review'; END IF;
    v_next_status := 'INSURER_REVIEW';
    v_detail := 'Insurer review started';
    UPDATE public.pa_requests SET status = v_next_status, updated_at = now() WHERE id = p_pa_id;
    v_recipient := v_case.patient_id;
  ELSIF p_action = 'INSURER_APPROVE' THEN
    IF v_role <> 'insurer' OR v_case.insurer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF v_case.status NOT IN ('SUBMITTED', 'INSURER_REVIEW') THEN RAISE EXCEPTION 'Invalid case status'; END IF;
    v_next_status := 'APPROVED';
    v_detail := 'Insurer approved the case';
    UPDATE public.pa_requests SET status = v_next_status, updated_at = now() WHERE id = p_pa_id;
    v_recipient := v_case.patient_id;
  ELSIF p_action = 'INSURER_DENY' THEN
    IF v_role <> 'insurer' OR v_case.insurer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF v_case.status NOT IN ('SUBMITTED', 'INSURER_REVIEW') OR p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'A denial reason is required'; END IF;
    v_next_status := 'DENIED';
    v_detail := 'Insurer denied the case: ' || trim(p_reason);
    UPDATE public.pa_requests SET status = v_next_status, updated_at = now() WHERE id = p_pa_id;
    v_recipient := v_case.patient_id;
  ELSE
    RAISE EXCEPTION 'Unsupported action';
  END IF;

  INSERT INTO public.pa_timeline (pa_id, actor_id, action, detail) VALUES (p_pa_id, auth.uid(), p_action, v_detail);
  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.pa_notifications (recipient_id, pa_id, notification_type, title, body)
    VALUES (v_recipient, p_pa_id, p_action, 'PA case updated', v_detail);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pace_apply_case_action(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pace_apply_case_action(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pace_fulfill_document_request(
  p_request_id uuid,
  p_status text,
  p_response_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.document_requests%ROWTYPE;
  v_case public.pa_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM public.document_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  SELECT * INTO v_case FROM public.pa_requests WHERE id = v_request.pa_id FOR UPDATE;
  IF v_case.hospital_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_status NOT IN ('Fulfilled', 'Unavailable') THEN RAISE EXCEPTION 'Invalid request status'; END IF;
  IF p_status = 'Unavailable' AND (p_response_note IS NULL OR length(trim(p_response_note)) < 3) THEN RAISE EXCEPTION 'A reason is required'; END IF;

  UPDATE public.document_requests SET status = p_status, response_note = NULLIF(trim(p_response_note), ''), assigned_to = auth.uid(), updated_at = now() WHERE id = p_request_id;
  UPDATE public.pa_requests SET status = CASE WHEN p_status = 'Fulfilled' THEN 'HOSPITAL_REVIEW' ELSE 'RESUBMISSION_REQUESTED' END, readiness_score = CASE WHEN p_status = 'Fulfilled' THEN LEAST(100, readiness_score + 12) ELSE readiness_score END, version = version + 1, hospital_approved_version = NULL, patient_approved_version = NULL, updated_at = now() WHERE id = v_case.id;
  INSERT INTO public.pa_timeline (pa_id, actor_id, action, detail) VALUES (v_case.id, auth.uid(), 'DOCUMENT_REQUEST_' || upper(p_status), COALESCE(p_response_note, v_request.document_type));
  INSERT INTO public.pa_notifications (recipient_id, pa_id, notification_type, title, body) VALUES (v_case.patient_id, v_case.id, 'DOCUMENT_REQUEST_' || upper(p_status), 'Hospital responded to your request', v_request.document_type || ': ' || p_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pace_fulfill_document_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pace_fulfill_document_request(uuid, text, text) TO authenticated;
