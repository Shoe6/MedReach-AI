# MedReach AI — Capstone Project Submission
**Full Sail University | August 8, 2026**
**Students:** Collin Schoemaker (Frontend Lead) · Scott Schoemaker (Backend Lead)
**GitHub:** https://github.com/Shoe6/MedReach-AI

---

## 1. Project Overview

MedReach AI is a multi-tenant SaaS platform for healthcare data intelligence. It enables pharmaceutical and medical device companies to upload, clean, validate, and query Healthcare Professional (HCP) datasets using local AI inference. No HCP data is sent to external APIs — all AI runs via Ollama locally.

**Core problem solved:** Mid-size pharma companies depend on HCP databases for marketing and clinical outreach, but those databases are universally dirty — duplicates, invalid NPIs, missing fields, PII buried in free-text columns. MedReach AI automates the cleaning pipeline and gates export behind compliance checks.

---

## 2. Tech Stack

### Frontend (Collin)
| Technology | Version | Role |
|---|---|---|
| React | 19.x | UI framework |
| TypeScript | 5.7 | Type safety |
| Vite | 6.x | Build / dev server |
| Tailwind CSS | 4.x | Utility-first styling |
| React Router DOM | 7.x | Client-side routing |
| ESLint | 9.x | Linting (TypeScript + React rules) |

### Backend (Scott)
| Technology | Version | Role |
|---|---|---|
| FastAPI | 0.141+ | REST API server |
| Firebase Admin SDK | 7.5+ | Firestore + Auth |
| Firebase Emulator | — | Local Firestore + Auth dev |
| pandas | 2.x | Data ingestion and cleaning |
| scikit-learn | 1.4+ | Outlier detection, segmentation |
| Microsoft Presidio | 2.x | PII detection |
| Ollama + Llama 3 | — | Local AI inference |

---

## 3. Completed Tickets

### ✅ Ticket: React Frontend Scaffold
- Vite + React 19 + TypeScript 5.7 + Tailwind CSS 4 configured and compiling clean
- ESLint 9 configured with `@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- React Router DOM v7 wired — all screens map to real URL paths (`/dashboard`, `/upload`, `/data-heatmap`, etc.)
- Browser back/forward navigation works; bookmarkable URLs
- `npm run lint` and `npm run lint:fix` scripts added
- `npx tsc --noEmit` exits 0 — zero TypeScript errors

### ✅ Ticket: Login, Registration & Role-Based Dashboards
- **Login screen** — email/password validation, error states, role picker for demo
- **Registration screen** — password strength meter, confirm password validation
- **Forgot password screen** — email submission flow
- **4-tier RBAC system** fully implemented:

| Role | Access |
|---|---|
| **Super Admin** (platform owner) | All screens + Organizations management screen; purple sidebar; "PLATFORM ADMIN" label |
| **Admin** (client org admin) | Full access within org — upload, review, export, team, audit, settings |
| **Editor** | Upload, clean, review data — no export or team management |
| **Viewer** | Read-only — dashboard, data review, heatmap, query, analytics only |

- Sidebar dynamically filters nav items by role — locked screens auto-redirect to dashboard
- **Role switcher bar** visible while logged in — switch roles live without re-logging
- **Organization Management screen** (Super Admin only) — lists all client orgs with plan tier, user count, record count, status (active/trial/suspended), Impersonate and Suspend actions
- Login screen background and button color change based on selected role

### ✅ Ticket: Upload & Schema Mapping
- Full upload state machine with 6 explicit states: `idle → uploading → processing → done → error-type → error-size → error-parse → error-network`
- Chunked upload simulator (5 MB chunks, 300ms per chunk interval)
- Demo scenario buttons (not a cycling click trap):
  - ✓ Normal upload → advances to Column Mapping
  - ✕ Wrong file type (.pdf) → instant error banner
  - ✕ File too large (67 MB) → instant error banner
  - ⚠ Parse error (corrupt CSV) → animates upload then shows row-level error table (row #, column, detail)
  - ⚡ Network drop → connection lost error state
- Column Mapping screen: AI confidence scores per field, color-coded bars (green ≥90%, orange 75–89%, red <75%), sortable table, user override tracking, "Begin Cleaning" confirm button

### ✅ Ticket: Data Review 4-Tab Layout
- **PII / PHI Flags tab** — field completeness bar, sortable table, Anonymize / Remove / Override actions per record
- **Duplicates tab** — duplicate pairs with Merge action
- **Statistical Outliers tab** — outlier records with field, deviation %, Investigate / Dismiss actions
- **NPI Validation tab** — NPI status (Valid / Inactive / Not Found), Revalidate action
- Data Quality Score progress bar (67%) with counters: PII resolved, Outliers resolved, NPI errors resolved
- All column headers sortable with ascending/descending toggle
- Null % badges on column headers turn red above threshold
- NullSummaryBar showing overall field health

### ✅ Ticket: Data Quality Heatmap
- **Matrix view:** 30 records × 10 fields color-coded grid
  - Green = complete, Orange = partial, Red = validation failure, Gray = missing/null
  - Sticky tooltip panel (stays visible while scrolling) — shows Record ID, field name, status badge, exact null %, validation failure % on hover
  - Debounced hover (120ms) — no layout shift or glitch
  - Filter by status (click legend item) — grid filters to matching rows
  - Filter by field (dropdown) — narrows to single column
  - Column headers: mini health progress bar + % complete
  - Row health bar on right side of each row
  - Footer row: null % and invalid % totals per column
- **Field summary view:** stacked 4-color bar per field (complete/partial/invalid/null), exact null count and validation failure count out of 30 records, health score

---

## 4. Backend Status (Scott)

- FastAPI app scaffolded (`main.py`) with `/api/health` endpoint
- Firebase Admin SDK connected to Firestore emulator (`database.py`)
- `requirements.txt` with 45 packages (FastAPI, firebase_admin, httpx, pandas, scikit-learn, presidio, etc.)
- Firebase emulator configured (`firebase.json`, `.firebaserc`)

**Not yet connected to frontend:**
- File upload POST endpoint
- Presidio PII pipeline
- NPI Registry API validation
- Ollama/Llama 3 NLP query endpoint
- Firebase Auth real login (currently simulated in frontend)

---

## 5. Mock Data Disclosure

All data displayed in the frontend is **hand-fabricated inline** — no external database, no real patient records, no Synthea or CMS bulk exports. Names, NPIs, emails, and specialties are fictional placeholders chosen to make the UI look realistic. The NPI numbers shown are not valid (they fail the Luhn checksum used by CMS).

---

## 6. Git Commit History (Recent)

| Commit | Description |
|---|---|
| `30e8495` | Resolve README merge conflict (Scott) |
| `6684cc9` | feat: full RBAC role system — Super Admin/Admin/Editor/Viewer |
| `df1a9b2` | feat: React Router DOM + ESLint config |
| `6ba2fd7` | feat: complete Data Quality Heatmap ticket |
| `c2ee52a` | feat: complete Data Review ticket |
| `b2c0d44` | docs: correct Scott's role to co-developer |
| `fb54bf8` | feat: React frontend scaffold + design doc |
| `9d3243e` | chore: initial commit |

---

## 7. Running the Project Locally

```bash
# Clone
git clone https://github.com/Shoe6/MedReach-AI.git
cd MedReach-AI

# Install frontend dependencies
npm install

# Start frontend dev server
npm run dev
# → http://localhost:5173

# Lint check
npm run lint

# TypeScript check
npx tsc --noEmit

# Backend (requires Python 3.11+)
pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000/api/health
```

---

## 8. Project Structure

```
MedReach-AI/
├── src/
│   ├── App.tsx          # Entire frontend — all screens, components, types, mock data (~3,700 lines)
│   ├── main.tsx         # React entry point with BrowserRouter
│   └── index.css        # Tailwind + custom design tokens
├── main.py              # FastAPI app — /api/health endpoint
├── database.py          # Firebase Admin SDK Firestore client
├── requirements.txt     # 45 Python packages
├── firebase.json        # Firebase emulator config
├── .firebaserc          # Firebase project config
├── eslint.config.js     # ESLint 9 flat config
├── vite.config.ts       # Vite + Tailwind plugin
├── tsconfig.json        # TypeScript strict config
├── package.json         # npm scripts + dependencies
└── README.md            # Full project documentation
```

---

## 9. Contributors

| Name | Role |
|---|---|
| **Collin Schoemaker** | Frontend Lead — React, TypeScript, Vite, Tailwind, RBAC, UI screens |
| **Scott Schoemaker** | Backend Lead — FastAPI, Firebase, Firestore, system architecture |

---

*MIT License · MedReach AI · 2026*
