import { MOB_TYPE_BY_SUBTYPE, SWARM_SPAWN_COUNT } from '../constants';

// What a sector is allowed to field, as a budget rather than a headcount.
//
// Sector difficulty used to be "spawn `level * 1.5 + 3` mobs from whatever the
// roster offers". That let a stronger archetype be added on top of the previous
// population at the same cost: unlocking the sniper at 13 dropped a 35%-of-bar
// attacker into a sector that already had its full complement of drones, and
// the harness measured the result as a 2.4x jump in peak pressure across one
// boundary.
//
// A budget makes an elite cost what it is worth. The entity cap stays, but as
// what it always should have been — a performance limit, not the difficulty
// model.

/**
 * What one entity of each archetype costs against the sector budget.
 *
 * Seeded from the plan's table and kept roughly proportional to sustained
 * threat: a swarm member is cheap because it is one small hit at a time, a
 * guardian is dear because it is durable and hits hard.
 */
export const THREAT_COST: Record<string, number> = {
  // Swarm is priced per member, but a pack is 2-3 bodies that can each occupy
  // an attack slot — and slots, not hit points, are the real constraint. At 0.4
  // a whole pack cost exactly one drone, which undervalued that.

  swarm: 0.5,
  drone: 1.0,
  phase: 1.4,
  moth: 1.5,
  sniper: 1.6,
  turret: 2.0,
  charger: 2.0,
  tracker: 2.1,
  guardian: 2.3,
  cerberus: 2.5,
};

export function threatCost(subtype: string): number {
  return THREAT_COST[subtype] ?? 1.0;
}

/** Entities one selection of this type brings — a swarm selection is a pack. */
export function selectionSize(subtype: string): number {
  if (subtype !== 'swarm') return 1;
  const [min, max] = SWARM_SPAWN_COUNT;
  return (min + max) / 2;
}

/** Budget cost of one *selection*, so a swarm pack is priced as a pack. */
export function selectionCost(subtype: string): number {
  return threatCost(subtype) * selectionSize(subtype);
}

/**
 * Threat a sector may field. Grows steadily rather than in steps, so a tier
 * boundary is not also a difficulty cliff.
 *
 * Calibrated to sit close to today's population early — a sector-1 roster of
 * drones and swarm comes out about the same size — and to diverge later, where
 * the roster is elite-heavy and headcount was overpaying.
 */
export function threatBudget(level: number): number {
  return 2 + level * 1.7;
}

/** Hard entity ceiling. Performance only; the budget decides difficulty. */
export const ENTITY_CAP = 50;

export interface RosterSelection {
  subtype: string;
  entities: number;
  cost: number;
}

export interface RosterPlan {
  selections: RosterSelection[];
  totalEntities: number;
  totalCost: number;
  budget: number;
}

/**
 * Fill a sector against its budget.
 *
 * Weights still choose *what* appears, so the unlock sequence and the feel of
 * each tier are unchanged; the budget decides *how many*. A selection that
 * would overrun the budget is skipped rather than truncated, so an expensive
 * mob never appears at a discount.
 */
export function planRoster(
  level: number,
  available: Array<{ subtype: string; spawnWeight: number }>,
  rng: () => number = Math.random,
): RosterPlan {
  const budget = threatBudget(level);
  const selections: RosterSelection[] = [];
  let spent = 0;
  let entities = 0;

  const totalWeight = available.reduce((n, m) => n + m.spawnWeight, 0);
  if (totalWeight <= 0 || available.length === 0) {
    return { selections, totalEntities: 0, totalCost: 0, budget };
  }

  const cheapest = Math.min(...available.map((m) => selectionCost(m.subtype)));
  let guard = 0;
  while (spent + cheapest <= budget && entities < ENTITY_CAP && guard++ < 400) {
    let roll = rng() * totalWeight;
    let picked = available[available.length - 1];
    for (const mob of available) {
      roll -= mob.spawnWeight;
      if (roll <= 0) {
        picked = mob;
        break;
      }
    }

    const cost = selectionCost(picked.subtype);
    const size = Math.round(selectionSize(picked.subtype));
    if (spent + cost > budget || entities + size > ENTITY_CAP) continue;

    selections.push({ subtype: picked.subtype, entities: size, cost });
    spent += cost;
    entities += size;
  }

  return { selections, totalEntities: entities, totalCost: spent, budget };
}

export function initEncounterBudgetApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_ENCOUNTER__ = {
    threatCost,
    selectionCost,
    selectionSize,
    threatBudget,
    planRoster,
    entityCap: ENTITY_CAP,
    costs: THREAT_COST,
    isKnownSubtype: (s: string) => MOB_TYPE_BY_SUBTYPE.has(s),
  };
}

declare global {
  interface Window {
    __PIXLAB_ENCOUNTER__?: {
      threatCost: typeof threatCost;
      selectionCost: typeof selectionCost;
      selectionSize: typeof selectionSize;
      threatBudget: typeof threatBudget;
      planRoster: typeof planRoster;
      entityCap: number;
      costs: typeof THREAT_COST;
      isKnownSubtype: (s: string) => boolean;
    };
  }
}
