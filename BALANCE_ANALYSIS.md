# Balance Analysis: New Mobs

## Level 10 Comparison

### Existing Mobs
- **Drone**: HP 70, DMG 15, Speed 1.0, Cooldown 500ms
- **Sniper**: HP 45, DMG 32, Speed 0.5, Cooldown 2000ms
- **Charger**: HP 58, DMG 23, Speed 1.8, Cooldown 600ms
- **Guardian**: HP 130, DMG 16, Speed 0.6, Cooldown 800ms

### New Mobs
- **Moth**: HP 46, DMG 16, Speed 1.65, Cooldown 1150ms
- **Tracker**: HP 44, DMG 23, Speed 1.95, Cooldown 1450ms
- **Cerberus**: HP 110, DMG 19, Speed 1.25, Cooldown 2000ms

## Issues Found

### 1. Speed Scaling Too Aggressive
- **Moth**: At level 20, speed = 1.35 + 0.6 = 1.95 (faster than Charger!)
- **Tracker**: At level 20, speed = 1.55 + 0.8 = 2.35 (way too fast)
- **Cerberus**: At level 20, speed = 1.05 + 0.4 = 1.45 (reasonable)

**Fix**: Reduce speed scaling or cap it.

### 2. Cerberus Tri-Bite Damage Too High
- At level 10: 19 damage × 3 = 57 total damage
- At level 20: 31 damage × 3 = 93 total damage
- This can kill player in 2 combos!

**Fix**: Reduce base damage or combo damage multiplier.

### 3. Cooldown Scaling Creates Imbalance
- New mobs get faster with level, existing mobs don't
- At level 40, Moth cooldown = 850ms (very fast for debuff)

**Fix**: Reduce cooldown scaling or increase minimum.

### 4. Tracker Damage High for Melee
- 23 damage at level 10 is high for a melee mob
- But it has stalking behavior, so might be okay

### 5. Moth Vision Debuff
- 50% reduction for 5 seconds is punishing
- Multiple moths could stack (but currently doesn't - good)
- Debuff doesn't refresh, just resets timer (good)

## Recommended Fixes

1. **Reduce speed scaling**: Cap or reduce per-level speed gains
2. **Reduce Cerberus damage**: Lower base damage or reduce combo effectiveness
3. **Adjust cooldown scaling**: Make it less aggressive or increase minimums
4. **Review spawn weights**: Ensure new mobs don't dominate spawns

## Fixes Applied

### 1. Moth Balance Adjustments
- **Speed scaling**: Reduced from 0.03 to 0.015 per level
  - Level 20: 1.35 + 0.3 = 1.65 (was 1.95)
  - More reasonable for orbiting mob
- **Cooldown scaling**: Reduced from -10 to -8 per level
  - Less aggressive attack speed increase
- **Minimum cooldown**: Increased from 850ms to 950ms
  - Prevents too-fast debuff spam at high levels

### 2. Tracker Balance Adjustments
- **Speed scaling**: Reduced from 0.04 to 0.02 per level
  - Level 20: 1.55 + 0.4 = 1.95 (was 2.35)
  - Still fast but not overpowered
- **Cooldown scaling**: Reduced from -15 to -12 per level
  - Less aggressive attack speed increase
- **Minimum cooldown**: Increased from 1050ms to 1100ms
  - Slightly slower minimum attack rate

### 3. Cerberus Balance Adjustments
- **Base damage**: Reduced from 7 to 6
  - Level 10: 6 + 10 = 16 damage per bite (was 19)
  - Level 10 combo: 48 total damage (was 57)
- **Damage scaling**: Reduced from 1.2 to 1.0 per level
  - Level 20: 6 + 20 = 26 damage per bite (was 31)
  - Level 20 combo: 78 total damage (was 93)
- **Cooldown scaling**: Reduced from -20 to -15 per level
  - Less aggressive attack speed increase
- **Minimum cooldown**: Increased from 1400ms to 1500ms
  - Slightly slower minimum attack rate

## Updated Level 10 Stats (After Fixes)

### New Mobs (Fixed)
- **Moth**: HP 46, DMG 16, Speed 1.5, Cooldown 1170ms
- **Tracker**: HP 44, DMG 23, Speed 1.75, Cooldown 1480ms
- **Cerberus**: HP 110, DMG 16, Speed 1.25, Cooldown 2050ms
  - Tri-bite combo: 48 total damage (was 57)

## Balance Assessment

### ✅ Moth
- HP: Low (46 at L10) - appropriate for annoying debuffer
- Damage: Moderate (16) - balanced with debuff utility
- Speed: Reasonable (1.5) - fast enough to orbit, not overpowered
- Cooldown: Balanced (1170ms) - prevents spam

### ✅ Tracker
- HP: Low (44 at L10) - appropriate for glass cannon
- Damage: High (23) - balanced by stalking behavior
- Speed: Fast (1.75) - appropriate for pouncer
- Cooldown: Balanced (1480ms) - prevents spam

### ✅ Cerberus
- HP: High (110 at L10) - appropriate for elite
- Damage: Moderate (16 per bite) - tri-bite is powerful but not OP
- Speed: Slow (1.25) - appropriate for tank
- Cooldown: Long (2050ms) - prevents combo spam
- **Tri-bite combo**: 48 total damage is strong but manageable
  - Player has 100 HP, so 2 combos = 96 damage (survivable)
  - Requires player to be in melee range for extended time

## Spawn Weight Analysis

Total spawn weight (excluding Cerberus):
- Existing: 30 + 15 + 20 + 12 + 8 + 25 + 5 = 115
- New: 10 + 8 = 18
- **New mobs represent ~13.5% of spawns** - reasonable

Cerberus spawns only in boss sectors (levels 8, 16, 24, etc.) alongside boss, so doesn't affect normal spawn weights.

## No Conflicts Detected

✅ Spawn logic correctly filters Cerberus for boss levels only
✅ Vision debuff doesn't stack (resets timer)
✅ Afterimage system properly initialized and cleaned up
✅ Speed/cooldown scaling formulas work correctly
✅ Tri-bite combo timing logic is sound
✅ All mob-specific properties properly initialized

