# StatIntel — Workforce Intelligence Platform

A full-stack statistical workforce intelligence platform for organisations managing statistical officer competency development. Built with FastAPI (Python), SQLAlchemy, and a vanilla JavaScript frontend with Chart.js visualisations.

## What it does

- **Dashboard**: Real-time KPIs — profile count, mean/median readiness, standard deviation, gap totals
- **Analytics**: Full descriptive statistics (mean, median, mode, σ, skewness, kurtosis, IQR, CV), readiness histograms, skill coverage radar charts, readiness band doughnut, trend projections, and department × skill competency heatmaps
- **Officer Profiles**: CRUD operations, CSV import/export, deep individual analysis with course recommendations
- **Skill Intelligence**: Weighted gap severity scoring (60% mention-ratio + 40% log-scaled absolute impact)
- **Learning Catalogue**: Course registry with verification status tracking
- **Role Registry**: Role–skill mapping with required proficiency levels
- **Knowledge Graph**: SVG-based relationship visualisation of roles, skills, and learning pathways
- **Reports & Exports**: CSV exports with provenance metadata, system health checks

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI 0.115, SQLAlchemy 2.0 |
| Database | PostgreSQL 16 (via Docker) or SQLite (local dev) |
| Auth | JWT (HS256) + Argon2 password hashing |
| Frontend | Vanilla HTML/CSS/JS, Chart.js 4.4 |
| Deployment | Docker Compose |

## Quick Start (Local Development)

```bash
# 1. Create virtual environment
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the server (uses SQLite by default)
cd ..
uvicorn backend.app.main:app --reload --port 8000

# 4. Open http://localhost:8000
# Login: admin / ChangeMe-Now-123!
```

## Docker Deployment

```bash
cp .env.example .env
# Edit .env — change POSTGRES_PASSWORD, JWT_SECRET, ADMIN_PASSWORD
docker compose up --build -d
# Open http://localhost:8000
```

## API Documentation

Once running, interactive API docs are available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Statistical Methods

### Gap Severity Scoring
```
severity_score = (mention_ratio × 60) + (log_scaled_impact × 40)

where:
  mention_ratio = profiles_mentioning_skill / total_profiles
  log_scaled_impact = min(1.0, ln(mention_count + 1) / ln(total_profiles + 1))
```

### Readiness Bands
| Band | Range | Interpretation |
|------|-------|---------------|
| Critical | 0–39% | Immediate intervention recommended |
| Developing | 40–59% | Significant development needed |
| Proficient | 60–79% | Targeted upskilling in gap areas |
| Advanced | 80–100% | Focus on leadership and knowledge transfer |

### Descriptive Statistics
The analytics engine computes population-level statistics including mean (μ), median, mode, population standard deviation (σ), variance, skewness (Fisher-Pearson), excess kurtosis, interquartile range (IQR), and coefficient of variation (CV).

## Seed Data

The platform seeds 12 synthetic officer profiles across 5 departments, 10 competency skills, 7 roles with skill mappings, and 8 learning courses. All seed data is clearly marked as synthetic. Set `SEED_DEMO_DATA=false` in `.env` for a clean deployment.

## Security Notes

- Change default credentials before any non-local deployment
- JWT tokens expire after 8 hours (configurable via `TOKEN_MINUTES`)
- All write operations require admin role
- Registration creates viewer accounts by default
- Audit log tracks all data modifications
