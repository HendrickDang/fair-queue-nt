"""
Deterministic, offline fault-report parser (free text -> structured job).

Mirrors nt-housing-triage/lib/parser/fallback.ts. This is the parser the demo
runs; the optional fine-tuned Gemma model has the same output schema.

Key steps:
  1. find urgency flags from trigger phrases (plus a few regex rules)
  2. find household vulnerabilities
  3. pick the category with the most evidence
  4. set a rubric safety level, then apply the cross-field escalation rules
  5. find the community named in the text

`fail_safe()` at the bottom is our proposed mitigation, evaluated in
experiment E3: a report the parser cannot read confidently goes to a person
instead of quietly landing at the back of the queue.
"""

import re

from .geo import match_community
from .taxonomy import (
    CATEGORY_TRADE, CATEGORY_TRIGGERS, FLAG_TRIGGERS, SAFETY_ORDER, VULNERABILITY_TRIGGERS,
)

HEAT_RE = re.compile(r"(3[89]|4\d)\s*(degrees|deg\b|°|c\b)", re.I)
WATER_CONTAMINATION_RE = re.compile(
    r"\b(brown|dirty|muddy|salty|smells?\s+(off|bad|funny)|can'?t drink|cant drink)\b", re.I
)
FIRE_WORDS_RE = re.compile(r"\b(sparks?|sparking|burning|smoke|scorched)\b")
DERIVED_FLAGS = {"child_safety", "elder_safety"}  # only added alongside a real hazard

FLAG_TO_CATEGORY = {
    "exposed_wiring": "electrical", "fire_risk": "electrical", "sewage": "sanitation",
    "only_toilet_blocked": "sanitation", "no_water": "plumbing", "no_hot_water": "plumbing",
    "structural": "structural", "no_cooling_extreme_heat": "cooling",
    "water_contamination": "water_quality", "security": "security",
    "medical_equipment": "medical", "accessibility": "accessibility", "vermin_pest": "other",
}

CRITICAL_FLAGS = ["exposed_wiring", "fire_risk", "structural", "medical_equipment"]
HIGH_FLAGS = ["no_water", "no_cooling_extreme_heat", "water_contamination", "security", "only_toilet_blocked"]
MEDIUM_FLAGS = ["no_hot_water", "vermin_pest", "accessibility"]
MEDIUM_CATEGORIES = {
    "plumbing", "electrical", "structural", "cooling", "sanitation", "security",
    "water_quality", "kitchen",
}


_PHRASE_RE = {}


def has_phrase(haystack: str, phrase: str) -> bool:
    """True if `phrase` starts at a word boundary in `haystack`.

    Plain substring matching misread "tenant" as "nan" (elderly), "occupants"
    as "ants" and "cold" as "old". Matching from the start of a word fixes
    that while "overflow" still matches "overflowing"."""
    if phrase not in _PHRASE_RE:
        _PHRASE_RE[phrase] = re.compile(r"(^|[^a-z0-9])" + re.escape(phrase))
    return bool(_PHRASE_RE[phrase].search(haystack))


def _contains_any(haystack: str, phrases) -> bool:
    return any(has_phrase(haystack, p) for p in phrases)


# --- Step 1: urgency flags ---------------------------------------------------

def detect_flags(text: str) -> list:
    found = []
    for flag, triggers in FLAG_TRIGGERS.items():
        if flag in DERIVED_FLAGS:
            continue
        if flag == "water_contamination":
            if WATER_CONTAMINATION_RE.search(text):
                found.append(flag)
            continue
        if flag == "no_cooling_extreme_heat":
            cooling_word = re.search(r"aircon|air con|air conditioner|split system|cooling", text)
            hot = HEAT_RE.search(text) or re.search(r"so hot|can'?t sleep|too hot", text)
            if cooling_word and (hot or re.search(r"dead|broke|not work|no ", text)):
                found.append(flag)
            continue
        if _contains_any(text, triggers):
            found.append(flag)
    # An exposed conductor that is arcing or scorching is also a fire risk.
    if "exposed_wiring" in found and FIRE_WORDS_RE.search(text) and "fire_risk" not in found:
        found.append("fire_risk")
    return found


# --- Step 2: vulnerability ---------------------------------------------------

def detect_vulnerability(text: str) -> list:
    return [v for v, triggers in VULNERABILITY_TRIGGERS.items() if _contains_any(text, triggers)]


# --- Step 3: category --------------------------------------------------------

def detect_category(text: str, flags: list) -> str:
    scores = {}  # insertion order matters for tie-breaking, as in the JS Map
    for c, triggers in CATEGORY_TRIGGERS.items():
        hits = sum(1 for t in triggers if has_phrase(text, t))
        if hits > 0:
            scores[c] = scores.get(c, 0) + hits
    for f in flags:
        c = FLAG_TO_CATEGORY.get(f)
        if c:
            scores[c] = scores.get(c, 0) + 2
    best, best_score = "other", 0
    for c, s in scores.items():
        if s > best_score:
            best, best_score = c, s
    return best


# --- Step 4: safety level ------------------------------------------------------

def _bump(current: str, to: str) -> str:
    return to if SAFETY_ORDER.index(to) > SAFETY_ORDER.index(current) else current


def escalate_safety(safety_level: str, flags, vulnerability) -> str:
    """Cross-field escalation rules shared by the generator, parser and engine."""
    flags, vuln = set(flags), set(vulnerability)
    vulnerable = bool(vuln & {"infants", "elderly", "medical_dependent"})
    level = safety_level
    if "structural" in flags or "exposed_wiring" in flags:
        level = _bump(level, "critical")
    if "sewage" in flags and "only_toilet_blocked" not in flags:
        level = _bump(level, "critical")
    if "medical_equipment" in flags:
        level = _bump(level, "critical")
    if "no_water" in flags and vulnerable:
        level = _bump(level, "critical")
    if "no_cooling_extreme_heat" in flags and vuln & {"infants", "elderly"}:
        level = _bump(level, "high")
    if "security" in flags and "child_safety" in flags:
        level = _bump(level, "critical")
    if "only_toilet_blocked" in flags or "water_contamination" in flags:
        level = _bump(level, "high")
    if "vermin_pest" in flags and "child_safety" in flags:
        level = _bump(level, "high")
    if "accessibility" in flags and "disability" in vuln:
        level = _bump(level, "critical")
    return level


def _rubric_safety(flags, category) -> str:
    s = set(flags)
    if any(f in s for f in CRITICAL_FLAGS):
        return "critical"
    if any(f in s for f in HIGH_FLAGS):
        return "high"
    if any(f in s for f in MEDIUM_FLAGS):
        return "medium"
    return "medium" if category in MEDIUM_CATEGORIES else "low"


def _derive_trade(category, flags, safety) -> str:
    if safety == "low":
        return "handyperson"
    base = CATEGORY_TRADE[category]
    if ("exposed_wiring" in flags or "medical_equipment" in flags) and base != "electrician":
        return "multi"
    return base


# --- The parser --------------------------------------------------------------

def parse(raw_text: str) -> dict:
    text = raw_text.lower()
    flags = detect_flags(text)
    vulnerability = detect_vulnerability(text)
    # Child/elder safety only count alongside an actual hazard.
    if flags and "infants" in vulnerability:
        flags.append("child_safety")
    if flags and "elderly" in vulnerability:
        flags.append("elder_safety")
    category = detect_category(text, flags)
    safety = escalate_safety(_rubric_safety(flags, category), flags, vulnerability)
    community = match_community(raw_text)
    confidence = min(
        0.95, 0.35 + len(flags) * 0.12 + (0.2 if community else 0) + (0.1 if vulnerability else 0)
    )
    return {
        "category": category,
        "safety_level": safety,
        "urgency_flags": flags,
        "occupant_vulnerability": vulnerability,
        "trade_required": _derive_trade(category, flags, safety),
        "community": community.name if community else "",
        "confidence": round(confidence, 2),
    }


# --- Proposed mitigation (evaluated in E3) -------------------------------------

def fail_safe(parsed: dict) -> dict:
    """If the parser recognised no hazard at all, it has not understood the
    report. Rather than score it as routine, mark it for a person to read and
    hold it at 'high' until they do. Uncertainty goes to a human, never to the
    back of the queue."""
    out = dict(parsed)
    out["needs_human_check"] = not parsed["urgency_flags"]
    if out["needs_human_check"]:
        out["safety_level"] = _bump(parsed["safety_level"], "high")
    return out
