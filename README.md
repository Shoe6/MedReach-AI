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

## 📜 License
This project is licensed under the **MIT License**. This permits open use, modification, and distribution, which is appropriate given our use of open-source libraries like scikit-learn and Pandas.

## 🤝 Contributors
*   **Scott Shoemaker** - Backend Architecture, Machine Learning Pipeline, Data Engineering
*   **Collin** - Frontend Architecture, React UI Implementation, Client-Side State
