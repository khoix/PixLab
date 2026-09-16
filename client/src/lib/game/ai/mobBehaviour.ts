/**
 * M8.7 — what each mob decides to do with its tick.
 *
 * The largest single block left in `GameCanvas` and the last piece of the
 * simulation still living inside a React component: ten subtypes and three
 * bosses, each a `case` with its own idea of how to approach, when to wind up
 * and what to leave behind.
 *
 * It moves almost verbatim. That is deliberate — a 700-line behaviour switch is
 * the worst possible place to also improve something, and the M8.0 baselines
 * that guard this stage record positions and hp, which is exactly what every
 * one of these branches produces. The only changes are the ones the move
 * requires: refs become a context, and the four boss tuning constants come
 * along because nothing else ever read them.
 *
 * ## What the context is for
 *
 * The switch reached for surprisingly little: the level, the player, the sector
 * number, three id counters, the attack-slot budget and the per-mob move
 * timers. Everything else it needs is already a module. So the context is those
 * eight things and no more — not a handle back to the component, which would
 * have made this a move in name only.
 *
 * `claimSlot` stays a callback rather than an import because the pressure state
 * still lives in a ref in the component. That is the one seam M8 has not
 * closed, and pretending otherwise here would hide it.
 *
 * ## The entity is mutated, the move is returned
 *
 * Telegraphs, charge lanes, cycle phases, roam directions and bite combos are
 * all written onto `updatedEntity` in place, because the caller's `.map()`
 * already made it a copy and the rest of `update()` reads them back off it.
 * Where the mob wants to *be* comes back as a value instead: the caller owns
 * the collision, phasing budget and containment rules that decide whether the
 * step is allowed, and those outlive any one behaviour.
 */

import type { Entity, Level, Position } from '../types';
import { checkCollision } from '../engine';
import { audioManager } from '../../audio';
import { restrictToCardinal } from './mobGeometry';
import { occupancyKey } from './mobOccupancy';
import {
  MOTH_BLINK_RADIUS,
  MOTH_ORBIT_RAD_PER_TICK,
  rollMothBlinkDelay,
} from '../constants';
import {
  canEnterTile as phaseCanEnterTile,
  isEmergingStep,
  nextWallTilesTraversed,
  PHASE_MAX_WALL_TILES,
} from './phaseBudget';
import { nextMoveTimer } from './movementBudget';
import {
  isFloorTile,
  nearestFloorStep,
} from './wallEscape';
import {
  BOSS_CYCLES,
  advanceTimedPhase,
  canBeginCycle,
  enterPhase,
  phaseExpired,
  readCycle,
  writeCycle,
} from './bossCycle';
import {
  WALL_PHASE_BASE,
  fireProjectile,
  wallPhaseChance,
} from '../combat/projectileSpawn';
import {
  beginAttackTelegraph,
  completeAttackTelegraph,
  isAttackTelegraphActive,
  BOSS_RANGED_TELEGRAPH_MS,
  RANGED_TELEGRAPH_MS,
} from '../combat/rangedTelegraph';
import {
  shouldAdvanceCerberusCombo,
  CERBERUS_COMBO_COOLDOWN_AFTER_MS,
  CERBERUS_COMBO_RESET_MS,
} from '../combat/cerberus';

/** Tiles Ares wants between himself and the player before committing a charge. */
export const ARES_MIN_CHARGE_TILES = 3;

/** Zeus' preferred engagement band, in tiles. Close enough to threaten, far
 *  enough that his wind-up is a warning rather than a formality. */
export const ZEUS_BAND_MIN = 4;
export const ZEUS_BAND_MAX = 6;

/** How close Hades must be before he commits to a strike. */
export const HADES_STRIKE_TILES = 1.6;

/** How often a mob outside aggro picks a new direction to wander in. */
export const ROAM_CHANGE_INTERVAL_MS = 2000;

export interface MobBrainContext {
  level: Level;
  playerPos: Position;
  /** Sector number. Scales the phase chance on the shots fired from here. */
  sector: number;
  /** Per-mob move timers, which one behaviour reads to pace its orbit. */
  moveTimers: Map<string, number>;
  nextProjectileId: () => string;
  nextParticleId: () => string;
  nextAfterimageId: () => string;
  /**
   * Claim one of the sector's attack slots. A callback, not an import, because
   * the pressure state is still a ref in the component — the one seam M8 has
   * not closed.
   */
  claimSlot: (entity: Entity, cadenceMs: number) => boolean;
  projectileLifetimeMs: number;
  /**
   * Tile -> mobs standing on it, for mob-vs-mob collision. A function because
   * the caller builds it lazily: most frames never attempt a move at all.
   */
  occupancy: () => Map<number, Entity[]>;
}

export interface MobBrainInput {
  /** The mob as it was at the start of the tick. */
  entity: Entity;
  /** The working copy. Behaviours write their state here, in place. */
  updatedEntity: Entity;
  now: number;
  /** Beyond this the mob wanders instead of engaging. */
  aggroRange: number;
  mobSubtype: string;
  /** This mob's accumulated move timer, and the delay it is measured against. */
  moveTimer: number;
  baseMoveDelay: number;
}

export interface MobMove {
  /** Where the mob would like to stand. The caller decides whether it may. */
  nextPos: Position;
  shouldMove: boolean;
}

export function decideMobMove(input: MobBrainInput, ctx: MobBrainContext): MobMove {
  const { entity, updatedEntity, now, aggroRange, mobSubtype, moveTimer, baseMoveDelay } = input;
  const level = ctx.level;

  let nextPos = { ...entity.pos };
  let shouldMove = false;
  
  // Calculate distance to player
  const dx = ctx.playerPos.x - entity.pos.x;
  const dy = ctx.playerPos.y - entity.pos.y;
  const distToPlayer = Math.sqrt(dx * dx + dy * dy);
  
  // Helper function for idle roaming behavior
  const performIdleRoaming = (): { x: number; y: number } | null => {
    const ROAM_CHANGE_INTERVAL = 2000; // Change direction every 2 seconds
    const lastRoamChange = entity.lastRoamChange || 0;
    
    // Initialize or change roam direction periodically
    if (!entity.roamDirection || (now - lastRoamChange >= ROAM_CHANGE_INTERVAL)) {
      // Pick a random cardinal direction
      const directions = [
        { x: 1, y: 0 },   // Right
        { x: -1, y: 0 },  // Left
        { x: 0, y: 1 },   // Down
        { x: 0, y: -1 },  // Up
      ];
      const randomDir = directions[Math.floor(Math.random() * directions.length)];
      updatedEntity.roamDirection = randomDir;
      updatedEntity.lastRoamChange = now;
    }
    
    return updatedEntity.roamDirection || entity.roamDirection || null;
  };
  
  // Unique AI behaviors based on mob subtype
  // Check aggro range: if player is outside aggro range, mobs should idle roam
  if (distToPlayer > aggroRange) {
    // Player is outside aggro range - perform idle roaming
    const roamDir = performIdleRoaming();
    if (roamDir) {
      nextPos = {
        x: entity.pos.x + roamDir.x,
        y: entity.pos.y + roamDir.y,
      };
      shouldMove = true;
    }
  } else {
    // Player is within aggro range - clear roaming state and execute mob-specific behavior
    updatedEntity.roamDirection = null;
    switch (mobSubtype) {
    case 'charger': {
      // Ares Charger: Fast charge in straight line
      if (entity.chargeDirection) {
        // Continue charging
        nextPos = {
          x: entity.pos.x + entity.chargeDirection.x,
          y: entity.pos.y + entity.chargeDirection.y,
        };
        shouldMove = true;
        
        // Stop charging if hit wall or reached player
        if (level && checkCollision(nextPos, level) && !entity.canPhase) {
          updatedEntity.chargeDirection = null;
          shouldMove = false;
        } else if (distToPlayer < 1.5) {
          updatedEntity.chargeDirection = null;
        }
      } else {
        // Start new charge
        if (distToPlayer > 2) {
          // Restrict charge direction to cardinal only
          const dir = restrictToCardinal(dx, dy);
          updatedEntity.chargeDirection = { x: dir.x, y: dir.y };
          nextPos = {
            x: entity.pos.x + dir.x,
            y: entity.pos.y + dir.y,
          };
          shouldMove = true;
        } else {
          // Close enough, normal movement (restricted to cardinal)
          const dir = restrictToCardinal(dx, dy);
          nextPos = {
            x: entity.pos.x + dir.x,
            y: entity.pos.y + dir.y,
          };
          shouldMove = true;
        }
      }
      break;
    }
    
    case 'sniper': {
      // Apollo Sniper: Slow movement, ranged attacks
      if (entity.isRanged && entity.range && distToPlayer <= entity.range && distToPlayer > 1) {
        // Try to maintain distance, move away if too close (restricted to cardinal)
        if (distToPlayer < 3) {
          const dir = restrictToCardinal(-dx, -dy);
          nextPos = {
            x: entity.pos.x + dir.x,
            y: entity.pos.y + dir.y,
          };
          shouldMove = true;
        }
        
        // Fire projectile if in range (with wind-up telegraph)
        const lastAttack = entity.lastAttackTime || 0;
        const cooldown = entity.attackCooldown || 2000;

        const telegraphComplete = completeAttackTelegraph(updatedEntity, now, (velocity) => {
          if (level) {
            fireProjectile(level, {
              id: ctx.nextProjectileId(),
              shooter: entity,
              velocity,
              now,
              lifetimeMs: ctx.projectileLifetimeMs,
              wallPhaseChance: wallPhaseChance(WALL_PHASE_BASE.sniper, ctx.sector),
            });
          }

          audioManager.playSound('attack');
        });
        Object.assign(updatedEntity, telegraphComplete);

        if (
          !isAttackTelegraphActive(updatedEntity, now) &&
          now - lastAttack >= cooldown &&
          ctx.claimSlot(updatedEntity, cooldown)
        ) {
          Object.assign(
            updatedEntity,
            beginAttackTelegraph(updatedEntity, now, ctx.playerPos, RANGED_TELEGRAPH_MS),
          );
        }
      } else {
        // Move towards player slowly (restricted to cardinal)
        const dir = restrictToCardinal(dx, dy);
        nextPos = {
          x: entity.pos.x + dir.x,
          y: entity.pos.y + dir.y,
        };
        shouldMove = true;
      }
      break;
    }
    
    case 'phase': {
      // Hades Phase: Can move through walls
      const insideRock =
        level !== null &&
        !isFloorTile(level.tiles, Math.floor(entity.pos.x), Math.floor(entity.pos.y));
      const budgetSpent =
        (entity.wallTilesTraversed ?? 0) >= PHASE_MAX_WALL_TILES;

      // Out of budget and still in solid rock: stop chasing and surface.
      // Without this the mob kept retrying the one step it wanted — the
      // greedy step toward the player — and since the wall counter only
      // updates on a committed move, the budget never reset either. In
      // the boundary ring that meant stuck forever.
      const escape = insideRock && budgetSpent && level
        ? nearestFloorStep(level, entity.pos)
        : null;

      nextPos = escape ?? {
        x: entity.pos.x + Math.sign(dx),
        y: entity.pos.y + Math.sign(dy),
      };
      shouldMove = true;
      // Clear roaming state when aggro'd
      updatedEntity.roamDirection = null;
      break;
    }
    
    case 'guardian': {
      // Athena Guardian: Slow, tanky, direct path (restricted to cardinal)
      const dir = restrictToCardinal(dx, dy);
      nextPos = {
        x: entity.pos.x + dir.x,
        y: entity.pos.y + dir.y,
      };
      shouldMove = true;
      break;
    }
    
    case 'swarm': {
      // Minion Swarm: Fast, direct movement (restricted to cardinal)
      const dir = restrictToCardinal(dx, dy);
      nextPos = {
        x: entity.pos.x + dir.x,
        y: entity.pos.y + dir.y,
      };
      shouldMove = true;
      break;
    }
    
    case 'moth': {
      // Nyx Glitchmoth: Orbiting movement, blinking, shadow pulse
      const orbitRadius = 2.5;
      let currentAngle = entity.orbitAngle || Math.atan2(dy, dx);
      
      // Advance the orbit by the time that actually elapsed since the last
      // move tick (nominal 0.1 rad per tick), so a staggered or late tick
      // does not slow the orbit; capped so a waking moth does not jump.
      const orbitTicks = Math.min(3, moveTimer / baseMoveDelay);
      currentAngle += MOTH_ORBIT_RAD_PER_TICK * orbitTicks;
      updatedEntity.orbitAngle = currentAngle;
      
      // Calculate orbiting position
      const orbitX = ctx.playerPos.x + Math.cos(currentAngle) * orbitRadius;
      const orbitY = ctx.playerPos.y + Math.sin(currentAngle) * orbitRadius;
      
      // Blink timing: roll the 3–5 s threshold once and keep it, instead of
      // re-rolling every tick (which made the effective rate tick-dependent).
      const blinkCooldown = entity.blinkCooldown || 0;
      const nextBlinkAt = entity.nextBlinkAt ?? blinkCooldown + rollMothBlinkDelay();
      updatedEntity.nextBlinkAt = nextBlinkAt;
      if (now >= nextBlinkAt) {
        // Find a dark tile: floor, within 6 tiles of the player, no mob on or
        // adjacent to it. Only the disc around the player is scanned and mob
        // proximity is an O(1) occupancy lookup (was a full-map scan with an
        // O(N) entity filter per tile).
        if (level) {
          const darkTiles: Position[] = [];
          const exitPos = level.exitPos;
          const occupancy = ctx.occupancy();
          const px = ctx.playerPos.x;
          const py = ctx.playerPos.y;
          const minX = Math.max(0, Math.floor(px - MOTH_BLINK_RADIUS));
          const maxX = Math.min(level.width - 1, Math.ceil(px + MOTH_BLINK_RADIUS));
          const minY = Math.max(0, Math.floor(py - MOTH_BLINK_RADIUS));
          const maxY = Math.min(level.height - 1, Math.ceil(py + MOTH_BLINK_RADIUS));
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              if (level.tiles[y][x] !== 'floor') continue;
              if (x === exitPos.x && y === exitPos.y) continue;
              const ddx = x - px;
              const ddy = y - py;
              if (ddx * ddx + ddy * ddy > MOTH_BLINK_RADIUS * MOTH_BLINK_RADIUS) continue;
              let crowded = false;
              for (let oy = -1; oy <= 1 && !crowded; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                  if (occupancy.has(occupancyKey(x + ox, y + oy))) {
                    crowded = true;
                    break;
                  }
                }
              }
              if (!crowded) darkTiles.push({ x, y });
            }
          }
          if (darkTiles.length > 0) {
            const randomDarkTile = darkTiles[Math.floor(Math.random() * darkTiles.length)];
            nextPos = randomDarkTile;
            shouldMove = true;
            updatedEntity.blinkCooldown = now;
            updatedEntity.nextBlinkAt = now + rollMothBlinkDelay();
          } else {
            // Nowhere dark to go: orbit and wait out a fresh interval,
            // rather than re-running the disc scan on every tick.
            updatedEntity.nextBlinkAt = now + rollMothBlinkDelay();
            nextPos = { x: orbitX, y: orbitY };
            shouldMove = true;
          }
        }
      } else {
        // Normal orbiting
        nextPos = { x: orbitX, y: orbitY };
        shouldMove = true;
      }
      
      // Create particle trail when moth moves
      if (shouldMove && level) {
        if (!level.particles) {
          level.particles = [];
        }
        // Create small particles at previous position
        const particleCount = 2; // Create 2 particles per movement
        for (let i = 0; i < particleCount; i++) {
          const offsetX = (Math.random() - 0.5) * 0.3;
          const offsetY = (Math.random() - 0.5) * 0.3;
          level.particles.push({
            id: ctx.nextParticleId(),
            pos: {
              x: entity.pos.x + offsetX,
              y: entity.pos.y + offsetY,
            },
            createdAt: now,
            lifetime: 800, // Fade out over 800ms
          });
        }
      }
      
      // Shadow pulse attack
      if (distToPlayer >= 3 && distToPlayer <= 4 && entity.isRanged) {
        const lastAttack = entity.lastAttackTime || 0;
        const cooldown = entity.attackCooldown || 1250;
        
        if (now - lastAttack >= cooldown) {
          // Fire shadow pulse projectile
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          let velocity;
          if (absDx > absDy) {
            velocity = { x: Math.sign(dx), y: 0 };
          } else {
            velocity = { x: 0, y: Math.sign(dy) };
          }
          
          if (level) {
            fireProjectile(level, {
              id: ctx.nextProjectileId(),
              shooter: entity,
              velocity,
              now,
              lifetimeMs: ctx.projectileLifetimeMs,
              wallPhaseChance: wallPhaseChance(WALL_PHASE_BASE.moth, ctx.sector),
              isShadowPulse: true,
            });
          }
          
          updatedEntity.lastAttackTime = now;
          audioManager.playSound('attack');
        }
      }
      break;
    }
    
    case 'tracker': {
      // Artemis Tracker: Stalking, pounce, afterimage trail
      if (entity.isStalking) {
        // Stalking behavior: maintain distance, check for clear path
        if (distToPlayer > 4 && distToPlayer < 5) {
          // Check for straight line path (Bresenham-like check)
          let hasClearPath = true;
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          if (steps > 0) {
            for (let i = 1; i <= steps; i++) {
              const checkX = Math.floor(entity.pos.x + (dx / steps) * i);
              const checkY = Math.floor(entity.pos.y + (dy / steps) * i);
              if (level && level.tiles[checkY] && level.tiles[checkY][checkX] === 'wall') {
                hasClearPath = false;
                break;
              }
            }
          }
          
          if (hasClearPath) {
            // Initiate pounce (restricted to cardinal)
            updatedEntity.isStalking = false;
            const dir = restrictToCardinal(dx, dy);
            updatedEntity.pounceDirection = { x: dir.x, y: dir.y };
            nextPos = {
              x: entity.pos.x + dir.x * 2,
              y: entity.pos.y + dir.y * 2,
            };
            shouldMove = true;
            
            // Create afterimage trail
            if (level) {
              if (!level.afterimages) {
                level.afterimages = [];
              }
              const pounceDistance = Math.min(3, Math.floor(distToPlayer));
              for (let i = 1; i <= pounceDistance; i++) {
                const trailPos = {
                  x: entity.pos.x + (dir.x * i),
                  y: entity.pos.y + (dir.y * i),
                };
                level.afterimages.push({
                  id: ctx.nextAfterimageId(),
                  pos: trailPos,
                  createdAt: now,
                  lifetime: 2500, // 2.5 seconds
                  damage: 1 + Math.floor(Math.random()), // 1-2 chip damage
                });
              }
            }
          } else {
            // No clear path, continue stalking (restricted to cardinal)
            const dir = restrictToCardinal(dx, dy);
            nextPos = {
              x: entity.pos.x + dir.x * 0.5,
              y: entity.pos.y + dir.y * 0.5,
            };
            shouldMove = true;
          }
        } else if (distToPlayer > 5) {
          // Too far, move closer slowly (restricted to cardinal)
          const dir = restrictToCardinal(dx, dy);
          nextPos = {
            x: entity.pos.x + dir.x * 0.5,
            y: entity.pos.y + dir.y * 0.5,
          };
          shouldMove = true;
        }
      } else if (entity.pounceDirection) {
        // Continue pounce (pounce direction already set, but restrict if diagonal)
        const pounceDir = entity.pounceDirection;
        // Check if pounce is diagonal and restrict if needed
        if (pounceDir.x !== 0 && pounceDir.y !== 0) {
          const restrictedDir = restrictToCardinal(pounceDir.x, pounceDir.y);
          updatedEntity.pounceDirection = restrictedDir;
          nextPos = {
            x: entity.pos.x + restrictedDir.x,
            y: entity.pos.y + restrictedDir.y,
          };
        } else {
          nextPos = {
            x: entity.pos.x + pounceDir.x,
            y: entity.pos.y + pounceDir.y,
          };
        }
        shouldMove = true;
        
        // Stop pounce if reached player or hit wall
        if (distToPlayer < 1.5) {
          updatedEntity.pounceDirection = null;
          updatedEntity.isStalking = true; // Return to stalking
        } else if (level && checkCollision(nextPos, level)) {
          updatedEntity.pounceDirection = null;
          updatedEntity.isStalking = true;
          shouldMove = false;
        }
      } else {
        // Return to stalking (restricted to cardinal)
        updatedEntity.isStalking = true;
        const dir = restrictToCardinal(dx, dy);
        nextPos = {
          x: entity.pos.x + dir.x * 0.5,
          y: entity.pos.y + dir.y * 0.5,
        };
        shouldMove = true;
      }
      break;
    }
    
    case 'cerberus': {
      // Cerberus Firewall: Slow walk, triple-lunge, tri-bite combo
      // Calculate time since last bite (needed for both combo logic and reset logic)
      const lastBite = entity.lastBiteTime || 0;
      const biteComboCount = entity.biteComboCount || 0;
      const timeSinceLastBite = now - lastBite;
      
      // Check for straight lane to player
      let hasStraightLane = false;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      if (steps > 0 && steps <= 3) {
        hasStraightLane = true;
        for (let i = 1; i <= steps; i++) {
          const checkX = Math.floor(entity.pos.x + (dx / steps) * i);
          const checkY = Math.floor(entity.pos.y + (dy / steps) * i);
          if (level && level.tiles[checkY] && level.tiles[checkY][checkX] === 'wall') {
            hasStraightLane = false;
            break;
          }
        }
      }
      
      if (hasStraightLane && distToPlayer > 1.5) {
        // Triple-lunge (restricted to cardinal)
        const dir = restrictToCardinal(dx, dy);
        // Check each intermediate tile for collisions
        let canLunge = true;
        if (level) {
          for (let i = 1; i <= 3; i++) {
            const checkPos = {
              x: entity.pos.x + dir.x * i,
              y: entity.pos.y + dir.y * i,
            };
            if (checkCollision(checkPos, level)) {
              canLunge = false;
              break;
            }
          }
        }
        if (canLunge) {
          nextPos = {
            x: entity.pos.x + dir.x * 3,
            y: entity.pos.y + dir.y * 3,
          };
          shouldMove = true;
        } else {
          // Fall back to normal walk if lunge path is blocked
          nextPos = {
            x: entity.pos.x + dir.x,
            y: entity.pos.y + dir.y,
          };
          shouldMove = true;
        }
      } else {
        // Normal slow walk (restricted to cardinal)
        const dir = restrictToCardinal(dx, dy);
        nextPos = {
          x: entity.pos.x + dir.x,
          y: entity.pos.y + dir.y,
        };
        shouldMove = true;
      }
      
      // Tri-bite combo when in melee range
      if (distToPlayer <= 1.5) {
        const cooldown = entity.attackCooldown || 2200;

        if (biteComboCount === 0 && timeSinceLastBite >= cooldown) {
          updatedEntity.biteComboCount = 1;
          updatedEntity.lastBiteTime = now;
          updatedEntity.lastDamageComboCount = 0;
          updatedEntity.attackTelegraphUntil = now + 220;
        } else {
          const nextCombo = shouldAdvanceCerberusCombo(biteComboCount, timeSinceLastBite);
          if (nextCombo !== null) {
            updatedEntity.biteComboCount = nextCombo;
            if (nextCombo > 0 && nextCombo <= 3) {
              updatedEntity.attackTelegraphUntil = now + 220;
            }
            if (nextCombo === 0) {
              updatedEntity.lastBiteTime = now;
              updatedEntity.lastDamageComboCount = 0;
            }
          } else if (biteComboCount === 3 && timeSinceLastBite >= CERBERUS_COMBO_COOLDOWN_AFTER_MS) {
            updatedEntity.biteComboCount = 0;
            updatedEntity.lastBiteTime = now;
            updatedEntity.lastDamageComboCount = 0;
          }
        }
      } else if (timeSinceLastBite >= CERBERUS_COMBO_RESET_MS) {
        updatedEntity.biteComboCount = 0;
        updatedEntity.lastDamageComboCount = 0;
      }
      break;
    }
    
    case 'boss_zeus': {
      // Zeus Boss: Ranged attacks
      if (entity.isRanged && entity.range && distToPlayer <= entity.range) {
        const lastAttack = entity.lastAttackTime || 0;
        const cooldown = entity.attackCooldown || 1000;

        const telegraphComplete = completeAttackTelegraph(updatedEntity, now, (velocity) => {
          if (level) {
            // Even odds at sector 8, which is the point of the fight:
            // cover is unreliable against Zeus, so the answer is
            // movement rather than a corner.
            fireProjectile(level, {
              id: ctx.nextProjectileId(),
              shooter: entity,
              velocity,
              now,
              lifetimeMs: ctx.projectileLifetimeMs,
              wallPhaseChance: wallPhaseChance(WALL_PHASE_BASE.bossZeus, ctx.sector),
            });
          }

          audioManager.playSound('attack');
        });
        Object.assign(updatedEntity, telegraphComplete);

        if (
          !isAttackTelegraphActive(updatedEntity, now) &&
          now - lastAttack >= cooldown &&
          ctx.claimSlot(updatedEntity, cooldown)
        ) {
          Object.assign(
            updatedEntity,
            beginAttackTelegraph(updatedEntity, now, ctx.playerPos, BOSS_RANGED_TELEGRAPH_MS),
          );
        }
      }
      
      // Zeus holds a preferred band instead of always closing. He is a
      // ranged control boss; walking into melee made his own tell
      // useless, since a shot fired from an adjacent tile cannot be
      // dodged. Too far and he advances, too close and he backs off,
      // otherwise he strafes and keeps firing.
      const dir = restrictToCardinal(dx, dy);
      if (distToPlayer > ZEUS_BAND_MAX) {
        nextPos = { x: entity.pos.x + dir.x, y: entity.pos.y + dir.y };
        shouldMove = true;
      } else if (distToPlayer < ZEUS_BAND_MIN) {
        const away = { x: -dir.x, y: -dir.y };
        const retreat = { x: entity.pos.x + away.x, y: entity.pos.y + away.y };
        if (level && !checkCollision(retreat, level)) {
          nextPos = retreat;
          shouldMove = true;
        } else {
          // Cornered: sidestep along the other axis rather than stand still.
          const strafe = dir.x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
          const side = { x: entity.pos.x + strafe.x, y: entity.pos.y + strafe.y };
          if (level && !checkCollision(side, level)) {
            nextPos = side;
            shouldMove = true;
          }
        }
      }
      break;
    }
    
    case 'boss_hades': {
      // Hades: pursue → phase through cover → emerge → telegraph →
      // strike → recover → reposition.
      //
      // He is meant to be dangerous because walls cannot be fully
      // trusted, not because there is no moment to react. Phasing gets
      // him to you; the cycle is what makes the arrival readable. The
      // emergence window from the M6.1 follow-up already stops him
      // surfacing and hitting on the same tick — this adds the tell and
      // the opening after it.
      const timings = BOSS_CYCLES.boss_hades;
      const cycle = readCycle(entity, now);
      let next = cycle;

      if (cycle.phase === 'ready') {
        if (canBeginCycle(cycle, now, timings) && distToPlayer <= HADES_STRIKE_TILES) {
          const aim = restrictToCardinal(dx, dy);
          updatedEntity.attackTelegraphVelocity = { x: aim.x, y: aim.y };
          updatedEntity.attackTelegraphUntil = now + timings.telegraphMs;
          updatedEntity.attackTelegraphMs = timings.telegraphMs;
          next = enterPhase('telegraph', now);
        } else {
          // Pursuit, still cutting through cover. The movement budget
          // charges the diagonal properly, so he closes at his stated
          // speed rather than 41% faster than it.
          nextPos = {
            x: entity.pos.x + Math.sign(dx),
            y: entity.pos.y + Math.sign(dy),
          };
          shouldMove = true;
        }
      } else {
        // Telegraph, execute and recover are pure sequencing here: the
        // strike is the contact damage the gate allows once, and the
        // phase only bounds how long that window is open.
        next = advanceTimedPhase(cycle, now, timings);
      }

      writeCycle(updatedEntity, next);
      break;
    }
    
    case 'boss_ares': {
      // Ares: charge and punish. The charge used to start the moment he
      // was three tiles away and end when he hit a wall, so the fight
      // was regulated by collision geometry rather than anything the
      // player could read. It now runs the shared cycle — a visible
      // wind-up, one committed charge, then a recovery that is the
      // player's turn.
      const timings = BOSS_CYCLES.boss_ares;
      const cycle = readCycle(entity, now);
      let next = cycle;

      switch (cycle.phase) {
        case 'ready': {
          // Close the distance until there is room to charge.
          const dir = restrictToCardinal(dx, dy);
          if (canBeginCycle(cycle, now, timings) && distToPlayer >= ARES_MIN_CHARGE_TILES) {
            // Lock the lane now; the tell shows where it goes.
            updatedEntity.chargeDirection = { x: dir.x, y: dir.y };
            updatedEntity.attackTelegraphVelocity = { x: dir.x, y: dir.y };
            updatedEntity.attackTelegraphUntil = now + timings.telegraphMs;
            updatedEntity.attackTelegraphMs = timings.telegraphMs;
            next = enterPhase('telegraph', now);
          } else {
            nextPos = { x: entity.pos.x + dir.x, y: entity.pos.y + dir.y };
            shouldMove = true;
          }
          break;
        }
        case 'telegraph': {
          // Rooted, showing the lane. Committed once it expires — the
          // player has the whole wind-up to leave it.
          next = advanceTimedPhase(cycle, now, timings);
          break;
        }
        case 'execute': {
          const chargeDir = entity.chargeDirection;
          if (!chargeDir || (chargeDir.x === 0 && chargeDir.y === 0)) {
            next = enterPhase('recover', now);
            break;
          }
          nextPos = { x: entity.pos.x + chargeDir.x, y: entity.pos.y + chargeDir.y };
          shouldMove = true;
          const intoWall = !!level && checkCollision(nextPos, level);
          // Slamming into a wall ends the charge — that is the bait the
          // arena's pillars exist for — as does connecting, or running
          // out of committed distance.
          if (intoWall || distToPlayer < 1.5 || phaseExpired(cycle, now, timings)) {
            shouldMove = !intoWall;
            updatedEntity.chargeDirection = null;
            next = enterPhase('recover', now);
          }
          break;
        }
        case 'recover': {
          // Rooted and open. This is the damage window.
          next = advanceTimedPhase(cycle, now, timings);
          break;
        }
      }

      writeCycle(updatedEntity, next);
      break;
    }
    
    default: {
      // Default: Basic drone movement (Hermes) (restricted to cardinal)
      const dir = restrictToCardinal(dx, dy);
      nextPos = {
        x: entity.pos.x + dir.x,
        y: entity.pos.y + dir.y,
      };
      shouldMove = true;
      break;
    }
  }
  }
  return { nextPos, shouldMove };
}
