/**
 * Generate the derived data artifacts from the curated community dataset.
 *
 *   npm run data:generate
 *
 * Produces data/distance-matrix.json: base->community travel legs using the
 * documented model in lib/data/distances.ts (haversine × detour factor). Swap
 * the model for a real road-routing matrix later; the shape stays the same.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMUNITIES, TRADE_BASES, baseForCommunity } from "@/lib/data/communities";
import { formatAud, roundTrip, travelLeg } from "@/lib/data/distances";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "data", "distance-matrix.json");

const legs = COMMUNITIES.map((community) => {
  const base = baseForCommunity(community);
  const oneWay = travelLeg(base, community, community.access);
  const rt = roundTrip(oneWay);
  return {
    communityId: community.id,
    communityName: community.name,
    tier: community.tier,
    ariaPlus: community.ariaPlus,
    access: community.access,
    baseId: base.id,
    baseName: base.name,
    mode: oneWay.mode,
    oneWayKm: Math.round(oneWay.km),
    roundTripKm: Math.round(rt.km),
    travelHours: Number(rt.hours.toFixed(2)),
    travelCost: Math.round(rt.cost),
  };
});

const artifact = {
  generatedAt: new Date().toISOString(),
  methodology:
    "Great-circle distance × a documented detour factor per access mode (road 1.30, barge 1.15, air 1.05). " +
    "See lib/data/distances.ts. Illustrative, not a routed road network.",
  bases: TRADE_BASES.map((b) => ({ id: b.id, name: b.name, lat: b.lat, lon: b.lon })),
  legs,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(`Wrote ${legs.length} base legs to ${outPath}`);
console.log(
  "Longest round trip:",
  legs
    .slice()
    .sort((a, b) => b.roundTripKm - a.roundTripKm)
    .slice(0, 3)
    .map((l) => `${l.communityName} ${l.roundTripKm} km (${formatAud(l.travelCost)})`)
    .join(", "),
);
