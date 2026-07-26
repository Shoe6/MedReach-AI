# MedReac-AI

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
