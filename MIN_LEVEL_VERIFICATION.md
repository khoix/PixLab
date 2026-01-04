# Min Level Spawn Verification

## Spawn Logic Analysis

### Primary Spawn Path (Normal Levels)
**Location**: `engine.ts` line 279
```typescript
const mobType = selectMobType(levelNum, false);
```

**Filter Logic**: `engine.ts` lines 176-182
```typescript
let availableMobs = MOB_TYPES.filter((mob: typeof MOB_TYPES[0]) => {
  // Filter by min level
  if (levelNum < mob.minLevel) return false;  // ✅ Correct: only spawns when levelNum >= minLevel
  // Filter boss-sector-only mobs
  if (mob.bossSectorOnly && !isBoss) return false;
  return true;
});
```

**Verification**: ✅ Mobs only spawn when `levelNum >= mob.minLevel`

### Cerberus Spawn Path (Boss Levels)
**Location**: `engine.ts` lines 227-228
```typescript
// Spawn Cerberus alongside boss (1-2 Cerberus entities)
if (levelNum >= 8) {  // ✅ Matches Cerberus minLevel of 8
  const cerberusMob = MOB_TYPES.find(m => m.subtype === 'cerberus');
```

**Verification**: ✅ Cerberus only spawns when `levelNum >= 8` (matches minLevel)

## All Mob Min Levels

| Mob | minLevel | First Spawns At | Verification |
|-----|----------|-----------------|--------------|
| **drone** | 1 | Level 1 | ✅ |
| **swarm** | 1 | Level 1 | ✅ |
| **phase** | 2 | Level 2 | ✅ |
| **sniper** | 3 | Level 3 | ✅ |
| **moth** | 3 | Level 3 | ✅ |
| **charger** | 4 | Level 4 | ✅ |
| **turret** | 5 | Level 5 | ✅ |
| **tracker** | 5 | Level 5 | ✅ |
| **guardian** | 6 | Level 6 | ✅ |
| **cerberus** | 8 | Level 8 (boss only) | ✅ |

## Test Cases

### Level 1
- ✅ Can spawn: drone, swarm
- ❌ Cannot spawn: phase, sniper, moth, charger, turret, tracker, guardian, cerberus

### Level 2
- ✅ Can spawn: drone, swarm, phase
- ❌ Cannot spawn: sniper, moth, charger, turret, tracker, guardian, cerberus

### Level 3
- ✅ Can spawn: drone, swarm, phase, sniper, moth
- ❌ Cannot spawn: charger, turret, tracker, guardian, cerberus

### Level 5
- ✅ Can spawn: drone, swarm, phase, sniper, moth, charger, turret, tracker
- ❌ Cannot spawn: guardian, cerberus

### Level 8 (Boss Level)
- ✅ Can spawn: All mobs (including cerberus via boss spawn path)
- ✅ Cerberus spawns alongside boss (1-2 entities)

## Conclusion

✅ **All mobs correctly respect their minLevel**
✅ **Spawn logic properly filters by minLevel**
✅ **Cerberus has additional level check (>= 8) matching its minLevel**
✅ **No bypass paths found**

The implementation is correct - mobs will only start spawning at their specified minLevel or later.

