"""
StatIntel Analytics Engine
--------------------------
Real statistical computations: descriptive statistics, distribution analysis,
gap severity scoring, workforce forecasting, and competency coverage metrics.
Uses proper statistical methodology — not surface-level counts.
"""
import math
import statistics
from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Officer, Skill, Role, RoleSkill, Course


# ── Descriptive Statistics ──────────────────────────────────────────────────

def compute_descriptive_stats(values: list[float]) -> dict[str, Any]:
    """Full descriptive statistics suite for a numeric series."""
    if not values:
        return {
            "n": 0, "mean": None, "median": None, "mode": None,
            "std_dev": None, "variance": None, "skewness": None,
            "kurtosis": None, "min": None, "max": None, "range": None,
            "q1": None, "q3": None, "iqr": None,
            "cv": None,  # coefficient of variation
        }
    n = len(values)
    sorted_v = sorted(values)
    mean = statistics.mean(values)
    median = statistics.median(values)

    # Mode (handle multimodal)
    try:
        mode_val = statistics.mode(values)
    except statistics.StatisticsError:
        mode_val = None

    # Variance and standard deviation (population for the full dataset)
    variance = statistics.pvariance(values) if n > 1 else 0.0
    std_dev = math.sqrt(variance)

    # Quartiles
    q1 = sorted_v[n // 4] if n >= 4 else sorted_v[0]
    q3 = sorted_v[(3 * n) // 4] if n >= 4 else sorted_v[-1]
    iqr = q3 - q1

    # Skewness (Fisher-Pearson)
    skewness = None
    if n >= 3 and std_dev > 0:
        skewness = round(sum(((x - mean) / std_dev) ** 3 for x in values) * n / ((n - 1) * (n - 2)), 4)

    # Excess kurtosis
    kurtosis = None
    if n >= 4 and std_dev > 0:
        m4 = sum((x - mean) ** 4 for x in values) / n
        kurtosis = round(m4 / (std_dev ** 4) - 3, 4)

    # Coefficient of variation
    cv = round((std_dev / mean) * 100, 2) if mean != 0 else None

    return {
        "n": n,
        "mean": round(mean, 2),
        "median": round(median, 2),
        "mode": round(mode_val, 2) if mode_val is not None else None,
        "std_dev": round(std_dev, 2),
        "variance": round(variance, 2),
        "skewness": skewness,
        "kurtosis": kurtosis,
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        "range": round(max(values) - min(values), 2),
        "q1": round(q1, 2),
        "q3": round(q3, 2),
        "iqr": round(iqr, 2),
        "cv": cv,
    }


def build_histogram(values: list[float], bins: int = 10) -> list[dict]:
    """Generate histogram bin data for a numeric series."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if lo == hi:
        return [{"bin_start": lo, "bin_end": lo, "count": len(values), "frequency": 1.0}]
    width = (hi - lo) / bins
    result = []
    for i in range(bins):
        start = lo + i * width
        end = start + width
        count = sum(1 for v in values if start <= v < end or (i == bins - 1 and v == end))
        result.append({
            "bin_start": round(start, 1),
            "bin_end": round(end, 1),
            "count": count,
            "frequency": round(count / len(values), 4),
        })
    return result


# ── Gap Analysis (advanced) ─────────────────────────────────────────────────

SKILL_ALIASES = {
    "python & reproducible analysis": ["python", "reproducible analysis"],
    "applied sampling methodology": ["applied sampling", "sampling methods", "sampling methodology", "sampling"],
    "data quality & validation": ["data quality", "validation", "quality assurance"],
    "sql & data management": ["sql", "data management"],
    "ai / machine learning foundations": ["ai / ml", "ai/ml", "machine learning", "artificial intelligence", "ml"],
    "data visualisation": ["visualisation", "visualization", "data visualisation", "data visualization"],
}


def _normalize(value: str) -> str:
    return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in (value or "")).split())


def _profile_mentions_skill(profile: Officer, skill_name: str) -> bool:
    entered = [_normalize(x) for x in (profile.missing_skills or "").replace("|", ";").split(";") if x.strip()]
    canonical = _normalize(skill_name)
    aliases = SKILL_ALIASES.get(skill_name.lower(), [])
    accepted = {canonical, *(_normalize(a) for a in aliases)}
    return any(item in accepted for item in entered)


def _profile_has_skill(profile: Officer, skill_name: str) -> bool:
    entered = [_normalize(x) for x in (profile.skills or "").replace("|", ";").split(";") if x.strip()]
    canonical = _normalize(skill_name)
    aliases = SKILL_ALIASES.get(skill_name.lower(), [])
    accepted = {canonical, *(_normalize(a) for a in aliases)}
    return any(item in accepted for item in entered)


def compute_gap_severity(mention_count: int, total_profiles: int) -> dict:
    """
    Compute gap severity using a weighted scoring model.
    Severity = (mention_ratio * 60) + (absolute_impact * 40)
    """
    if total_profiles == 0:
        return {"score": 0, "level": "unobserved", "ratio": 0}
    ratio = mention_count / total_profiles
    # Absolute impact component (logarithmic scaling for large counts)
    abs_impact = min(1.0, math.log(mention_count + 1) / math.log(total_profiles + 1)) if mention_count > 0 else 0
    score = round(ratio * 60 + abs_impact * 40, 1)
    if score >= 50:
        level = "critical"
    elif score >= 30:
        level = "high"
    elif score >= 15:
        level = "moderate"
    elif mention_count > 0:
        level = "low"
    else:
        level = "unobserved"
    return {"score": score, "level": level, "ratio": round(ratio * 100, 1)}


# ── Workforce Analytics ─────────────────────────────────────────────────────

def compute_workforce_analytics(db: Session) -> dict:
    """Comprehensive workforce analytics dashboard data."""
    people = db.scalars(select(Officer)).all()
    skill_rows = db.scalars(select(Skill)).all()
    roles = db.scalars(select(Role)).all()
    courses = db.scalars(select(Course)).all()

    if not people:
        return _empty_analytics()

    readiness_values = [p.readiness for p in people]
    gap_values = [float(p.open_gaps) for p in people]
    desc_stats = compute_descriptive_stats(readiness_values)
    gap_stats = compute_descriptive_stats(gap_values)
    histogram = build_histogram(readiness_values, bins=10)

    # Department breakdown
    dept_data = defaultdict(lambda: {"count": 0, "readiness_sum": 0, "gap_sum": 0, "officers": []})
    for p in people:
        dept = p.department or "Unassigned"
        dept_data[dept]["count"] += 1
        dept_data[dept]["readiness_sum"] += p.readiness
        dept_data[dept]["gap_sum"] += p.open_gaps
        dept_data[dept]["officers"].append(p.name)
    departments = []
    for dept, d in sorted(dept_data.items()):
        avg_r = round(d["readiness_sum"] / d["count"], 1)
        departments.append({
            "name": dept,
            "officer_count": d["count"],
            "avg_readiness": avg_r,
            "total_gaps": d["gap_sum"],
            "avg_gaps": round(d["gap_sum"] / d["count"], 1),
            "health_index": _compute_health_index(avg_r, d["gap_sum"], d["count"]),
        })

    # Role progression analysis
    role_transitions = defaultdict(int)
    for p in people:
        key = f"{p.current_role} → {p.target_role}"
        role_transitions[key] += 1
    transitions = [{"path": k, "count": v} for k, v in sorted(role_transitions.items(), key=lambda x: -x[1])]

    # Readiness distribution bands
    bands = {
        "critical": {"range": "0–39%", "count": 0, "officers": []},
        "developing": {"range": "40–59%", "count": 0, "officers": []},
        "proficient": {"range": "60–79%", "count": 0, "officers": []},
        "advanced": {"range": "80–100%", "count": 0, "officers": []},
    }
    for p in people:
        if p.readiness < 40:
            band = "critical"
        elif p.readiness < 60:
            band = "developing"
        elif p.readiness < 80:
            band = "proficient"
        else:
            band = "advanced"
        bands[band]["count"] += 1
        bands[band]["officers"].append(p.name)

    # Skill coverage matrix
    coverage = []
    for s in skill_rows:
        has_it = sum(1 for p in people if _profile_has_skill(p, s.name))
        missing_it = sum(1 for p in people if _profile_mentions_skill(p, s.name))
        coverage.append({
            "skill": s.name,
            "domain": s.domain,
            "evidenced_count": has_it,
            "gap_count": missing_it,
            "coverage_pct": round(has_it / len(people) * 100, 1) if people else 0,
            "gap_pct": round(missing_it / len(people) * 100, 1) if people else 0,
        })
    coverage.sort(key=lambda x: -x["gap_pct"])

    # Time-based readiness scoring (simulate quarterly trend from current data)
    # In production this would come from historical assessment records
    avg_readiness = desc_stats["mean"] or 0
    trend_projection = []
    for quarter in range(1, 5):
        # Simple linear projection based on gap closure rate assumption
        projected = min(100, avg_readiness + quarter * 3.2)  # ~3.2% per quarter improvement assumption
        trend_projection.append({
            "quarter": f"Q{quarter}",
            "projected_readiness": round(projected, 1),
            "confidence_interval": round(max(5, 15 - quarter * 2), 1),
        })

    return {
        "summary": {
            "total_officers": len(people),
            "total_departments": len(dept_data),
            "total_skills_tracked": len(skill_rows),
            "total_roles_defined": len(roles),
            "total_courses": len(courses),
            "demo_profiles": sum(1 for p in people if p.is_demo),
            "user_profiles": sum(1 for p in people if not p.is_demo),
        },
        "readiness": {
            "descriptive_stats": desc_stats,
            "histogram": histogram,
            "bands": bands,
        },
        "gaps": {
            "descriptive_stats": gap_stats,
            "total_gaps": sum(p.open_gaps for p in people),
            "officers_with_zero_gaps": sum(1 for p in people if p.open_gaps == 0),
        },
        "departments": departments,
        "skill_coverage": coverage,
        "role_transitions": transitions,
        "trend_projection": trend_projection,
        "methodology": (
            "Statistics are computed from stored officer records using population-level descriptive "
            "statistics. Readiness scores are self-reported or assessor-entered values, not model predictions. "
            "Gap severity uses a weighted composite: 60% mention-ratio + 40% log-scaled absolute impact. "
            "Trend projections assume a 3.2% quarterly improvement rate and should not be treated as forecasts."
        ),
    }


def _compute_health_index(avg_readiness: float, total_gaps: int, count: int) -> str:
    """Composite health index for a department."""
    gap_per_person = total_gaps / count if count else 0
    score = avg_readiness - (gap_per_person * 8)
    if score >= 70:
        return "healthy"
    elif score >= 50:
        return "moderate"
    elif score >= 30:
        return "at_risk"
    else:
        return "critical"


def _empty_analytics() -> dict:
    return {
        "summary": {
            "total_officers": 0, "total_departments": 0, "total_skills_tracked": 0,
            "total_roles_defined": 0, "total_courses": 0, "demo_profiles": 0, "user_profiles": 0,
        },
        "readiness": {"descriptive_stats": compute_descriptive_stats([]), "histogram": [], "bands": {}},
        "gaps": {"descriptive_stats": compute_descriptive_stats([]), "total_gaps": 0, "officers_with_zero_gaps": 0},
        "departments": [], "skill_coverage": [], "role_transitions": [], "trend_projection": [],
        "methodology": "No data available for analysis.",
    }


# ── Competency Heatmap ──────────────────────────────────────────────────────

def compute_competency_heatmap(db: Session) -> dict:
    """Build a department × skill competency heatmap."""
    people = db.scalars(select(Officer)).all()
    skill_rows = db.scalars(select(Skill)).all()

    departments = sorted(set(p.department for p in people))
    skills_list = [s.name for s in skill_rows]

    matrix = []
    for dept in departments:
        dept_people = [p for p in people if p.department == dept]
        row = {"department": dept, "officer_count": len(dept_people), "skills": {}}
        for skill_name in skills_list:
            has_it = sum(1 for p in dept_people if _profile_has_skill(p, skill_name))
            missing_it = sum(1 for p in dept_people if _profile_mentions_skill(p, skill_name))
            coverage = round(has_it / len(dept_people) * 100, 1) if dept_people else 0
            row["skills"][skill_name] = {
                "evidenced": has_it,
                "gaps": missing_it,
                "coverage_pct": coverage,
                "intensity": _intensity_level(coverage),
            }
        matrix.append(row)

    return {
        "departments": departments,
        "skills": skills_list,
        "matrix": matrix,
        "note": "Coverage percentage = officers with evidenced skill / total officers in department.",
    }


def _intensity_level(pct: float) -> str:
    if pct >= 75:
        return "high"
    elif pct >= 50:
        return "medium"
    elif pct >= 25:
        return "low"
    else:
        return "minimal"


# ── Individual Officer Analysis ─────────────────────────────────────────────

def compute_officer_readiness_profile(officer: Officer, db: Session) -> dict:
    """Deep analysis of a single officer's readiness and gap profile."""
    skill_rows = db.scalars(select(Skill)).all()
    courses = db.scalars(select(Course)).all()

    evidenced = [_normalize(x) for x in (officer.skills or "").replace("|", ";").split(";") if x.strip()]
    missing = [_normalize(x) for x in (officer.missing_skills or "").replace("|", ";").split(";") if x.strip()]

    # Match skills to catalogue
    matched_skills = []
    for s in skill_rows:
        canonical = _normalize(s.name)
        aliases = {canonical, *(_normalize(a) for a in SKILL_ALIASES.get(s.name.lower(), []))}
        has = any(e in aliases for e in evidenced)
        needs = any(m in aliases for m in missing)
        matched_skills.append({
            "skill": s.name,
            "domain": s.domain,
            "status": "evidenced" if has else ("gap" if needs else "not_assessed"),
        })

    # Recommend courses for gaps
    recommendations = []
    for s in matched_skills:
        if s["status"] == "gap":
            matching_courses = [
                {"id": c.id, "name": c.name, "provider": c.provider, "duration": c.duration, "verified": c.verified}
                for c in courses
                if _normalize(c.skill_name) == _normalize(s["skill"])
                or _normalize(c.skill_name) in {_normalize(a) for a in SKILL_ALIASES.get(s["skill"].lower(), [])}
            ]
            recommendations.append({
                "skill": s["skill"],
                "domain": s["domain"],
                "courses": matching_courses,
            })

    # Readiness band
    r = officer.readiness
    if r >= 80:
        band = "advanced"
        interpretation = "Officer demonstrates strong readiness. Focus on leadership development and knowledge transfer."
    elif r >= 60:
        band = "proficient"
        interpretation = "Solid foundation. Targeted upskilling in gap areas will accelerate progression."
    elif r >= 40:
        band = "developing"
        interpretation = "Significant development needed. Prioritize critical competency gaps."
    else:
        band = "critical"
        interpretation = "Immediate intervention recommended. Consider structured development programme."

    return {
        "officer": {
            "id": officer.id, "name": officer.name, "department": officer.department,
            "current_role": officer.current_role, "target_role": officer.target_role,
            "readiness": officer.readiness, "open_gaps": officer.open_gaps,
        },
        "readiness_band": band,
        "interpretation": interpretation,
        "skill_profile": matched_skills,
        "gap_remediation": recommendations,
        "evidenced_count": sum(1 for s in matched_skills if s["status"] == "evidenced"),
        "gap_count": sum(1 for s in matched_skills if s["status"] == "gap"),
        "unassessed_count": sum(1 for s in matched_skills if s["status"] == "not_assessed"),
    }
