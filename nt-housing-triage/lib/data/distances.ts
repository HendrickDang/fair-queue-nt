import type { AccessMode } from "@/lib/taxonomy";
import { haversineKm } from "./communities";

/**
 * Transparent travel model.
 *
 * Distances are derived from real coordinates with a documented detour factor
 * rather than a hard-coded matrix, so the demo stays reproducible and the
 * methodology is auditable. Swap `travelLeg` for a real road-routing matrix
 * later without touching the engine — it only depends on this function's shape.
 */

export interface TravelLeg {
  mode: AccessMode;
  km: number;
  hours: number;
  cost: number;
}

/** Average speeds (km/h) including typical NT road/sea/air conditions. */
export const SPEED_KMH: Record<AccessMode, number> = {
  road: 75,
  air: 240,
  barge: 20,
};

/** Winding / unsealed-road detour factor applied to great-circle distance. */
export const DETOUR_FACTOR: Record<AccessMode, number> = {
  road: 1.3,
  air: 1.05,
  barge: 1.15,
};

/** Fixed prep, loading and handover time per leg (hours). */
export const FIXED_OVERHEAD_HOURS: Record<AccessMode, number> = {
  road: 0.25,
  air: 1.5,
  barge: 2,
};

/** Operating cost per km (AUD) for the vehicle/aircraft/vessel. */
export const COST_PER_KM: Record<AccessMode, number> = {
  road: 0.85,
  air: 6.5,
  barge: 3.2,
};

/** Loaded tradesperson cost per hour (AUD). */
export const LABOUR_COST_PER_HOUR = 110;

const MODE_RANK: Record<AccessMode, number> = { road: 0, barge: 1, air: 2 };

/** Travel between two points uses the harder of the two access modes. */
export function modeFor(a: AccessMode, b: AccessMode): AccessMode {
  return MODE_RANK[a] >= MODE_RANK[b] ? a : b;
}

export function travelLeg(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  mode: AccessMode,
): TravelLeg {
  const km = haversineKm(from, to) * DETOUR_FACTOR[mode];
  const hours = km / SPEED_KMH[mode] + FIXED_OVERHEAD_HOURS[mode];
  const cost = km * COST_PER_KM[mode];
  return { mode, km, hours, cost };
}

export function roundTrip(leg: TravelLeg): TravelLeg {
  return {
    mode: leg.mode,
    km: leg.km * 2,
    hours: leg.hours * 2,
    cost: leg.cost * 2,
  };
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString("en-AU")} km`;
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} h`;
}

export function formatAud(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}
