/*
# Protect synchronized PAce workflow fields

1. Modified Tables
- `pa_requests`: authenticated clients can no longer directly update status, version, or either approval version.
2. Security
- Workflow-only fields are writable through the server-enforced `pace_apply_case_action` and `pace_fulfill_document_request` functions.
- Existing user-editable case fields remain available to the participant update policy.
3. Important notes
- This prevents a crafted browser request from skipping hospital approval, patient approval, or insurer review.
- No rows or user data are removed.
*/

REVOKE UPDATE (status, version, patient_approved_version, hospital_approved_version) ON public.pa_requests FROM authenticated;
