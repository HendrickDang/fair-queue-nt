"""
Communities, trade bases and the transparent travel model.

Community and trade-base data are read from the web app's own JSON files
(nt-housing-triage/data), so there is one source of truth for locations.
The travel model mirrors nt-housing-triage/lib/data/distances.ts.
"""

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "nt-housing-triage" / "data"

# Remoteness tiers: T0 urban base, T1 regional town, T2 remote, T3 very remote/island.
REMOTE_TIERS = {"T2", "T3"}

# --- Travel model constants (documented assumptions, see distances.ts) ------
SPEED_KMH = {"road": 75, "air": 240, "barge": 20}
DETOUR_FACTOR = {"road": 1.3, "air": 1.05, "barge": 1.15}  # winding/unsealed roads
FIXED_OVERHEAD_HOURS = {"road": 0.25, "air": 1.5, "barge": 2}
COST_PER_KM = {"road": 0.85, "air": 6.5, "barge": 3.2}  # AUD
LABOUR_COST_PER_HOUR = 110  # AUD, loaded tradesperson rate
MODE_RANK = {"road": 0, "barge": 1, "air": 2}


@dataclass(frozen=True)
class Community:
    id: str
    name: str
    aliases: tuple
    region: str
    lat: float
    lon: float
    tier: str
    aria_plus: str
    population: int
    access: str
    wet_season_isolation: bool
    nearest_base: str

    @property
    def remote(self) -> bool:
        return self.tier in REMOTE_TIERS


@dataclass(frozen=True)
class TradeBase:
    id: str
    name: str
    lat: float
    lon: float


def _load():
    raw_c = json.loads((DATA_DIR / "communities.json").read_text(encoding="utf-8"))
    raw_b = json.loads((DATA_DIR / "trade-bases.json").read_text(encoding="utf-8"))
    communities = [
        Community(
            id=c["id"], name=c["name"], aliases=tuple(c["aliases"]), region=c["region"],
            lat=c["lat"], lon=c["lon"], tier=c["tier"], aria_plus=c["ariaPlus"],
            population=c["population"], access=c["access"],
            wet_season_isolation=c["wetSeasonIsolation"], nearest_base=c["nearestBase"],
        )
        for c in raw_c
    ]
    bases = [TradeBase(b["id"], b["name"], b["lat"], b["lon"]) for b in raw_b]
    return communities, bases


COMMUNITIES, TRADE_BASES = _load()
COMMUNITY_BY_ID = {c.id: c for c in COMMUNITIES}
BASE_BY_ID = {b.id: b for b in TRADE_BASES}


def haversine_km(a, b) -> float:
    """Great-circle distance in km between two objects with .lat and .lon."""
    r = 6371
    to_rad = math.radians
    d_lat = to_rad(b.lat - a.lat)
    d_lon = to_rad(b.lon - a.lon)
    h = math.sin(d_lat / 2) ** 2 + math.cos(to_rad(a.lat)) * math.cos(to_rad(b.lat)) * math.sin(d_lon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def base_for(community: Community) -> TradeBase:
    """The trade base that services a community (curated, else the nearest)."""
    if community.nearest_base in BASE_BY_ID:
        return BASE_BY_ID[community.nearest_base]
    return min(TRADE_BASES, key=lambda b: haversine_km(community, b))


def mode_for(a: str, b: str) -> str:
    """Travel between two places uses the harder of the two access modes."""
    return a if MODE_RANK[a] >= MODE_RANK[b] else b


def travel_leg(frm, to, mode: str) -> dict:
    """One-way leg: great-circle km x detour factor, plus a fixed overhead."""
    km = haversine_km(frm, to) * DETOUR_FACTOR[mode]
    hours = km / SPEED_KMH[mode] + FIXED_OVERHEAD_HOURS[mode]
    cost = km * COST_PER_KM[mode]
    return {"mode": mode, "km": km, "hours": hours, "cost": cost}


def round_trip(leg: dict) -> dict:
    return {"mode": leg["mode"], "km": leg["km"] * 2, "hours": leg["hours"] * 2, "cost": leg["cost"] * 2}


# --- Community name matching (mirrors matchCommunity in communities.ts) -----

def normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


_BY_NAME_LENGTH = sorted(COMMUNITIES, key=lambda c: -len(c.name))  # stable, like JS sort


def match_community(text: str):
    """First known community named anywhere in free text; longest names first."""
    haystack = f" {normalise(text)} "
    for c in _BY_NAME_LENGTH:
        for n in (c.name, *c.aliases):
            needle = normalise(n)
            if needle and f" {needle} " in haystack:
                return c
    return None
