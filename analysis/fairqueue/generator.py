"""
Synthetic fault reports for remote NT housing. No real tenant data is used.

Two things are generated here:

1. QUEUES for the ranking experiments (E1, E2, E4). Each job is drawn from the
   same 22 fault scenarios as the web app's generator, with ground-truth labels,
   placed in a community chosen so that a set share of jobs is remote.

2. REGISTER VARIANTS for the parser robustness experiment (E3). The same fault
   is written four ways, because who gets misread by a parser is an equity
   question in its own right:
     - "app_style":  the app generator's own phrasing (shares the parser's vocabulary)
     - "officer":    a formal housing-officer note
     - "sms":        informal spelling and SMS shorthand
     - "kriol_inf":  Kriol-influenced English

   IMPORTANT: the Kriol-influenced variants were written by the team, who are
   not Kriol speakers. They are rough approximations for stress-testing only,
   are not authentic Kriol, and must be replaced by examples written or
   checked by Kriol speakers (e.g. through the NT Aboriginal Interpreter
   Service) before any real evaluation.
"""

import re

import numpy as np

from .geo import COMMUNITIES
from .parser import escalate_safety

# --- The 22 scenarios (mirrors SCENARIOS in nt-housing-triage/lib/data/generator.ts)
# Each: category, base safety, flags, vulnerabilities, app-style fragments,
# then our officer-note and Kriol-influenced versions of the same fault.
SCENARIOS = [
    dict(category="plumbing", base="high", flags=["no_water"], vuln=["infants", "elderly"],
         app=["no water at all for two days", "nothing coming out of any tap", "water cut off since yesterday"],
         officer="Tenant advises no water supply to the dwelling for 48 hours. Household includes an infant and an elderly resident.",
         kriol="nomo wota longa haus two day now, biginini en olgamen stap hia"),
    dict(category="plumbing", base="medium", flags=[], vuln=[],
         app=["tap leaking under the sink for weeks", "dripping tap in the kitchen", "water pressure gone in the shower"],
         officer="Tenant reports an ongoing leak beneath the kitchen sink.",
         kriol="tap bin lik long time andanith sink"),
    dict(category="plumbing", base="medium", flags=["no_hot_water"], vuln=[],
         app=["no hot water since tuesday", "only cold showers for a week", "hot water system stopped"],
         officer="Hot water system not operating; tenant has had cold water only for one week.",
         kriol="hot wota nomo werk, onli kol showa one wik"),
    dict(category="plumbing", base="high", flags=["sewage"], vuln=[],
         app=["sewage overflowing outside the back door", "sewerage backing up in the yard", "smells like poo near the bathroom"],
         officer="Sewer overflow reported at the rear of the property.",
         kriol="sewage im kamap longa yad, big smel"),
    dict(category="electrical", base="critical", flags=["exposed_wiring", "fire_risk"], vuln=[],
         app=["sparks coming out of the powerpoint", "wire hanging out of the wall", "burning smell from the switchboard"],
         officer="Tenant reports arcing from a general power outlet and a burning odour at the switchboard.",
         kriol="pawa point im sparkin, smok kamat"),
    dict(category="electrical", base="critical", flags=["exposed_wiring", "medical_equipment"], vuln=["medical_dependent"],
         app=["sparks from the powerpoint near the oxygen machine", "power point scorched where the dialysis machine plugs in"],
         officer="Power outlet supplying the resident's oxygen concentrator is scorched. Resident depends on home oxygen.",
         kriol="pawa point brok wea oksijen masheen plag in, olmen nidim"),
    dict(category="electrical", base="medium", flags=[], vuln=[],
         app=["lights flicker and trip the box", "no power in the back rooms", "powerpoint dead in the lounge"],
         officer="Intermittent loss of lighting; circuit breaker tripping.",
         kriol="lait flikaflika en pawa go off"),
    dict(category="structural", base="critical", flags=["structural", "child_safety"], vuln=["infants"],
         app=["roof is leaking right over my kids bed and the ceiling is sagging", "ceiling caving in above the children", "roof caving over the bedroom"],
         officer="Storm damage: ceiling sagging above the children's bedroom and roof leaking.",
         kriol="ruf lik ola wota la biginini bed, siling im go down"),
    dict(category="structural", base="high", flags=["structural"], vuln=[],
         app=["wall cracked right through after the cyclone", "floor gave way near the door", "verandah posts collapsing"],
         officer="Structural crack through an external wall following the cyclone.",
         kriol="wol im brok big krak afta saiklon"),
    dict(category="cooling", base="high", flags=["no_cooling_extreme_heat"], vuln=["infants", "elderly"],
         app=["aircon dead and its 40 degrees", "no aircon and the kids cant sleep", "split system died in the heat"],
         officer="Air-conditioning unit failed during a heatwave; infant and elderly occupants.",
         kriol="aircon nomo werk, too hot, biginini en olgamen kan sliip"),
    dict(category="cooling", base="medium", flags=[], vuln=[],
         app=["fan broke in the bedroom", "split system leaking water", "aircon not cooling properly"],
         officer="Bedroom ceiling fan not operational.",
         kriol="fan brok la bedrum"),
    dict(category="water_quality", base="high", flags=["water_contamination", "child_safety"], vuln=["infants"],
         app=["water from the tap is brown and smells", "tank water is dirty and cant drink it", "bore water salty and smells off"],
         officer="Tenant reports discoloured, malodorous tap water; young children in the household.",
         kriol="wota la tap im braun en smel nogudwan, kid kan dringk"),
    dict(category="sanitation", base="high", flags=["only_toilet_blocked", "sewage"], vuln=[],
         app=["toilet blocked and its the only one in the house", "only toilet backing up", "one toilet blocked and overflowing"],
         officer="The sole toilet in the dwelling is blocked and overflowing.",
         kriol="onli wan toilet en im blok ap"),
    dict(category="security", base="high", flags=["security"], vuln=[],
         app=["back door wont lock and the window got smashed", "cant lock the house at night", "front gate broken and lock hanging off"],
         officer="Rear door lock defective and a window broken; dwelling cannot be secured.",
         kriol="dowa kan lok en windo brok"),
    dict(category="security", base="high", flags=["security", "child_safety"], vuln=["infants"],
         app=["door wont lock and there was a break in, kids scared", "windows smashed and cant secure the house with the baby"],
         officer="Break-in reported; doors cannot be locked. Infant in the household.",
         kriol="samwan bin breikin, dowa kan lok, biginini frait"),
    dict(category="kitchen", base="medium", flags=[], vuln=[],
         app=["stove stopped working and fridge died last week", "oven sparking and fridge not cold", "stove not working"],
         officer="Stove inoperable; refrigerator has failed.",
         kriol="stob nomo werk, fridj brok"),
    dict(category="bathroom", base="low", flags=[], vuln=[],
         app=["shower head dripping and a tile cracked", "bath leaking through the floor slowly", "shower no water pressure"],
         officer="Shower head dripping; cracked tile in the bathroom.",
         kriol="showa drip drip"),
    dict(category="medical", base="critical", flags=["medical_equipment"], vuln=["medical_dependent"],
         app=["oxygen machine has no power", "dialysis needs a reliable socket", "cpap machine wont run, power point dead"],
         officer="No power to the resident's oxygen concentrator.",
         kriol="oksijen masheen nomo pawa"),
    dict(category="accessibility", base="critical", flags=["accessibility"], vuln=["disability"],
         app=["wheelchair ramp fell apart and cant get in the house", "grab rail fell off the wall in the bathroom", "cant get the chair through the door"],
         officer="Wheelchair ramp has collapsed; resident with a disability cannot enter the dwelling.",
         kriol="ramp brok, olmen la wilchea kan go insaid"),
    dict(category="other", base="medium", flags=["vermin_pest"], vuln=[],
         app=["ants everywhere in the kitchen", "rats in the roof at night", "termites in the back wall"],
         officer="Ant infestation in the kitchen.",
         kriol="ants ebriwea la kitchen"),
    dict(category="other", base="high", flags=["vermin_pest", "child_safety"], vuln=["infants"],
         app=["snake in the yard near the kids", "snake came into the laundry"],
         officer="Snake sighted in the yard near young children.",
         kriol="snek la yad klostu biginini"),
    dict(category="other", base="low", flags=[], vuln=[],
         app=["mosquito screens torn", "general wear and tear", "loose hinge on the cupboard"],
         officer="Fly screens torn.",
         kriol="skrin brok"),
]

# Relative frequency of each scenario in a queue. ASSUMPTION: routine repairs
# are far more common than emergencies, so low/medium scenarios are weighted
# 3, high 1.5 and critical 1. Results are reported for this mix; the direction
# of every finding also holds with uniform weights (run_experiments.py --uniform).
_BASE_WEIGHT = {"low": 3.0, "medium": 3.0, "high": 1.5, "critical": 1.0}


def true_safety(s) -> str:
    """Ground-truth safety level of a scenario, using the shared escalation rules."""
    return escalate_safety(s["base"], s["flags"], s["vuln"])


def scenario_weights(uniform: bool = False) -> np.ndarray:
    w = np.array([1.0 if uniform else _BASE_WEIGHT[true_safety(s)] for s in SCENARIOS])
    return w / w.sum()


def label(s, community) -> dict:
    """The structured report a perfect parser would produce for scenario s."""
    return {
        "category": s["category"],
        "safety_level": true_safety(s),
        "urgency_flags": list(s["flags"]),
        "occupant_vulnerability": list(s["vuln"]),
        "community": community.name,
    }


_REMOTE = [c for c in COMMUNITIES if c.remote]
_NON_REMOTE = [c for c in COMMUNITIES if not c.remote]


def sample_community(rng: np.random.Generator, remote_share: float):
    """ASSUMPTION: a set share of reports come from remote (T2/T3) communities;
    within each group, communities are equally likely."""
    pool = _REMOTE if rng.random() < remote_share else _NON_REMOTE
    return pool[rng.integers(len(pool))]


def sample_queue(rng, n: int, remote_share: float = 0.5, uniform: bool = False):
    """n (scenario, community) pairs: the raw material for one simulated queue."""
    w = scenario_weights(uniform)
    idx = rng.choice(len(SCENARIOS), size=n, p=w)
    return [(SCENARIOS[i], sample_community(rng, remote_share)) for i in idx]


# --- Register variants for E3 --------------------------------------------------

# Common informal spellings and SMS shorthand. Each is applied with
# probability 0.7 per occurrence, so variants differ from report to report.
SMS_SUBS = {
    "water": "wata", "sparks": "sparkn", "sparking": "sparkn", "toilet": "toilt",
    "ceiling": "cieling", "sagging": "saggin", "leaking": "leakin", "coming": "comin",
    "nothing": "nuthin", "children": "chldrn", "kids": "kidz", "baby": "bub",
    "powerpoint": "pwr point", "aircon": "a/c", "degrees": "deg", "overflowing": "overflowin",
    "smashed": "smashd", "oxygen": "oxy", "wheelchair": "wheelchar", "sewage": "sewrage",
    "sewerage": "sewrage", "brown": "brwn", "lock": "lok", "dead": "ded", "house": "hse",
    "caving": "cavin", "cracked": "crakd", "smells": "smels", "burning": "burnin",
}


def to_sms(text: str, rng) -> str:
    def swap(m):
        w = m.group(0)
        return SMS_SUBS[w] if w in SMS_SUBS and rng.random() < 0.7 else w
    return re.sub(r"[a-z]+", swap, text.lower().replace("'", ""))


# How the app-style reports mention who lives in the house, so all four
# registers carry the same facts as the ground truth.
_VULN_CLAUSE = {"infants": "got a baby here", "elderly": "my nan lives here"}


def _app_text(s, frag, community) -> str:
    clauses = [_VULN_CLAUSE[v] for v in s["vuln"] if v in _VULN_CLAUSE]
    return ", ".join([frag, *clauses, community.name])


def register_variants(rng, per_scenario: int = 30):
    """For every scenario, `per_scenario` reports in each register, each placed
    in a random community. Returns rows of (register, scenario index, text, truth)."""
    rows = []
    for si, s in enumerate(SCENARIOS):
        truth = true_safety(s)
        for _ in range(per_scenario):
            c = COMMUNITIES[rng.integers(len(COMMUNITIES))]
            frag = s["app"][rng.integers(len(s["app"]))]
            app_text = _app_text(s, frag, c)
            rows.append(("app_style", si, app_text, truth))
            rows.append(("officer", si, f"{s['officer']} Location: {c.name}.", truth))
            rows.append(("sms", si, to_sms(app_text, rng), truth))
            rows.append(("kriol_inf", si, f"{s['kriol']} longa {c.name}", truth))
    return rows
