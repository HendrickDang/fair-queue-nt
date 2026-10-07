"""
Shared taxonomy: categories, safety levels, urgency flags, vulnerabilities,
trigger phrases and scoring weights.

This is a line-for-line mirror of nt-housing-triage/lib/taxonomy.ts so the
Python analysis and the web app score jobs identically. tests/test_parity.py
fails if the two ever drift.
"""

CATEGORIES = [
    "plumbing", "electrical", "structural", "cooling", "water_quality",
    "sanitation", "security", "kitchen", "bathroom", "medical",
    "accessibility", "other",
]

# Ordered from least to most urgent; used for escalation and for measuring
# under-triage (a predicted level lower than the true level).
SAFETY_ORDER = ["low", "medium", "high", "critical"]

URGENCY_FLAGS = [
    "exposed_wiring", "fire_risk", "structural", "no_water", "no_hot_water",
    "sewage", "water_contamination", "no_cooling_extreme_heat", "security",
    "only_toilet_blocked", "medical_equipment", "child_safety", "elder_safety",
    "accessibility", "vermin_pest",
]

VULNERABILITIES = ["infants", "elderly", "disability", "medical_dependent", "overcrowded"]

# ---------------------------------------------------------------------------
# Trigger phrases: the vocabulary the deterministic parser looks for.
# Order matters, because the parser walks these dicts in insertion order.
# ---------------------------------------------------------------------------

FLAG_TRIGGERS = {
    "exposed_wiring": ["sparks", "wire hanging", "bare wire", "live wire", "shocks me", "burning smell"],
    "fire_risk": ["smoke", "sparks and smells", "burning", "scorched"],
    "structural": [
        "ceiling falling", "ceiling is sagging", "sagging", "roof caving", "caving",
        "roof leaking", "collapsing", "coming down", "wall cracked", "floor gave way",
        "cyclone damage",
    ],
    "no_water": ["no water", "water cut off", "nothing coming out", "no running water"],
    "no_hot_water": ["no hot water", "cold showers"],
    "sewage": ["sewage", "sewerage", "backing up", "overflow", "smells like poo", "smells like waste"],
    "water_contamination": ["brown water", "dirty water", "can't drink", "smells", "salty bore"],
    "no_cooling_extreme_heat": ["aircon dead", "no aircon", "so hot", "40 degrees", "42 degrees", "kids can't sleep"],
    "security": ["won't lock", "wont lock", "smashed window", "smashed", "can't secure", "broken lock", "break in"],
    "only_toilet_blocked": ["only toilet", "one toilet", "toilet blocked"],
    "medical_equipment": ["oxygen", "dialysis", "cpap", "ventilator", "medical"],
    "child_safety": ["kids", "baby", "children", "toddler"],
    "elder_safety": ["elderly", "old man", "old lady", "nan", "grandmother", "grandfather"],
    "accessibility": ["wheelchair", "ramp", "grab rail", "can't get in"],
    "vermin_pest": ["ants", "rats", "mice", "mosquito", "termites", "snake"],
}

VULNERABILITY_TRIGGERS = {
    "infants": ["baby", "newborn", "kids", "children", "toddler", "little ones"],
    "elderly": ["elderly", "old", "nan", "pop", "grandmother", "grandfather", "80 years"],
    "disability": ["wheelchair", "can't walk", "disabled", "mobility", "carer"],
    "medical_dependent": ["oxygen", "dialysis", "cpap", "ventilator", "chronic illness"],
    "overcrowded": ["three families", "12 people", "everyone in one house", "crowded"],
}

CATEGORY_TRIGGERS = {
    "plumbing": ["tap", "pipe", "hot water", "water pressure", "leak", "plumbing"],
    "electrical": ["powerpoint", "power point", "power", "lights", "wiring", "wire", "electrical", "trip"],
    "structural": ["roof", "ceiling", "floor", "verandah", "wall", "structural", "cyclone"],
    "cooling": ["aircon", "air con", "fan", "split system", "cooling", "air conditioner"],
    "water_quality": ["brown water", "tank water", "bore water", "clean water", "drinking water"],
    "sanitation": ["toilet", "sewage", "sewerage", "sewer", "backing up"],
    "security": ["door", "window", "lock", "gate", "secure", "break in"],
    "kitchen": ["stove", "fridge", "oven", "kitchen"],
    "bathroom": ["shower", "bath", "bathroom", "vanity"],
    "medical": ["oxygen", "dialysis", "medical", "cpap"],
    "accessibility": ["wheelchair", "ramp", "grab rail", "access", "mobility"],
    "other": ["ants", "rats", "mosquito", "screens", "wear and tear", "pest", "vermin"],
}

# ---------------------------------------------------------------------------
# Scoring weights. The need score uses ONLY these: nothing about location.
# ---------------------------------------------------------------------------

SAFETY_BASE = {"critical": 100, "high": 60, "medium": 25, "low": 8}

FLAG_WEIGHT = {
    "exposed_wiring": 30, "fire_risk": 25, "structural": 30, "no_water": 22,
    "no_hot_water": 8, "sewage": 25, "water_contamination": 15,
    "no_cooling_extreme_heat": 18, "security": 14, "only_toilet_blocked": 12,
    "medical_equipment": 28, "child_safety": 12, "elder_safety": 10,
    "accessibility": 12, "vermin_pest": 4,
}

VULNERABILITY_WEIGHT = {
    "infants": 0.2, "elderly": 0.18, "disability": 0.18,
    "medical_dependent": 0.3, "overcrowded": 0.12,
}

# Ageing: a fixed internal policy so a steady stream of new reports cannot keep
# pushing an older report down the queue. Each day a report waits adds need
# points, capped so safety stays dominant (the cap sits below the medium->high
# gap, so age lifts a job at most ~one tier). Mirrors lib/taxonomy.ts.
AGEING_POINTS_PER_DAY = 1
AGEING_CAP = 30

CATEGORY_TRADE = {
    "plumbing": "plumber", "electrical": "electrician", "structural": "carpenter",
    "cooling": "hvac", "water_quality": "plumber", "sanitation": "plumber",
    "security": "carpenter", "kitchen": "handyperson", "bathroom": "plumber",
    "medical": "electrician", "accessibility": "carpenter", "other": "handyperson",
}

# Typical on-site hours per job category (used by the efficiency model).
CATEGORY_DURATION_HOURS = {
    "plumbing": 2.5, "electrical": 2, "structural": 6, "cooling": 3,
    "water_quality": 3, "sanitation": 3, "security": 3, "kitchen": 2,
    "bathroom": 2.5, "medical": 2, "accessibility": 3, "other": 1.5,
}

# Response targets in working days, used to measure whether a job is "late".
# NT Government standard-area timeframes (fact sheet FS17, 2025): urgent within
# 2 business days, routine within 10. Remote areas are allowed 5 and 25; we
# deliberately apply the standard-area targets to every tenant.
TARGET_WORKING_DAYS = {"critical": 1, "high": 2, "medium": 10, "low": 10}
