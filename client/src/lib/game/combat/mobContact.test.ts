import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entity, Level } from '../types';
import {
  CERBERUS_BITE_GUARD_MS,
  mobReachesPlayer,
  resolveMobMeleeAttack,
  type MobAttackInput,
} from './mobContact';

const levelOf = (rows: string[]): Level =>
  ({
    width: rows[0].length,
    height: rows.length,
    tiles: rows.map((r) => [...r].map((c) => (c === '#' ? 'wall' : 'floor'))),
  }) as unknown as Level;

/** Player at (2,2), rock at (3,1) so line of sight can be broken on purpose. */
const ROOM = levelOf([
  '#####',
  '#..##',
  '#...#',
  '#...#',
  '#####',
]);

const PLAYER = { x: 2, y: 2 };

const mob = (over: Partial<Entity> = {}): Entity =>
  ({
    id: 'enemy-1',
    type: 'enemy',
    mobSubtype: 'drone',
    pos: { x: 3, y: 2 },
    hp: 20,
    damage: 10,
    attackCooldown: 500,
    ...over,
  }) as Entity;

const attack = (over: Partial<MobAttackInput> = {}): MobAttackInput => ({
  attacker: mob(),
  now: 10_000,
  lastDamageTime: 0,
  attackerInWall: false,
  defense: 0,
  hp: 100,
  maxHp: 100,
  sector: 3,
  claimSlot: () => true,
  ...over,
});

test('an adjacent ground mob on the player row reaches', () => {
  const reach = mobReachesPlayer(mob(), PLAYER, ROOM);
  assert.equal(reach.reaches, true);
  assert.equal(reach.distance, 1);
  assert.equal(reach.attackerInWall, false);
});

test('a ground mob off the cardinals does not, however close', () => {
  const diagonal = mobReachesPlayer(mob({ pos: { x: 3, y: 3 } }), PLAYER, ROOM);
  assert.ok(diagonal.distance < 1.5, 'it is well inside melee range');
  assert.equal(diagonal.reaches, false);
});

test('a flyer at the same diagonal does', () => {
  assert.equal(mobReachesPlayer(mob({ mobSubtype: 'moth', pos: { x: 3, y: 3 } }), PLAYER, ROOM).reaches, true);
});

test('a ranged mob has no melee reach at all — only the shared tile', () => {
  // The rule reads as "ranged mobs reach at 1 tile", but the outer gate admits
  // a ranged mob only when it is standing *on* the player, so adjacency is not
  // enough. A sniper backed into the player gets no free melee hit on top of
  // its shots.
  assert.equal(mobReachesPlayer(mob({ isRanged: true }), PLAYER, ROOM).reaches, false);
  assert.equal(
    mobReachesPlayer(mob({ isRanged: true, pos: { x: 2, y: 4 } }), PLAYER, ROOM).reaches,
    false,
  );
});

test('sharing the player tile always reaches, even for a ranged mob', () => {
  assert.equal(mobReachesPlayer(mob({ isRanged: true, pos: { ...PLAYER } }), PLAYER, ROOM).reaches, true);
});

test('a mob in rock is flagged, and the flag is what stops the hit', () => {
  const inWall = mobReachesPlayer(mob({ mobSubtype: 'phase', pos: { x: 3, y: 1 } }), PLAYER, ROOM);
  assert.equal(inWall.attackerInWall, true);
  // The symmetry rule: what the player cannot hit back cannot hit.
  assert.equal(resolveMobMeleeAttack(attack({ attackerInWall: true })).kind, 'none');
});

test('a fresh mob in contact hits, and then has to wait out its cadence', () => {
  const first = resolveMobMeleeAttack(attack({ now: 10_000, lastDamageTime: 0 }));
  assert.equal(first.kind, 'hit');
  assert.ok(first.kind === 'hit' && first.damage > 0);
  assert.equal(first.kind === 'hit' && first.newHp, 100 - (first.kind === 'hit' ? first.damage : 0));

  const tooSoon = resolveMobMeleeAttack(attack({ now: 10_200, lastDamageTime: 10_000 }));
  assert.equal(tooSoon.kind, 'none');
  const afterCadence = resolveMobMeleeAttack(attack({ now: 10_500, lastDamageTime: 10_000 }));
  assert.equal(afterCadence.kind, 'hit');
});

test('hp floors at zero rather than going negative', () => {
  const out = resolveMobMeleeAttack(attack({ hp: 1, maxHp: 100, attacker: mob({ damage: 999 }) }));
  assert.equal(out.kind === 'hit' && out.newHp, 0);
});

test('without a slot there is no swing — and the slot is claimed anyway', () => {
  let claims = 0;
  const out = resolveMobMeleeAttack(
    attack({
      claimSlot: () => {
        claims++;
        return false;
      },
    }),
  );
  assert.equal(out.kind, 'none');
  assert.equal(claims, 1, 'the budget is charged for contact, not for landing a hit');
});

test('the slot is claimed on a tick the cadence would refuse', () => {
  // The ordering the header calls out: moving the claim inside the condition
  // would let a mob on cooldown hold the player without paying for it.
  let claims = 0;
  const out = resolveMobMeleeAttack(
    attack({
      now: 10_100,
      lastDamageTime: 10_000,
      claimSlot: () => {
        claims++;
        return true;
      },
    }),
  );
  assert.equal(out.kind, 'none');
  assert.equal(claims, 1);
});

test('a boss mid-cycle only lands during an execution, and only once', () => {
  const executing = mob({ isBoss: true, bossPhase: 'execute', bossPhaseSince: 9_000, bossPhaseHits: 0 });
  assert.equal(resolveMobMeleeAttack(attack({ attacker: executing })).kind, 'hit');

  const alreadyHit = mob({ isBoss: true, bossPhase: 'execute', bossPhaseSince: 9_000, bossPhaseHits: 1 });
  assert.equal(resolveMobMeleeAttack(attack({ attacker: alreadyHit })).kind, 'none');

  for (const phase of ['ready', 'telegraph', 'recover'] as const) {
    const other = mob({ isBoss: true, bossPhase: phase, bossPhaseSince: 9_000, bossPhaseHits: 0 });
    assert.equal(resolveMobMeleeAttack(attack({ attacker: other })).kind, 'none', phase);
  }
});

test('an ordinary mob is not gated by a cycle it does not have', () => {
  const out = resolveMobMeleeAttack(attack({ attacker: mob({ bossPhase: undefined }) }));
  assert.equal(out.kind, 'hit');
  assert.equal(out.kind === 'hit' && out.countsAgainstCycle, true);
});

test('the tri-bite runs on its combo clock and claims no slot', () => {
  let claims = 0;
  const cerberus = mob({
    mobSubtype: 'cerberus',
    biteComboCount: 1,
    lastBiteTime: 10_000,
    lastDamageComboCount: 0,
  });
  const out = resolveMobMeleeAttack(
    attack({
      attacker: cerberus,
      now: 10_050,
      claimSlot: () => {
        claims++;
        return true;
      },
    }),
  );
  assert.equal(out.kind, 'hit');
  assert.equal(out.kind === 'hit' && out.comboCount, 1, 'the caller records which bite landed');
  assert.equal(out.kind === 'hit' && out.countsAgainstCycle, false);
  assert.equal(claims, 0, 'a per-bite slot claim would triple the combo cost');
});

test('the same bite cannot land twice', () => {
  const cerberus = mob({
    mobSubtype: 'cerberus',
    biteComboCount: 1,
    lastBiteTime: 10_000,
    lastDamageComboCount: 1,
  });
  assert.equal(resolveMobMeleeAttack(attack({ attacker: cerberus, now: 10_050 })).kind, 'none');
});

test('the bite guard is a frame guard, not a cadence', () => {
  const cerberus = mob({
    mobSubtype: 'cerberus',
    biteComboCount: 1,
    lastBiteTime: 10_000,
    lastDamageComboCount: 0,
    attackCooldown: 1_000,
  });
  // Inside the 100ms guard since the last damage: refused.
  const guarded = resolveMobMeleeAttack(
    attack({ attacker: cerberus, now: 10_050, lastDamageTime: 10_000 }),
  );
  assert.equal(guarded.kind, 'none');
  // Past the guard but well inside the 1s cadence: allowed, because the combo
  // is the cadence.
  const past = resolveMobMeleeAttack(
    attack({ attacker: cerberus, now: 10_000 + CERBERUS_BITE_GUARD_MS + 1, lastDamageTime: 10_000 }),
  );
  assert.equal(past.kind, 'hit');
});
