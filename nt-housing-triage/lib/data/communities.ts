import communitiesRaw from "@/data/communities.json";
import tradeBasesRaw from "@/data/trade-bases.json";
import type { AriaClass, AccessMode, Tier, Trade } from "@/lib/taxonomy";

export interface Community {
  id: string;
  name: string;
  aliases: string[];
  region: string;
  lat: number;
  lon: number;
  tier: Tier;
  ariaPlus: AriaClass;
  population: number;
  access: AccessMode;
  wetSeasonIsolation: boolean;
  nearestBase: string;
}

export interface TradeBase {
  id: string;
  name: string;
  lat: number;
  lon: number;
  trades: Trade[];
}

export const COMMUNITIES = communitiesRaw as unknown as Community[];
export const TRADE_BASES = tradeBasesRaw as unknown as TradeBase[];

const COMMUNITY_BY_ID = new Map(COMMUNITIES.map((c) => [c.id, c]));
const BASE_BY_ID = new Map(TRADE_BASES.map((b) => [b.id, b]));

/** Normalise free text so "Port Keats", "port keats" and "Wadeye" all resolve. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COMMUNITY_BY_ALIAS = new Map<string, Community>();
for (const c of COMMUNITIES) {
  COMMUNITY_BY_ALIAS.set(normalise(c.id), c);
  COMMUNITY_BY_ALIAS.set(normalise(c.name), c);
  for (const alias of c.aliases) COMMUNITY_BY_ALIAS.set(normalise(alias), c);
}

/**
 * Resolve a community from a name, id or alias. Falls back to a case-insensitive
 * substring match so "in Wadeye somewhere" still resolves. Returns null if the
 * community is not in the dataset (the parser keeps the raw string in that case).
 */
export function getCommunity(nameOrId: string | null | undefined): Community | null {
  if (!nameOrId) return null;
  const key = normalise(nameOrId);
  const direct = COMMUNITY_BY_ALIAS.get(key);
  if (direct) return direct;

  // substring match, longest name first so "Alice Springs" beats "Alice"
  const candidates = COMMUNITIES.filter((c) => {
    const n = normalise(c.name);
    return key.includes(n) || n.includes(key);
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.name.length - a.name.length);
  return candidates[0];
}

export function getCommunityById(id: string): Community | null {
  return COMMUNITY_BY_ID.get(id) ?? null;
}

/**
 * Find the first community mentioned anywhere in free text. Longest names are
 * checked first so "Alice Springs" wins over a stray "Alice".
 */
export function matchCommunity(text: string): Community | null {
  const haystack = ` ${normalise(text)} `;
  const ordered = [...COMMUNITIES].sort((a, b) => b.name.length - a.name.length);
  for (const c of ordered) {
    const names = [c.name, ...c.aliases];
    for (const n of names) {
      const needle = normalise(n);
      if (needle && haystack.includes(` ${needle} `)) return c;
    }
  }
  return null;
}

export function getTradeBase(id: string): TradeBase | null {
  return BASE_BY_ID.get(id) ?? null;
}

/** The trade base that services a community (curated, falling back to nearest). */
export function baseForCommunity(community: Community): TradeBase {
  const curated = BASE_BY_ID.get(community.nearestBase);
  if (curated) return curated;
  return nearestBase(community);
}

export function nearestBase(community: Community): TradeBase {
  let best = TRADE_BASES[0];
  let bestKm = Number.POSITIVE_INFINITY;
  for (const base of TRADE_BASES) {
    const km = haversineKm(community, base);
    if (km < bestKm) {
      bestKm = km;
      best = base;
    }
  }
  return best;
}

/** Great-circle distance in km between two lat/lon points. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const TIER_LABEL: Record<Tier, string> = {
  T0: "Urban base",
  T1: "Regional town",
  T2: "Remote",
  T3: "Very remote / island",
};

export const ARIA_LABEL: Record<AriaClass, string> = {
  highly_accessible: "Highly accessible",
  accessible: "Accessible",
  moderately_accessible: "Moderately accessible",
  remote: "Remote",
  very_remote: "Very remote",
};
