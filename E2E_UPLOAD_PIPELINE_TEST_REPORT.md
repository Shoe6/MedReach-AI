# End-to-End Upload Pipeline Test Report

**Scope:** frontend CSV upload → Cloud Run backend → live Firestore, exercising the
real signed-URL flow (`/api/upload/generate-url` → direct-to-GCS `PUT` →
`/api/companies/{id}/records/merge` → `/api/companies/{id}/export_data`).

**Date:** 2026-10-08
**Harness:** [verify_upload_pipeline_e2e.py](verify_upload_pipeline_e2e.py)

## 1. Results — 5 diverse test CSVs

| File | Rows | generate-url | GCS PUT | merge | export | Stored count |
|---|---|---|---|---|---|---|
| tests/test_clean.csv | 20 | 200 | 200 | 200 | 200 | 20 |
| tests/test_duplicates_outliers.csv | 20 | 200 | 200 | 200 | 200 | 20 |
| tests/test_privacy_leaks.csv | 20 | 200 | 200 | 200 | 200 | 20 |
| tests/DAC_Synthetic_Sensitive_Sample.csv | 20 | 200 | 200 | 200 | 200 | 20 |
| tests/DAC_Test_Sample.csv (sampled) | 25 of 9,999 | 200 | 200 | 200 | 200 | 25 |

**Zero 500-level errors across all 5 files.** Row counts in Firestore matched rows
uploaded in every case (the `DAC_Test_Sample.csv` 9,999-row registry extract was
sampled to 25 rows for the live run, since `/records/merge` writes synchronously
per-request — this is noted as a scalability follow-up, not a defect).

## 2. Payload mismatches / dropped variables found and fixed

### 2a. `is_duplicate` was never set on real uploads (fixed)
`scrub_provider_records()` (PII/NPI/anomaly scrubbing) never computed duplicate
clusters, and `/records/merge` — the only endpoint the real upload flow calls —
never ran duplicate detection either. The `detect_duplicate_clusters()` logic
existed but was only reachable from the unused legacy `/upload_file` path. Result:
every record uploaded through the live app silently reported `is_duplicate` as
absent, so the Data Health Score's **Duplicates** category always read as if
every row were unique, regardless of actual content.

**Fix:** [main.py](main.py) `merge_company_records()` now runs
`detect_duplicate_clusters()` on the scrubbed batch and tags each record's
`is_duplicate` before persisting. Verified both locally (new regression test
`test_merge_records_endpoint_flags_true_duplicate_clusters_only` in
[test_record_merge.py](test_record_merge.py)) and live in production: two records
sharing an NPI were flagged `is_duplicate: true`; unrelated records were `false`.

### 2b. Production frontend was calling `http://localhost:8000` (fixed)
A local-dev `.env` (`VITE_API_URL=http://localhost:8000`, gitignored, never
committed) was silently baked into the production bundle by `vite build`,
because Vite has no mode-specific override to prevent it. Every API call from
the **live deployed site** — dashboard summary, executive metrics, provider
walkthrough, uploads — was failing with `net::ERR_CONNECTION_REFUSED` /
`TypeError: Failed to fetch` in the browser console. This affected the
previously-deployed production bundle, not just local dev.

**Fix:** added a committed [.env.production](.env.production) with
`VITE_API_URL=` (empty), which Vite applies for any `vite build` regardless of
what a developer's local `.env` points at. Rebuilt, redeployed to Firebase
Hosting, and confirmed via a live browser session that the bundle no longer
references `localhost:8000` and all API calls resolve through the Firebase
Hosting `/api/**` rewrite to Cloud Run.

## 3. Live browser verification (zero console errors)

Using a real browser session against `https://medreachai-679aa.web.app`:
- Dashboard loaded with no console errors (previously: connection-refused
  errors on every panel).
- Uploaded `tests/test_clean.csv` through the actual drop-zone file picker →
  signed URL → GCS `PUT` → `/records/merge` → auto-navigated to Data Review.
- Data Health Score rendered `20 / 20 pts` for NPI Validation, Contact
  Completeness, Duplicates, and Outliers, and `0 / 20 pts` for PII/PHI (20 of 20
  rows contain phone/email — correctly detected and scored).
- PII/PHI tab rendered grouped, record-level detections (e.g. "Drew Bennett —
  PHONE_NUMBER, PERSON, EMAIL_ADDRESS — High").
- No console errors or failed requests were logged at any point in the flow.

## 4. Known pre-existing gap (not fixed, out of scope)

The dedicated **Duplicates** tab (as opposed to the Data Health Score's
Duplicates category) still renders a hardcoded mock dataset (`DUPLICATES`) and
is not wired to live `processedRecords`/`is_duplicate` data. This is a larger,
separate feature gap rather than a payload mismatch and was left untouched.

## 5. Operational note

While cleaning up disposable E2E test companies, a `firebase firestore:delete`
call used an unsupported wildcard path and may have deleted more than intended
in the `companies` collection. Investigated and disclosed to the user; accepted
as inconsequential (dummy/test data only). Lesson captured in memory:
never pass glob patterns to `firebase firestore:delete`.
