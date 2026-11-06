<div align="center">
  <h1>🩺 MedReachAI</h1>
  <p><b>Healthcare Data Intelligence & Automated Compliance Platform</b></p>
  
  ![Status](https://img.shields.io/badge/Status-Beta_Development-blue?style=for-the-badge)
  ![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
  ![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
  ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
</div>

---

## 🚀 Introduction
**MedReachAI** is a healthcare data intelligence platform designed to automate the ingestion, validation, and auditing of medical provider data. Managing healthcare provider data is historically manual and prone to regulatory compliance risks. This application provides a scalable solution by leveraging machine learning to identify data irregularities, cross-referencing federal databases for compliance (e.g., CMS NPI Registry, Open Payments), and generating auditable data-scrubbing logs. 

> **Project Shift:** The scope has evolved to prioritize **Explainable AI**, ensuring data stewards can understand exactly *why* the system flags specific records.

---

## 🛠️ Alpha Features (CAP460)
The following features were successfully completed during the Alpha stage:

*   🤖 **Significant AI Component (Unsupervised Anomaly Detection):** Engineered a machine learning backend utilizing scikit-learn's `IsolationForest` to identify irregular statistical outliers in provider data.
*   📊 **Dynamic Density Clustering Fallback:** Implemented scikit-learn's `DBSCAN` algorithm to automatically take over anomaly detection when dataset variance exceeds pre-configured thresholds.
*   🗣️ **Plain-Language Anomaly Explanations:** Developed heuristic translation logic that converts mathematical anomaly scores into human-readable strings *(e.g., "Billing volume is 5x above the Cardiology average")*.
*   ⚖️ **Federal Compliance Integration:** Integrated a local SQLite Open Payments database to automatically flag providers exceeding federal financial thresholds ($100) and attach metadata payloads.
*   🏥 **NPI Status Classification:** Automated parsing of CMS NPI Registry payloads to categorize provider records and inject High-severity validation error flags for Deactivated NPIs.
*   📄 **Automated Audit Reporting:** Integrated ReportLab to dynamically generate branded, structured PDF audit logs tracking all data modifications.

---

## 🏗️ Beta Features (COS469)
During the Beta stage, development will focus on full-stack integration, security, and data explainability:

*   🖥️ **Interactive AI Visualization & Record Detail UI:** Develop a frontend interface allowing users to drill down into specific provider records to view plain-text anomaly explanations and metadata flags.
*   🔒 **Firebase Auth JWT Middleware:** Secure the FastAPI backend by requiring and validating JSON Web Tokens for all incoming requests.
*   🛡️ **Role-Based Access Control (RBAC):** Implement strict routing and UI access controls for Admin, Editor, and Viewer roles.
*   🗄️ **Firestore Multi-Tenant Security Rules:** Establish database-level isolation to ensure data is strictly partitioned by tenant/organization.
*   🗺️ **State Prescriber Privacy Restriction Engine:** Build backend logic to automatically enforce geographic data privacy restrictions based on provider state regulations.

---

## 🔄 Project Changes
The most significant change from the original CAP460 plan was the strategic pivot toward **Explainable AI**. Initially, the AI pipeline functioned as a "black box," simply outputting a `-1` flag for anomalies. Based on stakeholder feedback, it became clear that users could not conceptualize the model's operations. We shifted our scope to include plain-language heuristic translations and dynamic clustering fallback to translate mathematical variance into human-readable context.

---

## 💻 Technologies & Architecture
MedReachAI operates on a decoupled client-server architecture:

*   **Frontend (React, Node.js):** Acts as the presentation layer. It manages the user interface, displays visual AI anomaly walkthroughs, and enforces client-side role-based routing.
*   **Backend / AI (Python, FastAPI, scikit-learn, Pandas):** Serves as the core data processing pipeline. It routes data through the ML engine, queries local SQLite databases, and returns enriched JSON payloads.
*   **Database (Firestore, SQLite):** Firestore handles application state and user roles, secured by multi-tenant rules. SQLite indexes local compliance data.
*   **Authentication (Firebase Auth):** Handles user identity. The frontend passes a JWT to the FastAPI backend, which uses custom middleware to verify the token.

---

## 🔐 Ethics, Privacy & Security
*   **Ethics & AI Risks:** Blindly trusting AI to delete healthcare data poses a significant ethical risk. Our AI engine only *flags* data (soft-deletes) and provides plain-language explanations. Human data stewards retain ultimate authority.
*   **Privacy:** To protect sensitive provider information, we are implementing a State Prescriber Privacy Restriction Engine and generating immutable PDF audit logs for all PII overrides.
*   **Security:** API endpoints are protected via JWT validation. Sensitive credentials are strictly managed via local `.env` files and are never committed to version control. Firestore security rules ensure strict tenant isolation.

---

## ⚙️ Installation & Development Setup

### End Users
End users do not need to install the software locally. MedReachAI is a web-based platform:
1. Navigate to the hosted application URL *(TBD upon Beta deployment)*.
2. Log in using credentials provided by your organization's Administrator.
3. Upload a provider dataset via the dashboard to initiate the AI intelligence pipeline.

### Developer Setup
1. **Clone the repository:** `git clone <repository_url>`
2. **Backend Setup:**
   * Navigate to the `/backend` directory.
   * Create a virtual environment: `python -m venv venv`
   * Activate the environment and install dependencies: `pip install -r requirements.txt`
   * Create a `.env` file in the backend root containing your `FIREBASE_SERVICE_KEY`, `CMS_API_KEY`, and `SQLITE_DB_PATH`.
   * Start the backend server: `uvicorn main:app --reload`
3. **Frontend Setup:**
   * Navigate to the `/frontend` directory.
   * Install dependencies: `npm install`
   * Create a `.env` file containing your Firebase Client Configuration variables.
   * Start the frontend server: `npm start`

---

### Local Firebase authentication and NLP queries

Copy the settings from `.env.example` into your local `.env`. Authentication
always uses the live `medreachai-679aa` project, including local backend runs.
The Admin SDK project is pinned to that ID and removes
`FIREBASE_AUTH_EMULATOR_HOST` after loading environment settings. Tokens must have
the production audience, issuer, and a valid Google signature; unsigned emulator
tokens are rejected. Firestore and Storage emulation remain independent.

Create an email/password test user in the Firebase Authentication console,
then sign in through the React login screen with those credentials. The role
picker previews UI roles only; it does not grant Firebase custom claims.
The NLP request waits for Firebase session restoration, obtains the current
user's ID token, and sends `Authorization: Bearer <TOKEN>`. The endpoint requires
a verified identity, not an `X-User-Role` header. Signed-out users must sign in.

All other `/api/**` calls (except `/api/health`) go through `src/apiClient.ts`, which
attaches the same ID token. The backend authorizes using the token's `role` custom
claim (`viewer`, `editor`, `admin`, `super-admin`); `X-User-Role` is no longer honored.
Missing, empty, whitespace-only, or `none` role claims fall back to
`users/{uid}.role`. Explicit Viewer or unknown claims are never upgraded from the
profile. Resolved roles are passed to downstream handlers and tenant checks.
The dashboard metric endpoints (`/api/dashboard/summary` and
`/api/companies/{company_id}/dashboard_metrics`) only require a valid signed-in
Firebase user; no role claim is needed. The company-specific endpoint also
requires tenant access.
Assign a role with `python set_user_role.py <email> <role>` (invited users get their
claim automatically), then sign out and back in to refresh the token.

Backend role requirements inherit higher roles: Viewer < Editor < Admin <
Super Admin. Company routes check the verified token's `company_id` claim; when
absent, they read `users/{uid}.company_id` in Firestore. Admin, Editor, and Viewer
must match the path company ID exactly. Verified Super Admins retain cross-company
access. Invitations provision both role and company claims while preserving other
custom claims. Existing users need a company claim or an assigned Firestore user
document; frontend preview roles and company IDs never grant access.

The upload UI allows Editor, Admin, and Super Admin; Viewer or missing roles see
the role restriction. API 403 responses appear separately as server denials with
their original details, not as an Editor-only restriction.
On Firebase token changes, the frontend loads the signed `company_id` claim or
calls authenticated `GET /api/auth/context` to resolve `users/{uid}.company_id`.
The endpoint always reads `users/{uid}` and returns `uid`, `role`, and `company_id`.
Explicit token role/company claims remain authoritative; unassigned role claims
and absent company claims fall back to the profile. A missing profile returns 404, an unassigned company
returns 403, and a failed Firestore lookup returns 503.
Upload signing, record merge, Data Review, heatmap, and export requests use that
company instead of `demo-company`. Missing assignments are displayed explicitly;
even Super Admins need an assigned company for this upload workflow.
Production upload signing and merge requests go directly to
`https://medreach-ai-894235176706.us-east1.run.app`, bypassing Firebase Hosting's
60-second proxy timeout while retaining Firebase bearer authentication.
Other API requests keep using `VITE_API_URL` or relative Hosting paths.
Development uploads still use `VITE_API_URL` or the local Vite proxy.
FastAPI CORS allows both `https://medreachai-679aa.web.app` and
`https://medreachai-679aa.firebaseapp.com`, including Authorization and
Content-Type headers. Cloud Run's own request timeout and memory limits still apply.
Deploy the backend account-context endpoint with the frontend when using the
Firestore assignment fallback; building locally does not update Firebase Hosting.

Missing/invalid tokens return 401. Insufficient roles return 403 with `Invalid role`;
missing/mismatched tenant assignments return 403 with `Company scope mismatch`.
An unavailable Firestore membership lookup returns 503 rather than allowing access.

Restart FastAPI and Vite after changing environment variables. Set
`VITE_FIREBASE_PROJECT_ID=medreachai-679aa`, `VITE_USE_AUTH_EMULATOR=false`, and
`VITE_FIREBASE_API_KEY` for both development and production. Web Auth defaults to
live authentication; explicitly enabling its emulator is only useful for isolated
frontend tests, since this backend rejects emulator tokens. The fetch helper waits
for session restoration and fails explicitly without sending a request when no
user/token is available or token retrieval fails.

Run the optional live emulator regression with
`MEDREACH_TEST_AUTH_EMULATOR=1 python -m pytest -q test_nlp_query.py`
(PowerShell: set `$env:MEDREACH_TEST_AUTH_EMULATOR = '1'` first). It creates and
deletes a temporary emulator user and verifies that the backend rejects its ID token.

### Analytics dashboard (MA-99)

The React Analytics page uses authenticated `GET /api/analytics/dashboard`.
The backend derives the company from the signed-in account; the frontend does not
send a company path parameter and verifies the returned company matches its context.
It renders a quality trend line chart (with a data table), specialty and geographic
tables, and explicit loading, retryable error, and per-series empty states.
Responses are validated before charting; unmounted requests are cancelled.
Retry immediately shows loading and sends a fresh authenticated request to the
same endpoint. Company changes cancel outstanding requests and reload analytics.

`GET /api/analytics/dashboard` requires a verified Firebase ID token (401 when
missing/invalid), but no role claim. It derives the company from the signed
`company_id` claim or `users/{uid}.company_id`; query parameters cannot select
another tenant, including for Super Admins.

The endpoint reads only `companies/{company_id}/records` and returns
`company_id`, `total_records`, `undated_records`, and these arrays:

* `quality_trends`: `{date, record_count, quality_score}` ordered by UTC date.
  Scores reuse `calculate_data_health` for each daily cohort of currently stored
  records, not historical whole-dataset snapshots. Dates use the first valid
  merge/process/create/upload timestamp; missing/invalid dates are counted in
  `undated_records` rather than assigned a fabricated date.
* `specialty_distribution`: `{specialty, count, percentage}`.
* `geographic_coverage`: `{state, count, percentage}`.

Distribution totals include undated records and an `Unknown` bucket for missing
labels. Empty datasets return empty arrays. Missing company assignments return
403; Firestore read failures return 503, never synthetic successful metrics.
The synchronous route runs blocking Firestore work in FastAPI's worker pool.
Analytics reads use document-ID ordering and `start_after` snapshot cursors,
fetching at most 1,000 records per stream with a separate 30-second read deadline.
Pages are combined before aggregation; a failed page returns 503 rather than
partial metrics. Combined records still occupy memory proportional to dataset
size, and concurrent record changes are not a point-in-time snapshot across pages.

### Large record merges

Merge batch commits retry transient unavailable/deadline/aborted or connection
errors up to three total attempts, with 0.5s then 1s backoff in the worker thread.
Each attempt rebuilds the same batch using stable document IDs and timestamps.
After a transient failure, the request constructs a fresh Firestore client with
the configured Firebase project's credentials and rebuilds its document references.
Later chunks reuse the recovered client; the shared application client is not replaced.
Permanent errors are not retried; exhausted retries retain the existing 503.
The outer write deadline allows all three RPC deadlines plus backoff.
Scrubbing and write loops pause asynchronously for 0.5s after each chunk.
These measures improve resilience but do not establish missed gRPC keepalives
as the cause of an observed 503; inspect backend logs for the underlying error.

`POST /api/companies/{company_id}/records/merge` scrubs records in 100-row
chunks and commits Firestore batches of at most 100 writes. Blocking merge,
batch commits, and garbage collection run in worker threads; temporary chunk
references are released and the request yields between chunks.
Duplicate matching remains dataset-wide and explicit master selection is
preserved. Anomaly scores now use chunk-local cohorts rather than the full
upload, so flags can differ with chunk boundaries.

Each write batch is atomic, but the entire request is not: a later batch failure
returns 503 and earlier committed batches remain. Use stable `record_id` values
when retrying. The JSON request, duplicate index, and full response still scale
with dataset size. A request-scoped NPI cache preserves the 100-lookup cap across
chunks, including offline results, instead of multiplying network calls.
For unbounded uploads or processing exceeding the Cloud Run request deadline,
use the existing GCS streaming/background processing path instead.

### Upload URL endpoints

* `POST /api/uploads/generate-signed-url` (alias: `/api/upload/generate-url`)
  uses a Firebase bearer token and returns `signed_url`, `object_name`, and
  `expires_in` for owner-scoped CSV processing. Local E2E mode retains its
  development-only, loopback-restricted upload flow.
* `POST /api/companies/{company_id}/uploads/generate-url` uses a Firebase bearer token
  (Editor or above, with company access) and returns `upload_id`, `upload_url`, and `storage_path`.
  The request body contains `filename` and optional `content_type`; the company
  comes from the URL. In emulator mode, the upload URL targets a local receiver.

## 📜 License
This project is licensed under the **MIT License**. This permits open use, modification, and distribution, which is appropriate given our use of open-source libraries like scikit-learn and Pandas.

## 🤝 Contributors
*   **Scott Shoemaker** - Backend Architecture, Machine Learning Pipeline, Data Engineering
*   **Collin** - Frontend Architecture, React UI Implementation, Client-Side State
