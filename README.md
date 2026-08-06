# MedReach AI

![MedReach AI](https://img.shields.io/badge/MedReach-AI-1B3A6B?style=for-the-badge&logo=react&logoColor=white)
![Status](https://img.shields.io/badge/Status-Alpha-E67E22?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-028090?style=for-the-badge)
![Backend](https://img.shields.io/badge/Backend-FastAPI-028090?style=for-the-badge&logo=fastapi&logoColor=white)
![Firebase](https://img.shields.io/badge/Database-Firebase-E67E22?style=for-the-badge&logo=firebase&logoColor=white)
![AI](https://img.shields.io/badge/AI-Ollama%20%2B%20Llama%203-1B3A6B?style=for-the-badge)

---

## 📋 Table of Contents

- [Introduction](#-introduction)
- [Alpha Features](#-alpha-features)
- [Technologies](#-technologies)
- [Installation](#-installation)
- [Development Setup](#-development-setup)
- [License](#-license)
- [Contributors](#-contributors)
- [Project Status](#-project-status)

---

## 🏥 Introduction

**MedReach AI** is a web-based, multi-tenant SaaS platform that specializes in healthcare data intelligence for pharmaceutical and medical device companies. The platform's first module focuses on cleaning, standardizing, analyzing, and intelligently querying Healthcare Professional (HCP) datasets.

**The problem it solves:**

Mid-size pharmaceutical and medical device companies rely on HCP databases to drive marketing, sales, and clinical outreach — and those databases are almost universally dirty. Outdated records, duplicate contacts, retired physicians still active in the system, NPI numbers that haven't been validated in years. Marketing teams have no accessible way to clean, understand, and act on that data without hiring a dedicated data analyst or paying six figures annually for enterprise software like Veeva or IQVIA.

**MedReach AI closes that gap by:**

- 🔍 **Automatically detecting PII, duplicates, and outliers** using Microsoft Presidio and scikit-learn before data reaches your campaigns
- 🤖 **Running all AI inference locally** via Ollama + Llama 3 — no HCP data ever leaves your server
- ⚖️ **Enforcing regulatory compliance** by blocking exports until off-label claims and Sunshine Act issues are resolved
- 📊 **Letting non-technical users query their dataset in plain English** and see results as interactive filtered tables
- 🔐 **Isolating every company's data** through multi-tenant Firestore security rules + Firebase Auth RBAC

---

## 🚀 Alpha Features

> **AI Capstone requirement:** MedReach AI is built around a significant AI core. All AI inference runs **locally via Ollama** — no HCP data is sent to external APIs. The following features are the target for this capstone phase.

| Feature | Description | AI Model |
|---|---|---|
| **Smart Column Mapping** | Upload any CSV/XLSX and the AI auto-maps columns to HCP standard fields (NPI, Name, Specialty, etc.) with a confidence score per column | Llama 3 8B |
| **Natural Language Query** | Ask plain-English questions ("Show me all cardiologists in Florida with 500+ prescriptions") and receive a filtered result set with the generated pandas filter shown for transparency | Llama 3 8B |
| **AI Segmentation** | Automatically clusters HCP records into meaningful audience segments using K-Means / DBSCAN; Llama 3 generates plain-language segment labels and descriptions | K-Means + Llama 3 |
| **Campaign Copy Generator** | Select a segment, define a goal and channel (Email / Detail Piece / SMS), and AI drafts subject line, body copy, and CTA | Llama 3 8B |
| **Compliance Review** | AI scans generated content for off-label claims, Sunshine Act relationships, and state-level marketing restrictions; export is blocked until High-severity flags are resolved | DistilBERT + Mistral 7B |
| **PII Detection & Anonymization** | Microsoft Presidio scans every uploaded record for SSNs, DOBs, financial identifiers, and home addresses; user chooses to anonymize, remove, or override with logged justification | Microsoft Presidio |
| **Outlier Detection** | scikit-learn Isolation Forest flags HCP records with statistically implausible claims volumes, geographic patterns, or license dates — with plain-language explanations | Isolation Forest |
| **NPI Validation** | Every uploaded NPI is verified against the live CMS NPPES Registry; inactive, invalid, and mismatched records are surfaced in the Data Review tab | CMS NPI Registry API |
| **Data Quality Scoring** | Automated 0–100% data quality score updates in real time as flags are resolved; export is gated until the score meets threshold | — |
| **Full Audit Trail** | Every action (upload, flag resolution, query, export, role change) is logged to Firestore with actor identity and timestamp | — |

---

## 🛠️ Technologies

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.x | UI component framework |
| **TypeScript** | 5.7+ | Type-safe development |
| **Vite** | 6.x | Build tool & dev server |
| **Tailwind CSS** | 4.x | Utility-first styling |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **FastAPI** | 0.141+ | Python REST API server |
| **uvicorn** | latest | ASGI server |
| **pandas** | 2.x | Data ingestion, cleaning, export |
| **scikit-learn** | 1.4+ | Isolation Forest outlier detection, K-Means / DBSCAN segmentation |
| **Microsoft Presidio** | 2.x | PII detection and anonymization |
| **spaCy** | 3.x | NLP preprocessing pipeline |
| **Hugging Face Transformers** | 4.x | DistilBERT compliance classification |

### AI Runtime
| Technology | Purpose |
|---|---|
| **Ollama** | Self-hosted local LLM runtime — no HCP data leaves the server |
| **Meta Llama 3 8B** | Column mapping, NL query translation, segmentation labeling, campaign copy |
| **Mistral 7B** | Structured JSON output for compliance flagging |

### Infrastructure & Data
| Technology | Purpose |
|---|---|
| **Firebase Firestore** | Multi-tenant NoSQL database with security-rules-level data isolation |
| **Firebase Authentication** | JWT auth with custom claims for tenant ID and RBAC roles (Admin / Editor / Viewer) |
| **Firebase Storage** | Raw CSV uploads and generated export files |
| **Firebase Emulator Suite** | Local development replica of Auth and Firestore |
| **CMS NPPES NPI Registry API** | Real-time physician record validation |
| **CMS Open Payments Database** | Sunshine Act relationship tracking |
| **FDA Warning Letter Database** | Off-label compliance training data |
| **ReportLab** | Programmatic PDF audit report generation |

---

## 💻 Installation

Follow these steps to run MedReach AI on your local machine.

### Prerequisites

| Tool | Version | Download |
|---|---|---|
| Node.js | ≥ 18 LTS | [nodejs.org](https://nodejs.org) |
| Python | ≥ 3.11 | [python.org](https://python.org) |
| Git | Latest | [git-scm.com](https://git-scm.com) |
| Ollama | ≥ 0.3 | [ollama.com](https://ollama.com) |
| Firebase CLI | ≥ 13.x | `npm install -g firebase-tools` |

### Step 1 — Clone the repository

```bash
git clone https://github.com/Shoe6/MedReac-AI.git
cd MedReac-AI
git checkout develop
```

### Step 2 — Install frontend dependencies

```bash
npm install
```

### Step 3 — Install backend dependencies

```bash
pip install -r requirements.txt
```

### Step 4 — Start the Firebase Emulator

```bash
firebase emulators:start
```

This starts local Firestore and Auth at `http://localhost:4000`.

### Step 5 — Pull the AI models via Ollama

```bash
ollama pull llama3
ollama pull mistral
```

### Step 6 — Start the backend

```bash
uvicorn main:app --reload --port 8000
```

### Step 7 — Start the frontend

```bash
npm run dev
```

Open your browser at `http://localhost:5173`.

> ⚠️ **Alpha note:** AI features (segmentation, NL query, campaign generation) require Ollama to be running. All other features (upload, data review, export) work without it and will show a graceful degraded-mode banner.

---

## 🔧 Development Setup

This section is for developers contributing to the MedReach AI codebase.

### Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready stable releases only — never commit directly |
| `staging` | Pre-production QA and integration testing |
| `develop` | Primary integration branch — all feature branches merge here |
| `collin/dev` | Collin's personal development sandbox |
| `scott/dev` | Scott's personal development sandbox |
| `feature/*` | Individual feature work (e.g. `feature/KAN-19-npi-validation`) |
| `hotfix/*` | Urgent production fixes — branches from `main`, merges to both `main` and `develop` |
| `release/*` | Release preparation (e.g. `release/v0.1.0`) |

### Workflow

```bash
# Day-to-day development
git checkout develop
git checkout -b feature/your-feature-name

# When ready for review
git push origin feature/your-feature-name
# → Open a Pull Request into develop on GitHub
```

### Project Structure

```
MedReac-AI/
├── src/                        ← React + TypeScript frontend
│   ├── App.tsx                 ← All screens and shared components (alpha monolith)
│   ├── index.css               ← Design tokens, Tailwind, global styles
│   ├── main.tsx                ← React entry point
│   └── vite-env.d.ts
│
├── main.py                     ← FastAPI application entry point
├── database.py                 ← Firebase Admin SDK / Firestore client
├── requirements.txt            ← Python dependencies (pip)
│
├── firebase.json               ← Firebase emulator configuration
├── .firebaserc                 ← Firebase project binding
│
├── index.html                  ← HTML entry point for Vite
├── vite.config.ts              ← Vite build config
├── tsconfig.json               ← TypeScript config
├── package.json                ← Node.js dependencies & scripts
│
└── README.md
```

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite frontend dev server (hot reload) at `localhost:5173` |
| `npm run build` | TypeScript check + production build to `/dist` |
| `npm run preview` | Serve the production build locally |
| `uvicorn main:app --reload` | Start FastAPI backend at `localhost:8000` |
| `firebase emulators:start` | Start local Firebase Auth + Firestore emulators |

### Code Standards

- **Frontend:** TypeScript strict mode. ESLint enforced. No `any` types.
- **Backend:** Black + Flake8 formatting enforced. All routes include docstrings.
- **PRs:** At minimum one peer review required before merging to `develop`.
- **Commits:** Use semantic commit messages (`feat:`, `fix:`, `chore:`, `docs:`).

### Building for Production

```bash
npm run build
```

Output goes to `/dist`. Deploy to Firebase Hosting, Netlify, Vercel, or any static host.

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License — Copyright (c) 2026 MedReach AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

## 👥 Contributors

| Name | Role | Contact |
|---|---|---|
| **Collin** | Lead Developer — Frontend, UI/UX, Product Architecture | collin@meridianstudiollc.com |
| **Scott Schoemaker** | Project Mentor / Capstone Instructor | scott.schoemaker@fullsail.edu |

**Collin** is the primary developer and maintains the repository. **Scott Schoemaker** serves as the Full Sail University capstone instructor and project advisor, providing architectural review and assessment.

> MedReach AI is a capstone project developed at **Full Sail University** — AI Software Development program.

---

## 📌 Project Status

**🟠 Alpha — Active Development**

MedReach AI is currently in **Alpha (Phase B — Data Intelligence)** per the design document phased delivery model.

### ✅ Complete (Phase A — Data Management MVP)
- Full React UI shell — all 18+ screens navigable with working state transitions
- Authentication flow (Login, Register, Forgot Password, MFA)
- Upload screen — chunked progress simulation, drag-and-drop, all error states (wrong type, file too large, parse error, network failure)
- Schema mapping — AI confidence scores per column, override tracking, duplicate/missing validation
- Data Review — PII Flags, Duplicates, Outliers, Validation Errors with bulk actions
- FastAPI backend scaffold connected to Firebase Emulator (Firestore + Auth)
- Full audit log screen
- Team management with role assignment

### 🔄 In Progress (Phase B — Data Intelligence Alpha)
- Natural Language Query interface (UI complete — Ollama backend connection pending)
- AI Segmentation (UI complete — scikit-learn + Llama 3 backend pending)
- Campaign Generator (UI complete — Llama 3 backend pending)
- Compliance Review with export gating (UI complete — DistilBERT backend pending)
- NPI Registry live validation (FastAPI route scaffolded)

### 🔲 Planned (Phase C — Visualization & Export Beta)
- Interactive Analytics Dashboard with Recharts
- Data Quality Heatmap (field completeness grid)
- PDF Audit Report via ReportLab
- CRM-compatible CSV export
- Microsoft Presidio PII pipeline integration
- Ollama self-hosted AI inference integration

---

*Built for the healthcare industry. Developed at Full Sail University — AI Software Development Capstone 2026.*


## 🏥 Introduction

**MedReach AI** is a healthcare data intelligence platform designed for pharmaceutical and medical device companies. It streamlines the management of Healthcare Provider (HCP) datasets — from raw CSV uploads through AI-powered data cleaning, segmentation, campaign generation, compliance review, and export.

**Why is it useful?**

Managing large HCP datasets is time-consuming, error-prone, and compliance-heavy. MedReach AI automates the tedious parts:

- 🔍 **Flags PII, duplicates, and outliers** before they reach your campaigns
- 🤖 **Uses AI** to map columns, segment audiences, and generate compliant marketing copy
- ⚖️ **Enforces compliance** by blocking exports when regulatory issues are unresolved
- 📊 **Visualizes data quality** so teams can act on issues at a glance

Whether you're a data analyst uploading a 10,000-record NPI list or a marketing manager generating a targeted campaign, MedReach AI keeps your workflow fast, auditable, and compliant.

---

## 🚀 Alpha Features

> **AI students note:** MedReach AI is built around a significant AI core. The following features will be fully implemented by end of month (August 2026).

| Feature | Description | AI Component |
|---|---|---|
| **Smart Column Mapping** | Upload any CSV/XLSX and the AI auto-maps columns to HCP standard fields (NPI, Name, Specialty, etc.) | ✅ AI-suggested mappings |
| **Natural Language Query** | Ask plain-English questions about your dataset ("Show me all cardiologists in Florida") and get filtered results | ✅ NLP → pandas filter generation |
| **AI Segmentation** | Automatically clusters HCP records into meaningful audience segments with generated labels and descriptions | ✅ Clustering + AI labels |
| **Campaign Generator** | Select a segment, set a goal, and let AI draft email subject lines, body copy, and CTAs | ✅ AI-generated content |
| **Compliance Review** | AI scans generated campaign content for off-label claims, Sunshine Act issues, and state-level restrictions | ✅ Regulatory AI scan |
| **Data Quality Scoring** | Automated data quality score (0–100%) with actionable flag breakdown | ✅ Outlier & validation AI |
| **Audit Trail** | Every action (upload, flag resolution, export, role change) is logged with actor identity | — |
| **Export Gating** | Export is blocked until all High-severity compliance flags are resolved | — |

---

## 🛠️ Technologies

### Frontend Framework
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.x | UI component library |
| **TypeScript** | 5.7+ | Type-safe development |
| **Vite** | 6.x | Build tool & dev server |
| **Tailwind CSS** | 4.x | Utility-first styling |

### Design System
- Custom design tokens (Navy `#1B3A6B`, Teal `#028090`, Corp Blue `#2E86AB`)
- **Calibri** for headings, **Inter** for body text
- Inline SVG icon set (no external icon library dependency)

### APIs & AI Services
| API / Service | Usage |
|---|---|
| **NPPES NPI Registry** | Real-time NPI validation and provider lookup |
| **OpenAI API** (planned) | Column mapping suggestions, NL query translation, campaign copy generation, compliance scanning |
| **Google Fonts** | Inter typeface loading |

---

## 💻 Installation

Follow these steps to run MedReach AI on your local machine.

### Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js](https://nodejs.org/) **v18 or higher** — [Download here](https://nodejs.org/en/download)
- **npm** (comes with Node.js) or [pnpm](https://pnpm.io/installation)
- A modern web browser (Chrome, Firefox, Edge)

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/MedReac-AI.git
   cd MedReac-AI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:5173
   ```

5. **Log in** — use any email/password on the login screen to access the demo. (No backend is connected in alpha; all data is mocked.)

> ⚠️ **Note for end users:** This is an alpha build. No real data is processed or stored. All HCP records shown are fictional demo data.

---

## 🔧 Development Setup

These instructions are for developers who want to contribute to or build from this repository.

### 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 18 LTS | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | Comes with Node.js |
| Git | Latest | [git-scm.com](https://git-scm.com) |
| VS Code | Latest | [code.visualstudio.com](https://code.visualstudio.com) *(recommended)* |

### 2. Clone & Install

```bash
git clone https://github.com/your-username/MedReac-AI.git
cd MedReac-AI
npm install
```

### 3. Project Structure

```
MedReach-AI/
├── index.html          # HTML entry point
├── vite.config.ts      # Vite build configuration
├── tsconfig.json       # TypeScript configuration
├── package.json        # Project dependencies & scripts
├── src/
│   ├── main.tsx        # React app entry point
│   ├── App.tsx         # Main application (all screens & components)
│   ├── index.css       # Global styles, design tokens, Tailwind import
│   └── vite-env.d.ts   # Vite type declarations
└── README.md
```

### 4. Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server (hot reload) |
| `npm run build` | Type-check and produce a production build to `/dist` |
| `npm run preview` | Preview the production build locally |

### 5. Key Architecture Notes

- **All UI lives in `src/App.tsx`** — screens, components, types, and design tokens are co-located for this alpha build. As the project grows, these will be split into separate files.
- **No backend yet** — all data (HCP records, flags, segments) is mocked inline. API integrations will be added in the next milestone.
- **Tailwind CSS v4** is used via the `@tailwindcss/vite` plugin — no `tailwind.config.js` is needed.
- **TypeScript strict mode** is enabled. Keep types accurate when adding new components.

### 6. Making a Production Build

```bash
npm run build
```

The output will be in the `/dist` folder. You can serve it with:

```bash
npm run preview
```

Or deploy the `/dist` folder to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 MedReach AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

## 👥 Contributors

| Name | Role |
|---|---|
| **Collins** | Lead Developer / Project Owner |

> Want to contribute? Open an issue or submit a pull request!

---

## 📌 Project Status

**🟠 Alpha — Active Development**

MedReach AI is currently in **Alpha**. Core screens and UI are complete. Backend integrations and live AI services are not yet connected.

### What works now:
- ✅ Full UI shell — all 18+ screens navigable
- ✅ Authentication flow (Login, Register, Forgot Password)
- ✅ Upload screen with drag-and-drop simulation
- ✅ Column mapping with AI-suggested mappings (mocked)
- ✅ Data Review — PII Flags, Duplicates, Outliers, Validation Errors tabs
- ✅ Natural Language Query interface
- ✅ Segmentation card grid
- ✅ Campaign Generator
- ✅ Compliance Review with export gating
- ✅ Analytics Dashboard (charts, activity feed)
- ✅ Export screen
- ✅ Team Management & Audit Log
- ✅ Toast notifications & modal system

### Coming next (Beta milestone):
- 🔲 Real API integration (NPPES NPI Registry)
- 🔲 OpenAI API for column mapping, query translation & campaign generation
- 🔲 User authentication backend
- 🔲 Persistent data storage
- 🔲 CSV/XLSX file parsing

---

*Built with ❤️ for the healthcare industry.*

A collaborative medical AI project developed by Collin and Scott.

## Branch Structure

| Branch | Purpose |
|---|---|
| `main` | Production-ready, stable releases only |
| `staging` | Pre-production testing & QA |
| `develop` | Active integration branch — all features merge here |
| `feature/*` | Individual feature work (e.g. `feature/login-page`) |
| `hotfix/*` | Urgent production fixes (e.g. `hotfix/critical-bug`) |
| `release/*` | Release preparation branches (e.g. `release/v1.0.0`) |
| `collin/dev` | Collin's personal development sandbox |
| `scott/dev` | Scott's personal development sandbox |

## Workflow

1. Create feature branches off `develop`
2. Open a PR into `develop` when ready for review
3. `develop` → `staging` for QA testing
4. `staging` → `main` for production releases
5. `hotfix/*` branches off `main` and merges back into both `main` and `develop`

## Getting Started

```bash
# Clone the repo
git clone <repo-url>

# Switch to develop for day-to-day work
git checkout develop

# Start a new feature
git checkout -b feature/your-feature-name
```
