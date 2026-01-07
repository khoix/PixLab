# Features and Fixes

This document tracks new features and bug fixes implemented in the project.

## Table of Contents

- [Features](#features)
  - [Stairs Color Theme Filtering](#stairs-color-theme-filtering)
  - [Wall Phasing for Projectiles](#wall-phasing-for-projectiles)
  - [Demo Sandbox](#demo-sandbox)
  - [Portal and Lightswitch Implementation](#portal-and-lightswitch-implementation)
  - [Item Economy Index & Availability-Aware Expected Growth](#item-economy-index--availability-aware-expected-growth)
  - [Scroll Pricing System](#scroll-pricing-system)
  - [Quick-Equip Button on Item Toast Notifications](#quick-equip-button-on-item-toast-notifications)
  - [Toast Click-to-Dismiss Feature](#toast-click-to-dismiss-feature)
  - [HUD Terminology Update - "SECTOR" Instead of "LEVEL"](#hud-terminology-update---sector-instead-of-level)
  - [Boss Sector Exit Spawning](#boss-sector-exit-spawning)
  - [Hover to See Equipped Stats Feature](#hover-to-see-equipped-stats-feature)
  - [Player Footprint Trail](#player-footprint-trail)
  - [Game Event Log Viewer](#game-event-log-viewer)
- [Fixes](#fixes)
  - [Projectile Wall Collision Detection Fixes](#projectile-wall-collision-detection-fixes)
  - [Exit Tile Mob Spawn and Movement Prevention](#exit-tile-mob-spawn-and-movement-prevention)
  - [WASD Control Fix After Entity Spawning](#wasd-control-fix-after-entity-spawning)
  - [Scroll System Fixes - Commerce and Fortune Scrolls](#scroll-system-fixes---commerce-and-fortune-scrolls)
  - [Game Over State Refresh Fix](#game-over-state-refresh-fix)
  - [Scroll of Ending Boss Sector Advancement Fix](#scroll-of-ending-boss-sector-advancement-fix)
  - [Lightswitch Minimum Distance Placement Fix](#lightswitch-minimum-distance-placement-fix)
  - [Loot-sense and Threat-sense Spotlight Visibility Fix](#loot-sense-and-threat-sense-spotlight-visibility-fix)
  - [Cerberus Mob Movement and Attack Fixes](#cerberus-mob-movement-and-attack-fixes)
  - [Input Direction Reset on Sector Load Fix](#input-direction-reset-on-sector-load-fix)
- [Suggestions / Roadmap](#suggestions--roadmap)

---

## Features

### Stairs Color Theme Filtering

**Type**: Feature Enhancement  
**Files Modified**: `client/src/components/game/GameCanvas.tsx`

#### Overview
Added dynamic color filtering to the stairs image (`stairs.png`) so it matches the sector color theme that changes every 4 sectors, creating a more cohesive visual experience throughout the game.

#### Problem
The stairs image was drawn directly without any color filtering, causing it to appear in its original colors regardless of the current sector's color theme. This created a visual inconsistency where walls and floors would change colors every 4 sectors, but the stairs remained static.

#### Solution
Implemented a color filtering system that applies the current sector's theme color to the stairs image using HTML5 Canvas blend modes.

#### Technical Implementation

##### Color Theme System
The game uses a color theme system defined in `client/src/lib/game/colorThemes.ts`:
- Themes change every 4 sectors (levels 1-4, 5-8, 9-12, etc.)
- Each theme group generates a `ColorPalette` with `wall` and `floor` colors
- Themes include various cyberpunk and dungeon color schemes (blues, purples, browns, grays, greens, etc.)

##### Implementation Details
1. **Canvas State Management**: Wrapped the stairs drawing code in `ctx.save()` and `ctx.restore()` to preserve canvas state
2. **Image Drawing**: Draw the stairs image first (handling both rotated and non-rotated cases)
3. **Color Filtering**: Apply the `color` blend mode to preserve luminance (brightness/contrast) while applying the theme color's hue and saturation
4. **Theme Color Application**: Fill with the theme's floor color to tint the stairs image
5. **State Reset**: Reset `globalCompositeOperation` back to `source-over` after filtering

##### Code Location
The implementation is in `GameCanvas.tsx` within the `draw()` function, specifically in the tile rendering loop for `exit` tiles (lines ~1924-1954).

##### Blend Mode Selection
- **Initial Approach**: Used `multiply` blend mode, but this darkened the image too much, reducing contrast and brightness
- **Final Solution**: Switched to `color` blend mode, which:
  - Preserves the original image's luminance (brightness and contrast)
  - Applies the theme color's hue and saturation
  - Maintains visual clarity and readability

#### Result
The stairs now dynamically match the sector color theme:
- Stairs change color every 4 sectors along with walls and floors
- Visual consistency is maintained throughout the game
- Brightness and contrast are preserved, ensuring the stairs remain clearly visible
- Both rotated and non-rotated stair orientations are properly filtered

#### Testing Notes
- Verify stairs match theme colors across different sectors
- Ensure stairs remain visible and maintain good contrast
- Check both horizontal and vertical stair orientations
- Confirm theme changes occur correctly at sector boundaries (every 4 levels)

---

### Wall Phasing for Projectiles

**Type**: Feature Enhancement  
**Files Modified**: 
- `client/src/lib/game/types.ts`
- `client/src/components/game/GameCanvas.tsx`

#### Overview
Implemented a sector-scaling wall phasing system that allows certain projectile types to have a chance to pass through walls. The phase chance scales with level, making higher-level enemies more dangerous.

#### Implementation Details

**1. Projectile Interface Enhancement**
- Added `wallPhaseChance?: number` property to the `Projectile` interface
- Represents the chance (0-1) for a projectile to phase through each wall it encounters

**2. Helper Function**
- Created `calculateWallPhaseChance(baseChance: number)` helper function
- Formula: `Math.min(1.0, baseChance + (level * 0.005))`
- Adds 0.5% phase chance per level, capped at 100%

**3. Wall Collision Logic**
- Modified projectile wall collision check to:
  - Check if projectile has `wallPhaseChance` defined
  - Roll random number against phase chance for each wall encounter
  - Allow projectile to continue if phase succeeds
  - Remove projectile if phase fails or no phase chance exists

**4. Projectile Type Phase Chances**

| Enemy Type | Base Chance | Scaling |
|------------|-------------|---------|
| **Zeus Boss** | 50% | +0.5% per level |
| **Turret** | 25% | +0.5% per level |
| **Sniper** | 10% | +0.5% per level |
| **Nyx/Moth** | 5% | +0.5% per level |

#### Technical Implementation

**Files Modified:**

1. **`client/src/lib/game/types.ts`**
   - Added `wallPhaseChance?: number` to `Projectile` interface

2. **`client/src/components/game/GameCanvas.tsx`**
   - Added `calculateWallPhaseChance()` helper function
   - Updated wall collision check to handle phase chance logic
   - Added phase chance calculation for Zeus projectiles (boss_zeus case)
   - Added phase chance calculation for turret projectiles (stationary mob section)
   - Added phase chance calculation for sniper projectiles (sniper case)
   - Added phase chance calculation for moth/nyx projectiles (moth case)

#### Phase Chance Examples

- **Level 8**: Zeus = 54%, Turret = 29%, Sniper = 14%, Nyx = 9%
- **Level 16**: Zeus = 58%, Turret = 33%, Sniper = 18%, Nyx = 13%
- **Level 32**: Zeus = 66%, Turret = 41%, Sniper = 26%, Nyx = 21%
- **Level 100**: All types = 100% (capped)

#### Result
- ✅ Zeus boss projectiles can phase through walls with scaling chance
- ✅ Turret, sniper, and nyx projectiles have lower but scaling phase chances
- ✅ Each wall encounter is checked independently (projectiles can phase through multiple walls)
- ✅ Phase chance scales with level, increasing difficulty over time
- ✅ Different base chances create varied threat levels between enemy types

#### Testing Notes
- Test phase chance works for each projectile type
- Confirm phase chance scales correctly with level
- Verify projectiles can phase through multiple walls if they succeed on each roll
- Ensure non-phasing projectiles (other types) still collide normally

---

### Demo Sandbox

**Type**: Feature Enhancement  
**Files Modified**: 
- `client/src/pages/Demo.tsx` (new)
- `client/src/components/demo/DemoSidebar.tsx` (new)
- `client/src/components/demo/LogViewer.tsx` (new)
- `client/src/lib/game/demoSpawn.ts` (new)
- `client/src/components/game/GameCanvas.tsx`
- `client/src/App.tsx`

#### Overview
Created a comprehensive demo sandbox accessible at `/pixlab/demo` that provides a testing environment where all game entities (mobs, bosses, items, maze features) can be spawned and tested. The sandbox includes advanced controls for entity spawning, player movement, and real-time logging.

#### Features

##### Entity Spawning System
- **Mob Spawning**: Dropdown menu to spawn any regular mob type (drone, sniper, phase, charger, turret, swarm, guardian, moth, tracker, cerberus)
- **Boss Spawning**: Dropdown menu to spawn any boss type (Zeus, Hades, Ares)
- **Item Spawning**: Comprehensive dropdown menu with all item templates and rarities, including all scroll types
- **Maze Features**: Buttons to spawn portals and lightswitches
- **Spawn Location**: All entities spawn at the player's current position
- **Clear All**: Button to remove all spawned entities, items, projectiles, particles, and maze features

##### Player Controls
- **Wall Phasing**: Player can move freely through walls in demo mode
- **WASD Movement**: Full keyboard support for player movement
- **Mouse Drag & Drop**: Player can be dragged to any tile position with reduced sensitivity
- **Click to Relocate**: Mouse click on any tile relocates the player to that position
- **Mobile Controls**: Virtual joystick, touchpad, and directional pad support for mobile devices

##### Visual Features
- **Spotlight Toggle**: Toggle to enable/disable the vision-limiting spotlight effect
- **No HUD**: Timer and sector HUD removed for cleaner testing environment
- **Responsive Design**: Sidebar adapts to mobile devices as an overlay

##### Logging System
- **Real-time Log Viewer**: Displays console output, fetch requests, and errors
- **Console Interception**: Captures `console.log`, `console.info`, `console.warn`, and `console.error`
- **Fetch Interception**: Logs all API calls with method, URL, status, and duration
- **Error Tracking**: Captures unhandled errors and promise rejections
- **Color-coded Logs**: Different colors for different log levels
- **Scrollable Interface**: Scrollable log viewer with clear button

#### Technical Implementation

**Files Created:**

1. **`client/src/pages/Demo.tsx`**
   - Main demo page component
   - Manages player position state and spotlight toggle
   - Handles keyboard input (WASD/arrows)
   - Integrates GameCanvas with demo mode props
   - Coordinates entity spawning callbacks
   - Integrates mobile controls

2. **`client/src/components/demo/DemoSidebar.tsx`**
   - Sidebar UI component with all spawn controls
   - Dropdown menus for mobs, bosses, and items
   - Maze features section with portal/lightswitch spawning
   - Spotlight toggle control
   - Responsive design for mobile

3. **`client/src/components/demo/LogViewer.tsx`**
   - Real-time log viewer component
   - Intercepts console methods and fetch API
   - Captures window errors and unhandled rejections
   - Displays logs with timestamps and color coding

4. **`client/src/lib/game/demoSpawn.ts`**
   - Utility functions for spawning entities in demo mode
   - `findValidSpawnPosition()`: Finds valid floor tiles for spawning
   - `spawnMobEntity()`: Creates mob entities with scaled stats
   - `spawnBossEntity()`: Creates boss entities with scaled stats
   - `spawnSpecificItemAtPosition()`: Spawns specific items/scrolls by template and rarity
   - `spawnPortalAtPosition()`: Spawns portals with random exit positions
   - `spawnLightswitchAtPosition()`: Spawns lightswitches
   - `getAllItemOptions()`: Generates comprehensive list of all item/scroll combinations

**Files Modified:**

1. **`client/src/components/game/GameCanvas.tsx`**
   - Added `demoMode` prop to enable demo-specific behaviors
   - Added `onLevelRefReady` callback to expose level reference
   - Added `onPlayerPosUpdate` callback for player position tracking
   - Added `spotlightEnabled` prop to control spotlight rendering
   - Implemented wall phasing for player movement in demo mode
   - Added mouse drag-and-drop functionality for player
   - Added click-to-relocate functionality
   - Throttled drag updates to reduce sensitivity (50ms intervals)
   - Movement threshold to prevent jitter (1 tile minimum)

2. **`client/src/App.tsx`**
   - Added route for `/demo` path

#### Implementation Details

**Entity Spawning:**
- All spawn functions use the player's current position
- Entities are created with appropriate level scaling
- Mobs and bosses use player stats and loadout for power scaling
- Items can be spawned with specific templates, rarities, and scroll types

**Player Movement:**
- Keyboard input tracked via `Set` of pressed keys
- Mouse drag updates player position directly, bypassing normal movement logic
- Click-to-relocate converts screen coordinates to tile coordinates
- Movement works simultaneously with drag-and-drop

**Logging System:**
- Console methods are intercepted and wrapped to capture output
- Fetch API is intercepted to log all network requests
- Window error handlers capture unhandled errors
- Logs are stored in state and displayed in real-time

**Item Options Generation:**
- Iterates through all item templates from `ALL_TEMPLATES`
- Combines each template with all rarities (common, rare, epic, legendary)
- Includes all scroll types with their respective rarities
- Returns comprehensive list for dropdown population

#### Result
- ✅ Complete demo sandbox accessible at `/pixlab/demo`
- ✅ All game entities can be spawned and tested
- ✅ Player can move freely through walls
- ✅ Multiple input methods supported (keyboard, mouse, touch)
- ✅ Real-time logging for debugging
- ✅ Responsive design for desktop and mobile
- ✅ Spotlight can be toggled on/off
- ✅ All items and scrolls available in dropdown menu

#### Testing Notes
- Verify all mob types spawn correctly
- Test boss spawning with all three types
- Confirm all item templates and rarities are available in dropdown
- Test scroll spawning with all scroll types
- Verify player can phase through walls
- Test WASD movement after spawning entities
- Verify mouse drag-and-drop works smoothly
- Test click-to-relocate functionality
- Confirm spotlight toggle works
- Verify log viewer captures console output and fetch requests
- Test on both desktop and mobile devices

---

### Portal and Lightswitch Implementation

**Type**: Feature Implementation  
**Files Modified**: 
- `client/src/lib/game/constants.ts`
- `client/src/components/game/GameCanvas.tsx`

#### Overview
Implemented complete rendering and interaction systems for portals and lightswitches, two maze features that were being generated but not visible or functional in the game. Portals provide one-way teleportation within mazes, while lightswitches provide temporary full maze reveal.

#### Problem
Portals and lightswitches were being generated correctly in the level generation system (`engine.ts`), but were not rendering on the canvas and had no collision detection or interaction logic. Players could not see or interact with these features, making them effectively non-functional despite being part of the game design.

#### Solution
Implemented complete rendering and interaction systems for both features:

1. **Portal System**: Added visual rendering with glow effects and animated particles, plus collision detection for teleportation
2. **Lightswitch System**: Added visual rendering with indicator graphics, plus collision detection for activation and spotlight expansion

#### Technical Implementation

**Files Modified:**

1. **`client/src/lib/game/constants.ts`**
   - Added `portal: '#7b2cbf'` to `COLORS` object for portal glow color

2. **`client/src/components/game/GameCanvas.tsx`**

   **State Management:**
   - Added `lightswitchRevealEndTimeRef` to track when lightswitch reveal expires
   - Added `originalVisionRadiusRef` to store original vision radius before expansion
   - Both refs reset on level change

   **Portal Collision Detection:**
   - Detects when player steps on portal tile
   - Teleports player to portal exit position
   - Creates flash effect particles on teleport
   - Plays sound effect

   **Lightswitch Collision Detection:**
   - Detects when player steps on unactivated lightswitch
   - Activates lightswitch (sets `activated: true`)
   - Starts 5-second timer for full maze reveal
   - Clears vision debuff (`visionDebuffLevelRef.current = 0`)
   - Stores original vision radius

   **Portal Particle System:**
   - Generates particles at portal center (10% chance per frame)
   - Particles emanate outward in random directions (360°)
   - Portal position and angle stored in particle ID for tracking
   - Particles travel 1.4 tiles total (0.4 portal radius + 1.0 tile beyond)
   - Particles fade from bright white to transparent as they travel
   - Expired particles removed automatically

   **Portal Rendering:**
   - Pulsing glow effect with radial gradient
   - Inner portal ring with shadow effect
   - Dark center (void effect)
   - Bright white particles with strong purple glow
   - Particles rendered as circles with size 4

   **Lightswitch Rendering:**
   - Gold/yellow base with glow effect
   - White indicator circle
   - Subtle highlight for depth
   - Only renders if not activated

   **Spotlight Expansion:**
   - Expands spotlight to cover entire maze when lightswitch active
   - Calculates max radius: `Math.max(width, height) * TILE_SIZE * 1.5`
   - Returns to normal after 5 seconds
   - Removes activated lightswitches after reveal ends

   **Timer Management:**
   - Checks lightswitch reveal expiration in update loop
   - Removes activated lightswitches after timer expires
   - Restores original vision radius

#### Implementation Details

**Portal Particle Generation:**
- Particles start at portal center: `x: portal.pos.x, y: portal.pos.y`
- Angle stored in particle ID: `portal-particle-{time}-{portalX}-{portalY}-{angleHash}-{random}`
- Portal position encoded as integers (×100 for precision)
- Random angle in all directions: `Math.random() * Math.PI * 2`

**Portal Particle Movement:**
- Portal position extracted from particle ID (no need to search)
- Particles move outward based on stored angle and portal position
- Position updates each frame: `progress = age / lifetime`
- Distance calculation: `currentDistance = progress * totalDistance`
- Total distance: 1.4 tiles (portal radius 0.4 + 1.0 tile beyond)

**Portal Particle Rendering:**
- Bright white color: `#ffffff`
- Strong glow effect: `shadowBlur: 10`
- Circular particles: using `ctx.arc()` instead of `fillRect()`
- Size: 4 pixels
- Fade: `alpha = 1 - progress` (fades from opaque to transparent)

**Lightswitch Activation Flow:**
1. Player steps on lightswitch tile
2. Lightswitch marked as activated
3. Timer set: `lightswitchRevealEndTimeRef.current = Date.now() + 5000`
4. Vision debuff cleared: `visionDebuffLevelRef.current = 0`
5. Original vision radius stored (if not already stored)
6. Spotlight expands to full maze
7. After 5 seconds, spotlight returns to normal
8. Activated lightswitches removed from level

#### Portal Design Specifications

**Spawn Probability:**
- 50% chance in normal combat levels (not shops or bosses)
- Maximum one portal per maze

**Exit Position Logic:**
- 30% chance: near an item (2-3 tiles away)
- 5% chance: near level exit (2-3 tiles away)
- 65% chance: random valid floor tile

**Visual Design:**
- Purple glow color: `#7b2cbf`
- Pulsing outer glow with radial gradient
- Inner ring with shadow effect
- Dark center (void effect)
- Bright white particles emanating outward
- Particles extend 1 tile beyond portal edge

#### Lightswitch Design Specifications

**Spawn Probability:**
- 50% chance in normal combat levels
- 70% chance in boss levels
- Never spawns in shops
- Maximum 4 lightswitches per maze
- Minimum 5 tiles distance between lightswitches

**Visual Design:**
- Gold/yellow base: `#ffd700`
- White indicator circle
- Subtle highlight for depth
- Glow effect: `shadowBlur: 8`
- Disappears when activated

**Functionality:**
- Full maze reveal for 5 seconds
- Clears Nyx vision debuff on activation
- Expands spotlight to cover entire maze
- Returns to normal vision after timer expires

#### Result
- ✅ Portals render with pulsing glow and animated particles
- ✅ Portal particles emanate outward in all directions (360°)
- ✅ Portal particles are bright white and fade as they travel
- ✅ Portal teleportation works correctly
- ✅ Lightswitches render with gold/yellow indicator
- ✅ Lightswitch activation expands spotlight to full maze
- ✅ Lightswitch clears vision debuff on activation
- ✅ Lightswitch reveal lasts 5 seconds then returns to normal
- ✅ Activated lightswitches are removed after reveal ends
- ✅ Both features reset properly on level change

#### Testing Notes
- Verify portals spawn in 50% of normal levels
- Test portal teleportation (entry to exit)
- Confirm portal particles emanate in all directions
- Verify portal particles fade correctly as they travel
- Test lightswitch spawn probabilities (50% normal, 70% boss)
- Verify lightswitch activation expands spotlight
- Confirm lightswitch clears vision debuff
- Test lightswitch reveal timer (5 seconds)
- Verify lightswitches are removed after activation
- Test both features reset on level change
- Confirm maximum 4 lightswitches per maze
- Verify minimum distance between lightswitches (5 tiles)

---

### Item Economy Index & Availability-Aware Expected Growth

**Type**: Feature Implementation  
**Files Modified**: 
- `client/src/lib/game/itemEconomy.ts` (new)
- `client/src/lib/game/scaling.ts`
- `client/src/lib/game/engine.ts`
- `client/src/pages/Game.tsx`
- `client/src/components/game/GameCanvas.tsx`
- `client/src/lib/store.tsx`

#### Overview
Implemented a comprehensive Item Economy Index system that tracks expected vs actual item power based on what items were actually offered to the player (availability-aware). The system adjusts difficulty scaling based on item economy health and provides soft assists to help under-geared players without directly reducing difficulty.

#### Problem
The existing difficulty scaling system used a theoretical "expected power" calculation that assumed exponential growth (5% per level) based on initial stats, but did not account for:
- What items were actually offered to the player
- Whether items were affordable when offered
- Whether items were unlocked/available at the player's level
- Actual item power vs expected item power based on availability

This led to difficulty mismatches where players could be under-geared (fewer/better items than expected) or over-geared (more/better items than expected) without the system adjusting accordingly.

#### Solution
Created an availability-aware expected growth system that:
1. **Tracks all item offers** (drops, shop items, boss drops, bonus items)
2. **Weights offers by affordability** (can player actually afford it?)
3. **Weights offers by unlock status** (is item tier available at this level?)
4. **Calculates expected offer power** using EMA smoothing
5. **Compares actual owned power** (equipped items with synergy) vs expected
6. **Adjusts difficulty** via economy ratio (mild exponent: 0.25)
7. **Provides soft assists** (coin rewards, shop price reduction, elite mob reduction) when economy ratio is low

#### Technical Implementation

**Files Created:**

1. **`client/src/lib/game/itemEconomy.ts`**
   - Core item economy tracking system
   - `ItemOffer` interface for tracking offers
   - `OfferPowerMetrics` interface for comprehensive metrics
   - `ECONOMY_CONFIG` for tunable parameters
   - Functions:
     - `calculateItemPowerValue()`: Calculates normalized power value for items
     - `recordItemOffer()`: Records when items are shown/dropped
     - `markOfferPurchased()`: Updates offer status when purchased
     - `calculateAffordWeight()`: Determines affordability (full/partial/none)
     - `calculateUnlockWeight()`: Checks if item tier is available at level
     - `calculateOfferedPower()`: Sums weighted power of all offers
     - `calculateExpectedOfferPower()`: Applies EMA smoothing
     - `calculateSynergyMultiplier()`: Rewards diverse builds (0.8-1.3x)
     - `calculateActualOwnedPower()`: Sums equipped item power with synergy
     - `calculateEconomyRatio()`: Derives core ratio (clamped 0.8-1.25)
     - `getOfferPowerMetrics()`: Consolidates all metrics
     - `getSoftAssistAdjustments()`: Returns multipliers for soft assists
     - `logOfferMetrics()`: Development logging
     - `resetOfferTracking()`: Resets state for new runs
     - `getOfferHistory()`: Exports history for analysis

**Files Modified:**

1. **`client/src/lib/game/scaling.ts`**
   - Added `loadout` and `useEconomyIndex` to `ScalingParams` interface
   - Integrated economy ratio into `calculateScaling()` function
   - Applies economy adjustment: `baseScaling *= (economyRatio^0.25)`
   - Added comprehensive logging in development mode

2. **`client/src/lib/game/engine.ts`**
   - Added `recordItemOffer()` calls for dropped items
   - Updated all `calculateScaling()` calls to pass `loadout` and `useEconomyIndex`
   - Integrated soft assist mob weight adjustments in `selectMobType()`

3. **`client/src/pages/Game.tsx`**
   - Added `recordItemOffer()` calls for:
     - Boss drops (on boss defeat)
     - Shop vendor items (when generated)
     - Commerce vendor items (when scroll used)
   - Added `markOfferPurchased()` calls when items are bought
   - Integrated soft assist price reduction in shop UI
   - Displays adjusted prices with strikethrough for original price

4. **`client/src/components/game/GameCanvas.tsx`**
   - Added `recordItemOffer()` call for mystery box items
   - Integrated soft assist coin reward multiplier on enemy defeat

5. **`client/src/lib/store.tsx`**
   - Added `resetOfferTracking()` call in `resetGame()` function
   - Ensures tracking resets on new game start

#### Implementation Details

**Item Power Calculation:**
- Damage: 2.0x weight (highly valuable)
- Defense: 1.5x weight (valuable but less than damage)
- Speed: 15.0x weight (multiplies DPS, very high value)
- Vision: 5.0x weight (utility, moderate value)
- Heal: 0.1x weight (consumable, low power value)
- Rarity multipliers: common 1.0, rare 1.3, epic 1.6, legendary 2.0
- Level multiplier: 1 + (level - 1) * 0.05

**Affordability Weighting:**
- Full weight (1.0): `price <= coins`
- Partial weight (0.5): `price <= 1.5 * coins`
- No weight (0.0): `price > 1.5 * coins`

**Unlock Weighting:**
- Common: Available from level 1
- Rare: Available from level 3
- Epic: Available from level 8
- Legendary: Available from level 12
- Ramp-up period: 5 levels after unlock (gradual availability)

**EMA Smoothing:**
- Alpha: 0.3 (30% new data, 70% previous)
- Window: 10 levels
- Prevents spikes from single powerful items

**Synergy Multiplier:**
- Rewards diverse builds (multiple stat types)
- Penalizes extreme stacking (all damage)
- Range: 0.8-1.3x (clamped)
- Formula: `0.8 + (diversityBonus * 0.5) * stackingPenalty`

**Economy Ratio:**
- Formula: `actualOwnedPower / expectedOfferPower`
- Clamped: 0.8-1.25
- Exponent: 0.25 (mild adjustment to difficulty)
- Applied as: `baseScaling *= (economyRatio^0.25)`

**Soft Assist System:**
- Threshold: economy ratio < 0.9
- Coin reward multiplier: up to 1.2x (20% increase)
- Shop price reduction: up to 10% discount
- Elite mob weight reduction: up to 20% fewer elites
- Strength scales with how far below threshold: `(0.9 - ratio) / 0.9`

**Offer Tracking:**
- Tracks all offers: drops, shop items, boss drops, bonus items
- Records: item, level, source, coins at offer, purchase status
- Persists across levels within a run
- Resets on new game start

#### Configuration Parameters

**ECONOMY_CONFIG:**
```typescript
{
  smoothingAlpha: 0.3,           // EMA smoothing factor
  smoothingWindow: 10,            // History window size
  affordWeightFull: 1.0,          // Fully affordable weight
  affordWeightPartial: 0.5,       // Partially affordable weight
  affordWeightNone: 0.0,          // Not affordable weight
  economyExponent: 0.25,          // Mild difficulty adjustment
  economyRatioClamp: [0.8, 1.25], // Ratio bounds
  synergyClamp: [0.8, 1.3],       // Synergy bounds
  softAssistThreshold: 0.9,       // Assist activation threshold
  coinRewardMultiplier: 1.2,      // Max coin reward boost
  shopPriceReduction: 0.9,        // Min shop price (10% discount)
}
```

#### Result
- ✅ Difficulty scaling now accounts for actual item availability
- ✅ System tracks what items were offered and whether they were affordable
- ✅ Expected power based on actual offers, not theoretical growth
- ✅ Economy ratio adjusts difficulty mildly (0.25 exponent)
- ✅ Soft assists help under-geared players without direct difficulty reduction
- ✅ Comprehensive logging for tuning and analysis
- ✅ Synergy system rewards diverse builds
- ✅ All item sources tracked (drops, shops, bosses, bonuses)
- ✅ System resets properly on new game start

#### Integration Points

**Offer Recording:**
- Normal level item drops: `engine.ts` → `recordItemOffer('drop')`
- Boss drops: `Game.tsx` → `recordItemOffer('boss')`
- Shop items: `Game.tsx` → `recordItemOffer('shop')`
- Commerce vendor: `Game.tsx` → `recordItemOffer('shop')`
- Mystery box: `GameCanvas.tsx` → `recordItemOffer('bonus')`

**Purchase Tracking:**
- Shop purchases: `Game.tsx` → `markOfferPurchased()`
- Commerce vendor purchases: `Game.tsx` → `markOfferPurchased()`

**Difficulty Adjustment:**
- All `calculateScaling()` calls: `engine.ts` → passes `loadout` and `useEconomyIndex: true`
- Economy ratio applied: `scaling.ts` → `baseScaling *= (economyRatio^0.25)`

**Soft Assists:**
- Coin rewards: `GameCanvas.tsx` → `coinReward *= assists.coinRewardMultiplier`
- Shop prices: `Game.tsx` → `adjustedPrice = price * assists.shopPriceMultiplier`
- Elite mob weights: `engine.ts` → `spawnWeight *= assists.eliteMobWeightMultiplier`

#### Testing Notes
- Verify offers are recorded for all item sources
- Test affordability weighting with different coin amounts
- Confirm unlock weighting prevents early access to high-tier items
- Verify EMA smoothing prevents spikes from single items
- Test synergy multiplier with diverse vs stacked builds
- Confirm economy ratio adjusts difficulty appropriately
- Verify soft assists activate when ratio < 0.9
- Test coin reward multiplier on enemy defeat
- Verify shop price reduction displays correctly
- Confirm elite mob reduction works as expected
- Test system reset on new game start
- Verify comprehensive logging in development mode

#### Bug Fixes Applied
- Fixed `require()` usage in `store.tsx` (replaced with ES6 import)
- Fixed double dollar sign in shop price display (removed leading `$` from paragraph tag)

---

### Scroll Pricing System

**Type**: Feature Implementation  
**Files Modified**: 
- `client/src/lib/game/items.ts`

#### Overview
Implemented a comprehensive pricing system for all scroll types, allowing scrolls to be purchased and sold with values that scale based on scroll type and rarity. Previously, all scrolls had a price of 0, making them unsellable and unpurchasable.

#### Problem
Scrolls were generated with `price: 0`, which meant:
- Scrolls could not be sold to vendors
- Scrolls could not be purchased (if they were to be added to shops)
- The `calculateSellValue` function would return 0 for scrolls since they had no stats
- Scrolls had no economic value despite their utility

#### Solution
Created a base price system for scrolls that:
1. **Defines base prices** for each scroll type based on utility value
2. **Applies rarity multipliers** (same as regular items: 1.0x, 1.5x, 2.0x, 3.0x)
3. **Calculates final price** as `basePrice × rarityMultiplier`
4. **Integrates with existing sell system** - sell value is automatically 60% of purchase price

#### Technical Implementation

**Base Price Definitions:**
```typescript
const SCROLL_BASE_PRICES: Record<ScrollType, number> = {
  scroll_threatsense: 30,    // Common - Moderate utility
  scroll_lootsense: 60,      // Rare - Good utility
  scroll_pathfinding: 80,    // Rare - High utility
  scroll_fortune: 120,        // Epic - Very high utility
  scroll_commerce: 100,      // Variable - Very high utility
  scroll_phasing: 150,       // Variable - Extremely high utility
  scroll_ending: 200,        // Epic - Extremely high utility
};
```

**Price Calculation:**
- Base price is determined by scroll type (utility-based)
- Rarity multiplier applied: `common: 1.0, rare: 1.5, epic: 2.0, legendary: 3.0`
- Final price: `Math.floor(basePrice × rarityMultiplier)`
- Sell value: Automatically calculated as 60% of purchase price by `calculateSellValue()`

**Code Location:**
- `client/src/lib/game/items.ts` lines 202-211: Base price definitions
- `client/src/lib/game/items.ts` lines 235-238: Price calculation in `generateScroll()`
- `client/src/lib/game/items.ts` line 246: Price set in returned item object

#### Price Table

| Scroll Type | Rarity | Base Price | Purchase Price | Sell Value (60%) |
|------------|--------|------------|----------------|-----------------|
| **Threat-sense** | Common | 30 | **30** | **18** |
| **Loot-sense** | Rare | 60 | **90** | **54** |
| **Pathfinding** | Rare | 80 | **120** | **72** |
| **Fortune** | Epic | 120 | **240** | **144** |
| **Commerce** | Common | 100 | **100** | **60** |
| **Commerce** | Rare | 100 | **150** | **90** |
| **Commerce** | Epic | 100 | **200** | **120** |
| **Commerce** | Legendary | 100 | **300** | **180** |
| **Phasing** | Common | 150 | **150** | **90** |
| **Phasing** | Rare | 150 | **225** | **135** |
| **Phasing** | Epic | 150 | **300** | **180** |
| **Phasing** | Legendary | 150 | **450** | **270** |
| **Ending** | Epic | 200 | **400** | **240** |

#### Pricing Rationale

- **Threat-sense (30)**: Situational utility, priced below shop stat boosts
- **Loot-sense (60)**: Good utility for finding items, priced above basic shop items
- **Pathfinding (80)**: High utility for time-saving, priced above shop items
- **Fortune (120)**: Very high utility combining teleport and item finding
- **Commerce (100)**: Very high utility with guaranteed vendor access, scales with rarity
- **Phasing (150)**: Extremely high utility, game-changing ability, scales with rarity
- **Ending (200)**: Extremely high utility, skips many levels, highest base price

#### Result
- ✅ All scrolls now have purchase and sell values
- ✅ Prices scale appropriately with rarity
- ✅ Sell values are automatically calculated (60% of purchase price)
- ✅ Pricing reflects utility value of each scroll type
- ✅ Scrolls can be sold to vendors for coins
- ✅ Scrolls maintain economic value in the game

#### Testing Notes
- Verify scroll prices are calculated correctly for all types and rarities
- Test selling scrolls to vendors - confirm sell value is 60% of purchase price
- Verify price scaling with rarity (common < rare < epic < legendary)
- Check that scroll prices are reasonable compared to shop items (40-75 coins)
- Confirm scrolls maintain their functionality after pricing implementation

---

### Quick-Equip Button on Item Toast Notifications

**Type**: Feature Enhancement  
**Files Modified**: 
- `client/src/pages/Game.tsx`
- `client/src/components/ui/toast.tsx` (usage only)

#### Overview
Added a quick-equip button to toast notifications that appear when weapons or armor are obtained, allowing players to instantly equip items directly from the notification without opening the inventory.

#### Problem
When players obtained weapons or armor, a toast notification would appear showing the item details, but players had to:
- Open the inventory menu
- Find the newly obtained item
- Click the equip button manually

This created unnecessary friction in the gameplay flow, especially during combat or when quickly collecting multiple items.

#### Solution
Implemented a context-aware quick-equip button that:
1. **Only appears for equippable items** (weapons and armor, not utilities or consumables)
2. **Matches the toast's color theme** based on item rarity
3. **Provides instant feedback** with a confirmation toast when equipped
4. **Styled to be visually distinct** while maintaining consistency with the toast design

#### Technical Implementation

**1. Toast Action Integration**
- Imported `ToastAction` component from the toast UI library
- Added conditional action button to the item collection toast
- Button only renders when `newItem.type === 'weapon' || newItem.type === 'armor'`

**2. Rarity-Based Styling**
- Extended `rarityStyles` object to include button color schemes
- Button colors match toast background but use darker shades for visual hierarchy:
  - **Legendary**: `bg-yellow-950` (darker than toast's `bg-yellow-900/90`)
  - **Epic**: `bg-purple-950` (darker than toast's `bg-purple-900/90`)
  - **Rare**: `bg-blue-950` (darker than toast's `bg-blue-900/90`)
  - **Common**: `bg-gray-950` (darker than toast's `bg-gray-900/90`)
- Hover state uses the same shade as the toast background (`-900`)

**3. Focus State Management**
- Removed unwanted focus rings and outlines that appeared on click
- Added comprehensive focus state overrides:
  - `focus:ring-0` - removes focus ring
  - `focus:ring-offset-0` - removes ring offset
  - `focus-visible:ring-0` - removes focus-visible ring (prevents white border after Escape key)
  - `focus-visible:ring-offset-0` - removes focus-visible ring offset
  - `focus-visible:outline-none` - removes focus-visible outline
  - `active:ring-0` - removes active state ring
  - `outline-none` - removes default outline

**4. Equip Action Handler**
- Dispatches `EQUIP_ITEM` action with correct slot type (`weapon` or `armor`)
- Shows confirmation toast with green styling when item is successfully equipped
- Uses existing game state management system

#### Code Location

**`client/src/pages/Game.tsx`:**
- Lines 22: Import `ToastAction` component
- Lines 218-223: Extended `rarityStyles` with button color schemes
- Lines 226-248: Conditional action button implementation
- Lines 230-242: Equip action handler with dispatch and confirmation toast
- Line 244: Button styling with focus state overrides
- Line 253: Action passed to toast configuration

#### Styling Details

**Button Color Scheme:**
```typescript
const rarityStyles = {
  legendary: { 
    bg: 'bg-yellow-900/90', 
    border: 'border-yellow-500', 
    text: 'text-yellow-100',
    button: 'bg-yellow-950 hover:bg-yellow-900 border-yellow-600'
  },
  // ... similar for epic, rare, common
};
```

**Button ClassName:**
```typescript
className={`${style.button} text-white focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none active:ring-0 outline-none`}
```

#### Result
- ✅ Quick-equip button appears on weapon and armor toast notifications
- ✅ Button styling matches item rarity color theme
- ✅ One-click equipping directly from toast notification
- ✅ Confirmation feedback when item is equipped
- ✅ No unwanted focus rings or outlines on click or keyboard interaction
- ✅ Improved gameplay flow and reduced friction
- ✅ Button only appears for equippable items (weapons/armor)

#### User Experience Improvements
- **Faster item management**: Players can equip items immediately without opening inventory
- **Visual consistency**: Button colors match the toast's rarity theme
- **Clear feedback**: Confirmation toast confirms successful equipping
- **Clean interaction**: No visual artifacts from focus states

#### Testing Notes
- Obtain a weapon - verify quick-equip button appears in toast
- Obtain armor - verify quick-equip button appears in toast
- Obtain utility item - verify no button appears (utilities not included)
- Obtain consumable - verify no button appears (consumables not included)
- Click equip button - verify item is equipped and confirmation toast appears
- Test with different rarities - verify button colors match toast theme
- Click button then press Escape - verify no white border appears
- Verify button styling is darker than toast background for visual hierarchy
- Test hover state - verify button uses toast background color on hover

---

### Toast Click-to-Dismiss Feature

**Type**: Feature Enhancement  
**Files Modified**: 
- `client/src/components/ui/toaster.tsx`

#### Overview
Added click-to-dismiss functionality to toast notifications, allowing players to manually dismiss toasts by clicking anywhere on the toast content in addition to the existing auto-dismiss behavior. This provides players with more control over toast notifications and improves the user experience.

#### Problem
Toast notifications would only auto-dismiss after 4 seconds, with the only manual dismissal option being the close button (X) in the top-right corner. Players had no way to quickly dismiss toasts by clicking on the toast content itself, which could be inconvenient during gameplay when toasts appeared at inopportune times.

#### Solution
Implemented click-to-dismiss functionality that:
1. **Detects clicks on toast content** and dismisses the toast immediately
2. **Preserves interactive elements** - clicks on buttons, links, or other interactive elements don't trigger dismissal
3. **Works alongside auto-dismiss** - toasts still auto-dismiss after 4 seconds as before
4. **Maintains existing close button** - the X button continues to work as before

#### Technical Implementation

**Files Modified:**

1. **`client/src/components/ui/toaster.tsx`**
   - Added `dismiss` function from `useToast()` hook
   - Added `onClick` handler to `Toast` component
   - Implemented interactive element detection to prevent dismissal when clicking buttons/links
   - Uses `closest()` method to check if click target is within an interactive element

**Implementation Details:**

```typescript
<Toast 
  key={id} 
  {...props}
  onClick={(e) => {
    // Only dismiss if clicking on the toast itself, not on buttons or interactive elements
    const target = e.target as HTMLElement
    const isInteractive = target.closest('button') || target.closest('[role="button"]') || target.closest('a')
    if (!isInteractive) {
      dismiss(id)
    }
  }}
>
```

**Interactive Element Detection:**
- Checks if click target is a `button` element
- Checks if click target has `role="button"` attribute
- Checks if click target is an `a` (anchor/link) element
- Only dismisses if click is not on any interactive element

#### Result
- ✅ Players can click anywhere on toast content to dismiss it
- ✅ Toast close button (X) continues to work as before
- ✅ Action buttons (like quick-equip) don't trigger dismissal when clicked
- ✅ Auto-dismiss after 4 seconds still works
- ✅ Improved user control over toast notifications
- ✅ Better gameplay experience during combat or when toasts appear at inconvenient times

#### User Experience Improvements
- **Faster dismissal**: Players can quickly dismiss toasts by clicking on them
- **Better control**: More intuitive interaction with toast notifications
- **Preserved functionality**: All existing toast features (close button, action buttons) continue to work
- **Non-intrusive**: Interactive elements are protected from accidental dismissal

#### Behavior Notes
- Clicking on toast content dismisses the toast immediately
- Clicking on the close button (X) dismisses the toast (existing behavior)
- Clicking on action buttons (e.g., quick-equip) does NOT dismiss the toast
- Clicking on links or other interactive elements does NOT dismiss the toast
- Toasts still auto-dismiss after 4 seconds (existing behavior)

#### Testing Notes
- Click on toast content - verify toast dismisses immediately
- Click on close button (X) - verify toast dismisses (existing behavior)
- Click on action button (e.g., quick-equip) - verify toast does NOT dismiss
- Verify auto-dismiss still works after 4 seconds
- Test with different toast types (item collection, boss defeated, etc.)
- Verify all interactive elements are protected from dismissal

---

### HUD Terminology Update - "SECTOR" Instead of "LEVEL"

**Type**: UI Enhancement  
**Files Modified**: 
- `client/src/components/game/HUD.tsx`

#### Overview
Updated the in-game HUD to display "SECTOR" instead of "LEVEL" for better thematic consistency with the game's terminology. The change applies to both desktop and mobile HUD displays.

#### Problem
The HUD displayed "LEVEL" to indicate the current level number, but the game uses "SECTOR" terminology in other contexts (e.g., "SHOP SECTOR", "BOSS SECTOR"). This created a terminology inconsistency in the user interface.

#### Solution
Changed the HUD badge text from "LEVEL" to "SECTOR" in both desktop and mobile views, maintaining consistency with the game's established terminology.

#### Technical Implementation

**Files Modified:**

1. **`client/src/components/game/HUD.tsx`**
   - Updated desktop HUD badge (line 61): Changed `LEVEL {state.currentLevel}` to `SECTOR {state.currentLevel}`
   - Updated mobile HUD badge (line 80): Changed `LEVEL {state.currentLevel}` to `SECTOR {state.currentLevel}`
   - Used `replace_all` to update both instances simultaneously

#### Code Location

**`client/src/components/game/HUD.tsx`:**
- Line 61: Desktop HUD badge text
- Line 80: Mobile HUD badge text

#### Result
- ✅ HUD now displays "SECTOR" instead of "LEVEL" on desktop
- ✅ HUD now displays "SECTOR" instead of "LEVEL" on mobile
- ✅ Terminology is consistent with "SHOP SECTOR" and "BOSS SECTOR" badges
- ✅ No functional changes - purely cosmetic/terminology update
- ✅ No linting errors introduced

#### User Experience Improvements
- **Consistent terminology**: All sector-related UI elements now use "SECTOR"
- **Better thematic alignment**: Matches the game's sector-based progression system
- **Clearer communication**: "SECTOR" better reflects the game's structure

#### Testing Notes
- Verify HUD displays "SECTOR X" instead of "LEVEL X" on desktop
- Verify HUD displays "SECTOR X" instead of "LEVEL X" on mobile
- Confirm "SHOP SECTOR" and "BOSS SECTOR" badges still display correctly
- Test across different sector numbers to ensure formatting is correct

---

### Boss Sector Exit Spawning

**Type**: Feature Enhancement  
**Files Modified**: 
- `client/src/lib/game/engine.ts`

#### Overview
Implemented boss sector exit spawning behavior where the exit does not spawn during level generation, but instead spawns at the boss's death location once the boss is defeated. This creates a more dynamic and rewarding boss fight experience.

#### Problem
In boss sectors, the exit was being placed during level generation at a random location, which meant:
- Players could see the exit before defeating the boss
- The exit location had no connection to the boss fight
- The exit could be in an awkward or unreachable position relative to the boss
- The boss fight completion didn't feel as rewarding or climactic

#### Solution
Modified the level generation system to:
1. **Skip exit tile placement** for boss sectors during level generation
2. **Calculate placeholder exit position** for type safety (but don't set the tile)
3. **Leverage existing boss death handler** to spawn exit at boss death location
4. **Ensure exit spawns immediately** when boss is defeated

#### Technical Implementation

**Files Modified:**

1. **`client/src/lib/game/engine.ts`**
   - Modified exit placement logic (lines 115-128) to skip setting exit tile for boss sectors
   - For boss sectors: calculates exit position but doesn't set tile to 'exit'
   - For non-boss sectors: places exit tile as before
   - Added comment explaining boss sector behavior

**Boss Death Handler (Already Implemented):**
- The existing boss death handlers in `GameCanvas.tsx` already place the exit at the boss death location
- Two handlers exist:
  - Player attack handler (lines 612-639): Places exit when boss is killed by player attacks
  - Friendly fire handler (lines 1832-1849): Places exit when boss is killed by other means
- Both handlers:
  - Store boss death position before entity removal
  - Convert wall tiles to floor if needed
  - Set tile to 'exit' at boss death location
  - Update `levelRef.current.exitPos` to match

#### Implementation Details

**Exit Placement Logic:**
```typescript
// Set exit tile (skip for boss sectors - exit will spawn when boss is defeated)
if (!isBoss) {
  if (exitPos && tiles[exitPos.y][exitPos.x] === 'floor') {
    tiles[exitPos.y][exitPos.x] = 'exit';
  } else {
    // Last resort: use default position
    exitPos = { x: width - 2, y: height - 2 };
    tiles[exitPos.y][exitPos.x] = 'exit';
  }
} else {
  // For boss sectors, set a placeholder exitPos (will be updated when boss dies)
  if (!exitPos) {
    exitPos = { x: width - 2, y: height - 2 };
  }
}
```

**Boss Death Exit Placement:**
- Boss death position is captured: `{ x: Math.floor(enemy.pos.x), y: Math.floor(enemy.pos.y) }`
- Position is validated (within bounds, floor or wall tile)
- Wall tiles are converted to floor if needed
- Exit tile is set at boss death location
- `exitPos` is updated to match

#### Result
- ✅ Exit does not spawn during level generation for boss sectors
- ✅ Exit spawns at exact boss death location when boss is defeated
- ✅ Exit is immediately usable after boss defeat
- ✅ Boss fight completion feels more rewarding and climactic
- ✅ Exit location is always accessible (where boss died)
- ✅ Non-boss sectors continue to work as before
- ✅ No linting errors introduced

#### User Experience Improvements
- **More dynamic boss fights**: Exit appears as a reward for defeating the boss
- **Better visual feedback**: Exit spawning at boss death location provides clear completion signal
- **Improved flow**: Players must defeat the boss before they can exit, creating natural progression
- **Consistent behavior**: Exit always spawns where the boss died, making it predictable and fair

#### Behavior Notes
- Boss sectors: Exit spawns only after boss is defeated
- Non-boss sectors: Exit spawns during level generation (unchanged)
- Exit position is calculated during generation for boss sectors (for type safety) but tile is not set
- Boss death handlers work for both player attacks and friendly fire scenarios
- Exit can spawn on wall tiles (converted to floor automatically)

#### Testing Notes
- Enter a boss sector (levels 8, 16, 24, etc.) - verify no exit is visible initially
- Defeat the boss - verify exit spawns at boss death location
- Verify exit is immediately usable after boss defeat
- Test boss death from player attacks - confirm exit spawns correctly
- Test boss death from friendly fire - confirm exit spawns correctly
- Verify exit spawns even if boss dies on a wall tile (converts to floor)
- Test non-boss sectors - confirm exit still spawns during generation
- Verify exit position is always accessible and reachable

---

### Hover to See Equipped Stats Feature

**Type**: Feature Enhancement  
**Files Modified**: 
- `client/src/pages/Game.tsx`

#### Overview
Implemented a "hover to see equipped stats" feature that displays a tooltip showing the currently equipped item's stats when hovering over an unequipped item of the same type (weapon, armor, or utility). This feature is available on web (desktop) only and works across multiple inventory interfaces including the lobby inventory page, inventory dialogue, and vendor station purchase/sell pages.

#### Problem
Players had difficulty comparing items when deciding whether to equip a new item. They would need to:
- Remember what item is currently equipped
- Manually check the equipped item's stats
- Compare stats mentally between the equipped item and potential replacement
- Navigate between different UI sections to see equipped items

This created friction in the item management experience, especially when browsing inventory or shopping at vendor stations.

#### Solution
Created a reusable `InventoryItemWithHover` component that:
1. Detects when hovering over an equippable item (weapon, armor, or utility)
2. Checks if there's a currently equipped item of the same type
3. Displays a tooltip above the cursor showing the equipped item's name and stats
4. Uses React Portal to render outside dialog containers, preventing clipping
5. Only activates on web (desktop) - disabled on mobile devices

#### Technical Implementation

**Component Architecture:**

1. **`InventoryItemWithHover` Component** (lines 32-120 in `Game.tsx`)
   - Accepts props: `item`, `itemContent`, `equippedItem`, `canEquip`, `isMobile`
   - Manages hover state and mouse position tracking
   - Renders tooltip via React Portal to `document.body` to escape dialog overflow constraints
   - Only shows tooltip when:
     - Item is equippable (`canEquip` is true)
     - There's a currently equipped item of the same type
     - Not on mobile (`isMobile` is false)

2. **Tooltip Positioning:**
   - Uses `fixed` positioning relative to viewport
   - Tracks mouse position via `onMouseMove` event
   - Adjusts horizontal position to keep tooltip within viewport bounds
   - Shows above cursor by default, below if near top of viewport
   - High z-index (`z-[100]`) to appear above dialogs (`z-50`)

3. **React Portal Implementation:**
   - Uses `createPortal` from `react-dom` to render tooltip to `document.body`
   - Prevents tooltip from being clipped by dialog's `overflow-y-auto`
   - Ensures tooltip appears above all UI elements including dialogs

**Integration Points:**

1. **Lobby Inventory Page** (lines 881-889)
   - Already had hover feature implemented
   - Updated to pass `isMobile` prop for web-only behavior

2. **Inventory Dialogue** (lines 1313-1321)
   - Wraps each inventory item with `InventoryItemWithHover`
   - Extracts `itemContent` and determines `equippedItem` of same type
   - Tooltip renders outside dialog via portal

3. **Vendor Station PURCHASE Page** (lines 1186-1194)
   - Applies hover feature to vendor items
   - Shows equipped item stats when hovering over purchasable items
   - Helps players compare vendor items with currently equipped gear

4. **Vendor Station SELL Page** (lines 1652-1660)
   - Applies hover feature to items in inventory
   - Shows equipped item stats when hovering over items for sale
   - Helps players make informed selling decisions

#### Implementation Details

**Tooltip Content:**
- Displays "CURRENTLY EQUIPPED" header
- Shows equipped item name with rarity color
- Lists all stats (DMG, DEF, SPD, VIS, HEAL) if present
- Styled with dark background (`bg-black/95`) and primary border

**Mouse Position Calculation:**
```typescript
const cardWidth = 320; // w-80 = 20rem = 320px
const cardHeight = 200; // Approximate height
const padding = 10;

// Adjust horizontal position if near edges
if (x < cardWidth / 2 + padding) {
  adjustedX = cardWidth / 2 + padding;
} else if (x > window.innerWidth - cardWidth / 2 - padding) {
  adjustedX = window.innerWidth - cardWidth / 2 - padding;
}

// Show below cursor if near top of viewport
if (y < cardHeight + padding) {
  showBelow = true;
}
```

**Equipped Item Detection:**
```typescript
const equippedItem = canEquip && !isEquipped
  ? (item.type === 'weapon' ? state.loadout.weapon :
     item.type === 'armor' ? state.loadout.armor :
     item.type === 'utility' ? state.loadout.utility : null)
  : null;
```

#### Result
- ✅ Hover tooltip appears when hovering over unequipped items of equippable types
- ✅ Tooltip shows currently equipped item's name and all stats
- ✅ Tooltip renders outside dialog containers, preventing clipping
- ✅ Tooltip positions intelligently above/below cursor based on viewport position
- ✅ Feature works across all inventory interfaces (lobby, dialogue, vendor)
- ✅ Feature is web-only (disabled on mobile for better touch experience)
- ✅ No performance impact - tooltip only renders when hovering

#### User Experience Improvements
- **Faster item comparison**: Players can instantly see equipped item stats without navigating away
- **Better decision-making**: Clear visual comparison between current and potential items
- **Reduced cognitive load**: No need to remember equipped item stats
- **Consistent experience**: Same hover behavior across all inventory interfaces
- **Non-intrusive**: Tooltip only appears when relevant (hovering over equippable items with equipped alternatives)

#### Behavior Notes
- Tooltip only appears when:
  - Item is of type weapon, armor, or utility
  - There's a currently equipped item of the same type
  - Item is not already equipped
  - User is on web (not mobile)
- Tooltip disappears when mouse leaves the item
- Tooltip position adjusts to stay within viewport bounds
- Tooltip renders via portal to escape dialog overflow constraints

#### Testing Notes
- Hover over unequipped weapon in lobby inventory - verify tooltip shows equipped weapon stats
- Hover over unequipped armor in inventory dialogue - verify tooltip shows equipped armor stats
- Hover over vendor items in PURCHASE tab - verify tooltip shows equipped item of same type
- Hover over items in SELL tab - verify tooltip shows equipped item of same type
- Verify tooltip appears above cursor and overlays dialog content (not clipped)
- Test tooltip positioning near viewport edges - should adjust to stay visible
- Verify tooltip doesn't appear on mobile devices
- Test with no equipped item - tooltip should not appear
- Test with item already equipped - tooltip should not appear

---

### Player Footprint Trail

**Type**: Feature Enhancement  
**Files Modified**: 
- `client/src/lib/game/types.ts`
- `client/src/lib/game/engine.ts`
- `client/src/components/game/GameCanvas.tsx`

#### Overview
Implemented a visual footprint trail system that leaves dark shadow-like left and right foot prints behind the player as they move through the maze. Footprints alternate between left and right feet, are positioned on opposite sides of tiles, fade out over 3 seconds, and are properly mirrored to create a natural walking pattern.

#### Problem
The game lacked visual feedback showing the player's movement path through the maze. This made it difficult to:
- Track where the player has been
- Create a sense of movement and presence in the environment
- Add visual polish and immersion to the gameplay experience

#### Solution
Created a footprint system that:
1. Tracks player movement and creates footprints when entering new tiles
2. Alternates between left and right foot prints
3. Positions footprints on opposite sides of tiles (left foot on left, right foot on right)
4. Renders actual foot shapes (not just ovals) that are properly mirrored
5. Uses dark shadow colors that fade out over 3 seconds
6. Orients footprints in the direction of movement

#### Technical Implementation

**Type System:**
1. **Footprint Interface** (`types.ts`)
   - Added `Footprint` interface with:
     - `id`: Unique identifier
     - `pos`: Position in tile coordinates
     - `direction`: Movement direction when footprint was created
     - `isLeftFoot`: Boolean flag for left/right foot
     - `createdAt`: Timestamp for fade calculation
     - `lifetime`: Duration in milliseconds (3000ms = 3 seconds)

2. **Level Integration** (`types.ts`, `engine.ts`)
   - Added `footprints: Footprint[]` array to `Level` interface
   - Initialized empty `footprints: []` array when generating levels

**GameCanvas Implementation:**

1. **Tracking Refs:**
   - `footprintIdCounterRef`: Counter for unique footprint IDs
   - `lastFootprintPosRef`: Tracks last tile position where footprint was created
   - `nextFootIsLeftRef`: Tracks which foot to place next (alternating)

2. **Footprint Creation** (lines ~483-503):
   - Creates footprint when player enters a new tile
   - Alternates between left and right feet using `nextFootIsLeftRef`
   - Stores movement direction for proper orientation
   - Sets lifetime to 3000ms (3 seconds)

3. **Footprint Update Loop** (lines ~1000-1025):
   - Removes expired footprints (older than lifetime)
   - Runs every frame to maintain performance

4. **Footprint Rendering** (lines ~2120-2200):
   - Calculates fade alpha based on age
   - Positions footprints on opposite sides of tiles:
     - Left foot: offset to left side (negative perpendicular offset)
     - Right foot: offset to right side (positive perpendicular offset)
   - Rotates footprints to match movement direction
   - Draws actual foot shapes with:
     - Wider toe area at front
     - Narrower heel area at back
     - Curved edges for natural foot appearance
     - Proper mirroring (left foot outer edge on left, right foot outer edge on right)

#### Implementation Details

**Footprint Positioning:**
```typescript
// Calculate perpendicular direction for left/right offset
const perpAngle = angle + Math.PI / 2;
const offsetDistance = TILE_SIZE * 0.15; // Offset from center
const offsetX = Math.cos(perpAngle) * offsetDistance;
const offsetY = Math.sin(perpAngle) * offsetDistance;

// Position left foot on left side, right foot on right side
const footprintX = centerX + (footprint.isLeftFoot ? -offsetX : offsetX);
const footprintY = centerY + (footprint.isLeftFoot ? -offsetY : offsetY);
```

**Foot Shape Drawing:**
- Left foot: Outer edge (curved outward) on left, inner edge (curved inward) on right
- Right foot: Outer edge (curved outward) on right, inner edge (curved inward) on left
- Both feet have wider toe area and narrower heel area
- Uses dark shadow color: `rgba(0, 0, 0, 0.5)` with stroke `rgba(0, 0, 0, 0.3)`

**Alternating Logic:**
```typescript
const isLeftFoot = nextFootIsLeftRef.current;
// ... create footprint with isLeftFoot ...
nextFootIsLeftRef.current = !nextFootIsLeftRef.current; // Alternate
```

**Cleanup:**
- Footprints are cleared on game over
- Expired footprints are removed in update loop
- Footprint tracking resets when new level loads

#### Result
- ✅ Footprints appear as dark shadow-like shapes behind the player
- ✅ Left and right footprints alternate naturally
- ✅ Footprints are positioned on opposite sides of tiles
- ✅ Foot shapes are properly mirrored (not identical)
- ✅ Footprints fade out over 3 seconds
- ✅ Footprints are oriented in movement direction
- ✅ Performance optimized with automatic cleanup
- ✅ Visual polish enhances immersion

#### User Experience Improvements
- **Visual feedback**: Players can see their movement path through the maze
- **Natural appearance**: Alternating left/right footprints create realistic walking pattern
- **Non-intrusive**: Dark shadows fade quickly, don't clutter the screen
- **Directional awareness**: Footprints show movement direction, helpful for navigation

#### Behavior Notes
- Footprints are only created when entering a new tile (not on same tile)
- Footprints alternate between left and right feet
- Left footprints appear on left side of tile, right footprints on right side
- Footprints fade from 60% opacity to 0% over 3 seconds
- Footprints are cleared when game ends or level changes
- Footprint shapes are properly mirrored (left and right are different)

#### Testing Notes
- Move player through maze - verify footprints appear behind player
- Verify footprints alternate between left and right
- Check that left footprints are on left side of tiles, right on right side
- Confirm footprints are mirrored (not identical shapes)
- Verify footprints fade out over 3 seconds
- Test footprints orient correctly in all movement directions (up, down, left, right, diagonals)
- Verify footprints are cleared on game over
- Test performance with many footprints (should clean up expired ones)

---

### Game Event Log Viewer

**Type**: Feature Enhancement  
**Files Modified**: 
- `client/src/lib/game/eventLogger.ts`
- `client/src/components/game/GameEventLogViewer.tsx`
- `client/src/components/game/GameCanvas.tsx`
- `client/src/pages/Game.tsx`
- `client/src/lib/store.tsx`
- `client/src/components/ui/toast.tsx`

#### Overview
Implemented a comprehensive in-game event logging system with a resizable log viewer that displays color-coded events in real-time. The system tracks all major game events including combat, progression, loot, shop purchases, environment interactions, consumable usage, and equipment changes. The log viewer is positioned at the bottom of the screen, remains visible during game over, and uses the same pixel font as the mission button for visual consistency.

#### Problem
Players had no way to review what happened during gameplay:
- No visibility into damage dealt/taken, kills, or combat events
- No record of item pickups, coin collection, or shop purchases
- No tracking of sector progression, boss events, or level transitions
- No log of environmental interactions (portals, lightswitches) or consumable usage
- No way to review events after game over to understand what happened

#### Solution
Created a centralized event logging system with:
1. **Event Logger Singleton**: Centralized service for logging all game events
2. **Resizable Log Viewer**: Bottom panel that can be resized by the player
3. **Color-Coded Categories**: Events grouped by type with distinct colors
4. **Real-Time Updates**: Events appear immediately as they occur
5. **Smart Filtering**: Automatically removes duplicate sector start events
6. **Game Over Visibility**: Log remains visible during game over screen for review

#### Technical Implementation

**Event Type System:**
Events are categorized into 7 types:
- `combat`: Damage taken, damage dealt, enemy kills
- `progression`: Sector start/complete, boss spawn/defeat
- `loot`: Item pickups, coin collection
- `shop`: Shop purchases
- `environment`: Lightswitch activation, portal usage
- `consumable`: Scroll usage, potion consumption
- `event`: Equipment changes (equip/unequip)

**Event Logger (`eventLogger.ts`):**
- Singleton pattern for global access
- Maintains event history (max 200 events)
- Subscriber pattern for real-time UI updates
- Type-safe event definitions
- Automatic event trimming (keeps most recent 200)

**Log Viewer Component (`GameEventLogViewer.tsx`):**
- Resizable panel integrated with `ResizablePanelGroup`
- Color-coded by event type:
  - Combat: Red (`text-red-400`)
  - Progression: Cyan (`text-cyan-400`)
  - Loot: Blue (`text-blue-400`)
  - Shop: Purple (`text-purple-400`)
  - Environment: Pink (`text-pink-400`)
  - Consumable: Amber (`text-amber-400`)
  - Event: Green (`text-green-400`)
- Newest events at top (reversed display)
- Auto-scroll to newest events
- Truncates long messages with tooltip on hover
- Uses `font-pixel` to match mission button styling
- Small font sizes for compact display (`text-xs` for timestamps/categories, `text-sm` for messages)

**Event Logging Integration:**

1. **Combat Events** (`GameCanvas.tsx`):
   - Player damage taken
   - Player damage dealt to enemies
   - Enemy kills
   - Boss defeats

2. **Progression Events** (`GameCanvas.tsx`, `Game.tsx`):
   - Sector start
   - Sector complete
   - Boss spawn
   - Boss defeat

3. **Loot Events** (`GameCanvas.tsx`):
   - Item pickups
   - Coin collection

4. **Shop Events** (`Game.tsx`):
   - Item purchases

5. **Environment Events** (`GameCanvas.tsx`):
   - Lightswitch activation
   - Portal usage

6. **Consumable Events** (`GameCanvas.tsx`, `store.tsx`):
   - Scroll usage (Fortune, Pathfinding, Ending, Threat-sense, Loot-sense, Phasing, Commerce)
   - Potion usage (Light, Healing, Speed)

7. **Equipment Events** (`store.tsx`):
   - Item equipped
   - Item unequipped

**Smart Filtering:**
- Compares first two (oldest) events
- If both are same category and both about starting a sector, drops the first (oldest) entry
- Prevents duplicate "Sector 1 started" events from appearing
- Only affects the first two events, never drops subsequent events

**Z-Index Management:**
- Log viewer: `z-[201]`
- Toast notifications: `z-[250]` (ensures toasts always appear above log)
- Game over overlay: Lower z-index to allow log visibility

#### Implementation Details

**Event Logger Structure:**
```typescript
export type EventType = 'combat' | 'progression' | 'loot' | 'shop' | 'environment' | 'consumable' | 'event';

export interface GameEvent {
  id: string;
  timestamp: Date;
  type: EventType;
  message: string;
  data?: Record<string, any>;
}
```

**Subscription Pattern:**
```typescript
// Subscribe to events
const unsubscribe = eventLogger.subscribe((event) => {
  setEvents(prev => [...prev, event].slice(-maxEntries));
});

// Cleanup on unmount
return () => unsubscribe();
```

**Resizable Integration:**
```typescript
<ResizablePanelGroup direction="vertical">
  <ResizablePanel defaultSize={85} minSize={50}>
    {/* Main game area */}
  </ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize={15} minSize={10} maxSize={40}>
    <GameEventLogViewer />
  </ResizablePanel>
</ResizablePanelGroup>
```

**Filtering Logic:**
```typescript
// Only check first two (oldest) events
if (events.length >= 2) {
  const first = events[0];
  const second = events[1];
  
  const sameCategory = first.type === second.type;
  const bothAboutSectorStart = 
    first.message.toLowerCase().includes('started') && 
    second.message.toLowerCase().includes('started');
  
  if (sameCategory && bothAboutSectorStart) {
    filtered = events.slice(1); // Drop first (oldest) entry
  }
}
```

#### Result
- ✅ All major game events are logged and displayed
- ✅ Color-coded categories make events easy to scan
- ✅ Resizable panel allows players to adjust log size
- ✅ Real-time updates show events as they happen
- ✅ Log remains visible during game over for review
- ✅ Smart filtering prevents duplicate sector start events
- ✅ Compact font sizes and pixel font match game aesthetic
- ✅ Toast notifications always appear above log viewer
- ✅ Performance optimized with memoization and debounced scrolling

#### User Experience Improvements
- **Comprehensive Tracking**: Players can see everything that happened during gameplay
- **Visual Organization**: Color coding makes it easy to find specific event types
- **Review Capability**: Log visible during game over helps players understand what happened
- **Non-Intrusive**: Resizable panel allows players to adjust size to preference
- **Consistent Styling**: Pixel font matches mission button for visual consistency

#### Behavior Notes
- Events are displayed newest first (reversed order)
- Only the first two (oldest) events are checked for duplicates
- Shop events should never be dropped (players go through 4 sectors before shop)
- Log viewer has higher z-index than game over overlay
- Toast notifications have highest z-index to always appear on top
- Font sizes are small for compact display (`text-xs`/`text-sm`)
- Category and event message are vertically aligned (`items-center`)

#### Testing Notes
- Verify all event types appear in log with correct colors
- Test resizable panel functionality (drag handle to resize)
- Confirm log remains visible during game over screen
- Verify toast notifications appear above log viewer
- Test duplicate sector start filtering (should only drop first if both are sector starts)
- Verify shop events appear correctly (should never be dropped)
- Test equip/unequip events appear in log
- Confirm scroll and potion usage events are logged
- Verify portal and lightswitch events appear
- Test performance with many events (should cap at 200)

---

## Fixes

### Projectile Wall Collision Detection Fixes

## Fixes

### Projectile Wall Collision Detection Fixes

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/lib/game/engine.ts`

#### Overview
Fixed critical bugs in projectile wall collision detection that caused projectiles to pass through walls incorrectly and generated console errors.

#### Problems Fixed

##### 1. Asymmetric Wall Collision Detection
**Issue**: Projectiles could pass through walls horizontally (left/right) but were correctly blocked vertically (up/down).

**Root Cause**: The `checkCollision` function was using floating-point positions directly as array indices. Since projectiles move with fractional coordinates (`PROJECTILE_SPEED = 0.15` tiles per frame), accessing `level.tiles[pos.y][pos.x]` with non-integer values caused inconsistent behavior.

**Solution**: Modified `checkCollision` to convert floating-point positions to integer tile coordinates using `Math.floor()` before accessing the tiles array, ensuring consistent collision detection in all directions.

##### 2. Undefined Tile Array Access Error
**Issue**: Console errors: `TypeError: Cannot read properties of undefined (reading '5')` occurring repeatedly during projectile updates.

**Root Cause**: The collision check accessed `level.tiles[pos.y][pos.x]` without verifying that `level.tiles[pos.y]` exists, which could happen during level transitions or if the tiles array was malformed.

**Solution**: Added safety checks to ensure both `level.tiles` and `level.tiles[tileY]` exist before accessing nested array elements.

#### Technical Implementation

**Files Modified:**

1. **`client/src/lib/game/engine.ts`**
   - Updated `checkCollision()` to use `Math.floor()` for tile coordinate conversion
   - Added safety checks for undefined tile rows

#### Result
- ✅ Projectiles now correctly collide with walls in all directions
- ✅ No more undefined tile access errors
- ✅ Consistent collision detection regardless of movement direction

#### Testing Notes
- Verify projectiles collide with walls correctly in all four cardinal directions
- Ensure no console errors occur during projectile updates
- Test collision detection during level transitions

---

### Exit Tile Mob Spawn and Movement Prevention

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/lib/game/engine.ts`
- `client/src/components/game/GameCanvas.tsx`

#### Overview
Implemented comprehensive prevention of mobs spawning on or moving onto the exit tile, ensuring the exit remains accessible to players at all times. The fix includes spawn prevention during level generation, movement prevention during gameplay, and special behavior exclusions for mobs with unique movement patterns.

#### Problem
Mobs could spawn on or move onto the exit tile, blocking player access to the level exit. This could occur:
- During level generation when mobs are spawned
- During gameplay when mobs move toward the player
- During special mob behaviors like moth blinking or orbiting

#### Solution
Added multiple layers of protection across the codebase:

1. **Spawn Prevention**: Modified `findValidFloorTile()` in level generation to explicitly exclude the exit tile when placing all mob types (bosses, Cerberus, and normal enemies)
2. **Movement Prevention**: Added validation in the movement application logic to prevent any mob from moving onto the exit tile
3. **Moth Blink Exclusion**: Updated dark tile selection to explicitly exclude the exit tile from moth blink destinations

#### Technical Implementation

**Files Modified:**

1. **`client/src/lib/game/engine.ts`**
   
   **Spawn Prevention in `findValidFloorTile()`** (Lines 142-178):
   - Added exit tile exclusion check in preferred position validation
   - Added exit tile exclusion in valid positions collection loop
   - Added exit tile exclusion in fallback position search
   - Ensures all mob types (bosses, Cerberus, normal enemies) cannot spawn on exit tile
   
   **Implementation:**
   ```typescript
   // Check if target tile is the exit - mobs cannot occupy exit tile
   if (px !== exitPos.x || py !== exitPos.y) {
     // Valid position
   }
   
   // Collect all valid floor positions (excluding exit)
   if (tiles[y][x] === 'floor' &&
       (x !== exitPos.x || y !== exitPos.y)) {
     validPositions.push({ x, y });
   }
   ```

2. **`client/src/components/game/GameCanvas.tsx`**

   **Movement Application Check** (Lines ~1648-1655):
   - Added exit tile validation before applying movement
   - If target position is the exit tile, movement is blocked and entity remains in place
   - Prevents all mob types from moving onto the exit tile
   
   **Implementation:**
   ```typescript
   // Check if target tile is the exit - mobs cannot occupy exit tile
   const tileX = Math.floor(nextPos.x);
   const tileY = Math.floor(nextPos.y);
   const exitPos = levelRef.current.exitPos;
   if (tileX === exitPos.x && tileY === exitPos.y) {
     // Block movement onto exit tile
     return updatedEntity;
   }
   ```

   **Moth Blink Dark Tile Exclusion** (Lines ~1223-1240):
   - Updated dark tile selection loop to skip exit tile coordinates
   - Ensures moths cannot blink to the exit tile as a destination
   
   **Implementation:**
   ```typescript
   const exitPos = levelRef.current.exitPos;
   for (let y = 0; y < levelRef.current.height; y++) {
     for (let x = 0; x < levelRef.current.width; x++) {
       if (levelRef.current.tiles[y][x] === 'floor' &&
           (x !== exitPos.x || y !== exitPos.y)) {
         // Valid dark tile (not exit)
       }
     }
   }
   ```

#### Implementation Details

**Spawn Prevention:**
- Applied to all mob spawn locations: boss positions, Cerberus positions, and normal enemy positions
- Works for both preferred positions and random position selection
- Includes fallback position search to ensure exit is never selected even in edge cases

**Movement Prevention:**
- Check occurs after collision detection but before movement is applied
- Blocks movement if target tile matches exit position
- Returns entity unchanged, preventing position update
- Applies to all mob types equally

**Moth Blink Exclusion:**
- Exit tile is excluded from dark tile candidate list
- Prevents moths from selecting exit tile as blink destination
- Maintains normal blink behavior for all other valid tiles

#### Result
- ✅ Mobs cannot spawn on the exit tile during level generation
- ✅ Mobs cannot move onto the exit tile during gameplay
- ✅ Moths cannot blink to the exit tile
- ✅ Exit tile remains accessible to players at all times
- ✅ All mob types are protected (bosses, Cerberus, drones, swarm, phase, sniper, charger, turret, tracker, guardian, moth)
- ✅ No impact on mob pathfinding - mobs can still pathfind through exit tile area (just can't stop on it)

#### Behavior Notes
- Spawn prevention ensures exit tile is never selected during level generation
- Movement prevention blocks mobs from ending their movement on the exit tile
- Mobs are not blocked from pathfinding through the exit tile area - they simply cannot stop on it
- The exit tile check occurs after collision detection, allowing normal pathfinding behavior
- All mob types are affected equally by both spawn and movement prevention

#### Testing Notes
- Verify mobs cannot spawn on exit tile in generated levels
- Test mob movement - ensure mobs cannot move onto exit tile
- Test moth blink behavior - ensure moths never blink to exit tile
- Confirm exit tile remains accessible to player at all times
- Verify mobs can still pathfind through exit tile area (move through without stopping)
- Test with various mob types (drone, swarm, phase, sniper, charger, turret, tracker, guardian, cerberus, bosses)
- Test boss sectors - verify exit spawns correctly and mobs don't occupy it

---

### WASD Control Fix After Entity Spawning

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/pages/Demo.tsx`

#### Overview
Fixed a critical bug where WASD keyboard controls would stop working after spawning entities in the demo sandbox. The issue was caused by improper key state tracking in the keyboard event handlers.

#### Problem
After spawning an entity (mob, boss, item, etc.) in the demo sandbox, the WASD movement controls would stop responding. The player could no longer move using keyboard input, even though the controls worked fine before spawning.

**Root Cause**: The `handleKeyUp` event handler was resetting the input direction to `{ x: 0, y: 0 }` whenever ANY key was released, without checking which keys were still pressed. This meant:
- If a user was holding W and D simultaneously
- Then released W
- The handler would set direction to zero, even though D was still pressed
- This broke multi-key input and caused controls to stop working after interactions

#### Solution
Implemented proper key state tracking using a `Set` to maintain all currently pressed movement keys:

1. **Key State Tracking**: Created a `pressedKeys` Set to track all currently pressed movement keys
2. **Direction Recalculation**: Created `updateDirection()` function that recalculates movement direction based on ALL currently pressed keys
3. **Key Down Handler**: Modified to add keys to the Set and recalculate direction
4. **Key Up Handler**: Modified to remove keys from the Set and recalculate direction
5. **Event Prevention**: Added `preventDefault()` for movement keys to avoid conflicts

#### Technical Implementation

**Files Modified:**

1. **`client/src/pages/Demo.tsx`**
   - Replaced simple keydown/keyup handlers with stateful key tracking
   - Added `pressedKeys` Set to track active keys
   - Created `updateDirection()` function to recalculate based on all pressed keys
   - Modified `handleKeyDown` to add keys to Set and prevent default
   - Modified `handleKeyUp` to remove keys from Set
   - Both handlers call `updateDirection()` to update input direction

**Key Changes:**
```typescript
// Before: Simple handlers that reset on any key release
const handleKeyUp = () => {
  setInputDirection({ x: 0, y: 0 });
};

// After: Stateful tracking with recalculation
const pressedKeys = new Set<string>();
const updateDirection = () => {
  let newDir = { x: 0, y: 0 };
  if (pressedKeys.has('w') || pressedKeys.has('arrowup')) newDir.y = -1;
  if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) newDir.y = 1;
  if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) newDir.x = -1;
  if (pressedKeys.has('d') || pressedKeys.has('arrowright')) newDir.x = 1;
  setInputDirection(newDir);
};
```

#### Result
- ✅ WASD controls work correctly after spawning entities
- ✅ Multiple keys can be held simultaneously (e.g., W+D for diagonal movement)
- ✅ Releasing one key doesn't reset movement if other keys are still pressed
- ✅ Keyboard input is properly tracked regardless of UI interactions
- ✅ Movement keys prevent default behavior to avoid conflicts

#### Testing Notes
- Spawn various entities (mobs, bosses, items) and verify WASD still works
- Test holding multiple keys simultaneously (W+D, W+A, S+D, etc.)
- Verify releasing one key doesn't stop movement if another is still pressed
- Test after clicking sidebar buttons and dropdowns
- Confirm arrow keys also work correctly
- Test rapid key presses and releases

---

### Scroll System Fixes - Commerce and Fortune Scrolls

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/lib/game/types.ts`
- `client/src/lib/store.tsx`
- `client/src/pages/Game.tsx`
- `client/src/components/game/GameCanvas.tsx`

#### Overview
Fixed critical bugs preventing Scroll of Commerce from opening the vendor station and improved Scroll of Fortune teleportation reliability. The Commerce scroll was failing because it tried to look up the scroll's rarity after it was already removed from inventory.

#### Problems Fixed

##### 1. Scroll of Commerce Not Triggering Vendor Station
**Issue**: When using Scroll of Commerce, the vendor station modal would not open.

**Root Cause**: 
- The scroll was removed from inventory immediately when used (in `USE_CONSUMABLE` action)
- The `useEffect` handler in `Game.tsx` tried to find the scroll in inventory to get its rarity
- By the time the effect ran, the scroll was already gone, causing the handler to fail silently

**Solution**: 
- Updated `pendingScrollAction` type to include `rarity: Item['rarity']`
- Store the scroll's rarity when setting `pendingScrollAction` in the `USE_CONSUMABLE` handler
- Updated Commerce scroll handler to use the stored rarity instead of looking it up

##### 2. Scroll of Fortune Teleportation Issues
**Issue**: Scroll of Fortune sometimes failed to teleport the player, especially when no valid positions were found in the initial search range.

**Root Cause**: 
- The teleport logic only searched for positions 2-3 tiles away from the nearest item
- If no valid positions were found in that range, the scroll was consumed but no teleport occurred
- No fallback search was implemented

**Solution**: 
- Added a fallback search that expands the range to 1-4 tiles if initial search fails
- Ensures teleportation succeeds in more scenarios
- Maintains the preferred 2-3 tile distance when possible

#### Technical Implementation

**1. Type Definition Update:**
```typescript
// client/src/lib/game/types.ts
pendingScrollAction: { 
  type: ScrollType; 
  scrollId: string; 
  rarity: Item['rarity']  // Added rarity field
} | null;
```

**2. Store Rarity When Setting Pending Action:**
```typescript
// client/src/lib/store.tsx
newState.pendingScrollAction = { 
  type: scrollType, 
  scrollId: consumable.id,
  rarity: consumable.rarity  // Store rarity before scroll is removed
};
```

**3. Commerce Scroll Handler Fix:**
```typescript
// client/src/pages/Game.tsx
useEffect(() => {
  if (state.pendingScrollAction?.type === 'scroll_commerce') {
    // Use stored rarity instead of looking it up
    const scrollRarity = state.pendingScrollAction.rarity;
    
    if (scrollRarity) {
      const vendorItems = generateCommerceVendorItems(scrollRarity, state.currentLevel);
      // ... open vendor station
    }
  }
}, [state.pendingScrollAction, state.currentLevel, dispatch]);
```

**4. Fortune Scroll Fallback Search:**
```typescript
// client/src/components/game/GameCanvas.tsx
if (nearbyPositions.length > 0) {
  // Teleport to preferred position (2-3 tiles away)
} else {
  // Fallback: try wider search (1-4 tiles away)
  const widerPositions: Position[] = [];
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist >= 1 && dist <= 4) {
        // ... find valid positions
      }
    }
  }
  // Teleport if wider search finds positions
}
```

#### Files Modified

**`client/src/lib/game/types.ts`:**
- Updated `pendingScrollAction` type to include `rarity` field

**`client/src/lib/store.tsx`:**
- Modified `USE_CONSUMABLE` case to store `rarity` in `pendingScrollAction`

**`client/src/pages/Game.tsx`:**
- Updated Commerce scroll handler to use stored rarity
- Added fallback to 'common' rarity if rarity is missing
- Removed inventory lookup logic

**`client/src/components/game/GameCanvas.tsx`:**
- Added fallback search for Scroll of Fortune (1-4 tiles if 2-3 tiles fails)
- Improved teleportation reliability

#### Result
- ✅ Scroll of Commerce now opens vendor station correctly
- ✅ Vendor items are generated with correct rarity
- ✅ Scroll of Fortune teleports more reliably
- ✅ Fallback search ensures teleportation succeeds in more scenarios
- ✅ All scroll types verified working correctly:
  - Threat-sense: Sets `activeScrollEffects.threatSense = true` ✅
  - Loot-sense: Sets `activeScrollEffects.lootSense = true` ✅
  - Phasing: Sets `activeScrollEffects.phasing` with duration ✅
  - Fortune: Teleports to nearest item ✅
  - Pathfinding: Teleports near exit ✅
  - Ending: Advances to next boss sector ✅
  - Commerce: Opens vendor station ✅

#### Behavior Notes
- Commerce scroll rarity is stored before the scroll is removed from inventory
- The vendor station opens immediately when Commerce scroll is used
- Fortune scroll prefers teleporting 2-3 tiles away, but falls back to 1-4 tiles if needed
- All scrolls are consumed from inventory when used
- Scroll effects trigger correctly for all scroll types

#### Testing Notes
- Use Scroll of Commerce - verify vendor station opens with correct items
- Test Commerce scroll with different rarities (common, rare, epic, legendary)
- Use Scroll of Fortune - verify player teleports near nearest item
- Test Fortune scroll when items are in tight spaces (should use fallback search)
- Verify all other scroll types still work correctly
- Test scroll consumption - confirm scrolls are removed from inventory
- Verify scroll effects persist correctly (threat-sense, loot-sense, phasing)

---

### Game Over State Refresh Fix

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/pages/Game.tsx`

#### Overview
Fixed a bug where refreshing the browser while the game over prompt was displayed would cause the prompt to disappear and leave the player in the game with 0 HP instead of redirecting to the Home screen.

#### Problem
When a player died and the game over prompt appeared, if they refreshed the browser:
1. The game state was restored from localStorage with HP = 0 and screen = 'run'
2. The `gameOverState` component state was lost (not persisted to localStorage)
3. The refresh handler detected the refresh but didn't check for HP = 0
4. The player would be back in the game with 0 HP, able to continue playing in an invalid state

**Root Cause**: 
- The refresh handler checked for page refreshes and reset the game, but it didn't specifically check if the player had 0 HP (indicating a game over state)
- The `gameOverState` is component-level state that doesn't persist across page refreshes
- When state was restored from localStorage, it included HP = 0 but no indication that the game was over

#### Solution
Added a check in the refresh handler to detect when HP is 0 or less, indicating the player was in a game over state before the refresh. When detected, the game is reset and the player is immediately redirected to Home.

#### Technical Implementation

**Refresh Handler Enhancement:**
```typescript
// client/src/pages/Game.tsx
useEffect(() => {
  // Only handle refresh once on mount
  if (hasHandledRefresh.current) return;
  hasHandledRefresh.current = true;

  // Check if this is a page refresh (no navigation flag) vs normal navigation
  const wasNavigated = sessionStorage.getItem('navigated_to_play');
  
  // If we're on /play and the game state shows an active game (not title screen)
  if (location === '/play' && (state.screen === 'run' || state.screen === 'lobby' || state.screen === 'shop')) {
    // Only treat as refresh if there's no navigation flag (page was refreshed)
    if (!wasNavigated) {
      // Check if player has 0 HP (game over state) - redirect to Home
      if (state.stats.hp <= 0) {
        // Reset game state (this cleans up everything)
        resetGame();
        // Navigate to Home immediately (no game over UI shown)
        setLocation('/');
        return;
      }
      // Reset game state (this cleans up everything)
      resetGame();
      // Navigate to Home immediately (no game over UI shown)
      setLocation('/');
    } else {
      // Clear the flag for next time (normal navigation, not a refresh)
      sessionStorage.removeItem('navigated_to_play');
    }
  }
}, [location, state.screen, resetGame, setLocation, state.stats.hp]);
```

**Key Changes:**
1. Added HP check: `if (state.stats.hp <= 0)` before handling the refresh
2. Early return after redirecting to Home if HP is 0
3. Added `state.stats.hp` to the dependency array so the effect properly tracks HP changes

#### Files Modified

**`client/src/pages/Game.tsx`:**
- Enhanced refresh handler to check for HP <= 0
- Added early return when game over state is detected
- Added `state.stats.hp` to useEffect dependency array

#### Result
- ✅ Refreshing during game over prompt now redirects to Home
- ✅ Players can no longer continue playing with 0 HP after refresh
- ✅ Game state is properly reset when refresh is detected during game over
- ✅ Normal navigation (not refresh) continues to work correctly

#### Behavior Notes
- The check only applies when a page refresh is detected (no `navigated_to_play` flag in sessionStorage)
- If HP is 0 or less, the game is reset and player is redirected to Home immediately
- The game over UI is not shown during refresh - player goes directly to Home
- Normal game over flow (clicking "RETURN HOME" button) continues to work as before

#### Testing Notes
- Die in game to trigger game over prompt
- Refresh browser while prompt is displayed
- Verify player is redirected to Home screen (not back in game with 0 HP)
- Verify normal navigation to /play still works correctly
- Test refresh during normal gameplay (not game over) - should also redirect to Home
- Verify game state is properly reset after refresh during game over

---

### Scroll of Ending Boss Sector Advancement Fix

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/components/game/GameCanvas.tsx`

#### Overview
Fixed Scroll of Ending to correctly advance the player to the next boss sector instead of just incrementing the level by 1. Previously, using the scroll from Sector 2 would incorrectly send the player to Sector 3 instead of Sector 8 (the next boss sector).

#### Problem
The Scroll of Ending was supposed to teleport the player to the next boss sector, but it was only calling `onLevelComplete()`, which simply incremented the level by 1. This meant:
- From Sector 2, it would go to Sector 3 instead of Sector 8
- The scroll description said "Teleports you to the next boss sector" but didn't actually do that
- Players would waste a valuable scroll expecting to skip to a boss sector

#### Solution
Modified the Scroll of Ending handler to:
1. Calculate the next boss sector level (where `levelNum % BOSS_INTERVAL === 0 && levelNum > 0`)
2. Set the current level to one level before the target boss sector
3. Call `onLevelComplete()` to advance to the boss sector

This uses the same logic as the "skip boss" bonus selection option, ensuring consistent behavior.

#### Technical Implementation

**Files Modified:**

1. **`client/src/components/game/GameCanvas.tsx`**
   - Updated `scroll_ending` handler (lines 192-203)
   - Added loop to find next boss level starting from `currentLevel + 1`
   - Sets level to one before target, then completes to reach target
   - Uses `BOSS_INTERVAL` constant (8) to determine boss sectors

**Implementation:**
```typescript
} else if (type === 'scroll_ending') {
  // Advance to next boss sector
  let nextBossLevel = state.currentLevel;
  // Find the next boss level (must be greater than current level)
  while (true) {
    nextBossLevel++;
    const isBoss = nextBossLevel % BOSS_INTERVAL === 0 && nextBossLevel > 0;
    if (isBoss) break;
  }
  // Set to one level before target, then complete to reach target
  dispatch({ type: 'SET_CURRENT_LEVEL', payload: nextBossLevel - 1 });
  onLevelComplete();
}
```

#### Boss Sector Calculation
- Boss sectors occur every 8 levels: 8, 16, 24, 32, 40, 48, 56, 64, 72, 80...
- The loop increments from current level until it finds the next boss level
- Example: From Sector 2, it finds Sector 8 (next boss), sets level to 7, then completes to reach 8

#### Result
- ✅ Scroll of Ending now correctly advances to the next boss sector
- ✅ From Sector 2, player goes to Sector 8 (not Sector 3)
- ✅ Works correctly from any sector to find the next boss
- ✅ Uses same logic as "skip boss" bonus selection for consistency
- ✅ Scroll description now matches actual behavior

#### Behavior Notes
- The scroll finds the next boss sector that is greater than the current level
- If already on a boss sector, it advances to the next boss sector (e.g., Sector 8 → Sector 16)
- The level is set to one before the target, then `onLevelComplete()` advances it to the boss sector
- This ensures proper level completion flow and rewards

#### Testing Notes
- Use Scroll of Ending from Sector 2 - verify player goes to Sector 8
- Use Scroll of Ending from Sector 5 - verify player goes to Sector 8
- Use Scroll of Ending from Sector 8 - verify player goes to Sector 16
- Use Scroll of Ending from Sector 15 - verify player goes to Sector 16
- Verify scroll is consumed from inventory when used
- Confirm boss sector is properly loaded after scroll use

---

### Lightswitch Minimum Distance Placement Fix

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/lib/game/engine.ts`

#### Overview
Fixed lightswitch placement to ensure multiple lightswitches are never placed too close together. Previously, lightswitches could spawn adjacent to each other or very close together, which reduced their strategic value and made them feel redundant.

#### Problem
When multiple lightswitches spawned in a maze (up to 4), they could be placed:
- Adjacent to each other (1 tile apart)
- Very close together (2-3 tiles apart)
- This made them feel redundant and less valuable
- Players could activate multiple lightswitches almost simultaneously without exploring

#### Solution
Added minimum distance checking when placing lightswitches:
1. Define minimum Manhattan distance (5 tiles) between lightswitches
2. Check each candidate position against all already-placed lightswitches
3. Only place lightswitch if it's far enough from all existing ones
4. Continue until desired number of lightswitches are placed or no valid positions remain

#### Technical Implementation

**Files Modified:**

1. **`client/src/lib/game/engine.ts`**
   - Updated lightswitch placement logic (lines 593-610)
   - Added `MIN_DISTANCE` constant (5 tiles Manhattan distance)
   - Added distance checking loop before placing each lightswitch
   - Filters out positions that are too close to already-placed lightswitches

**Implementation:**
```typescript
// Spawn up to 4 lightswitches, ensuring they're not too close together
const numLightswitches = Math.min(4, validLightswitchPositions.length);
const shuffled = [...validLightswitchPositions].sort(() => Math.random() - 0.5);
const positionsToUse: Position[] = [];
const MIN_DISTANCE = 5; // Minimum Manhattan distance between lightswitches

for (const pos of shuffled) {
  // Check if this position is far enough from all already placed lightswitches
  const tooClose = positionsToUse.some(placed => {
    const distance = Math.abs(pos.x - placed.x) + Math.abs(pos.y - placed.y);
    return distance < MIN_DISTANCE;
  });
  
  if (!tooClose) {
    positionsToUse.push(pos);
    if (positionsToUse.length >= numLightswitches) break;
  }
}
```

#### Distance Calculation
- Uses Manhattan distance: `|x1 - x2| + |y1 - y2|`
- Minimum distance: 5 tiles
- Example: If a lightswitch is at (10, 10), another cannot be placed at (12, 13) because distance = |10-12| + |10-13| = 2 + 3 = 5 (exactly at minimum)
- A lightswitch at (10, 10) and another at (15, 10) would have distance = 5 (valid)

#### Result
- ✅ Lightswitches are now spaced at least 5 tiles apart
- ✅ Multiple lightswitches provide better strategic value
- ✅ Players must explore more to find and activate all lightswitches
- ✅ No more redundant adjacent lightswitches
- ✅ Placement algorithm still respects other constraints (not on start, exit, items, portals)

#### Behavior Notes
- Minimum distance is enforced using Manhattan distance (sum of horizontal and vertical differences)
- If not enough valid positions exist with minimum distance, fewer lightswitches will spawn
- The algorithm tries to place up to 4 lightswitches, but may place fewer if spacing requirements can't be met
- Other placement constraints still apply (not on start, exit, items, portals, at least 2 tiles from start)

#### Testing Notes
- Generate multiple levels and verify lightswitches are spaced at least 5 tiles apart
- Check levels with 2, 3, or 4 lightswitches - verify all meet minimum distance
- Verify lightswitches still don't spawn on invalid tiles (start, exit, items, portals)
- Test in small mazes - verify fewer lightswitches spawn if spacing can't be maintained
- Confirm lightswitch functionality still works correctly after placement fix

---

### Loot-sense and Threat-sense Spotlight Visibility Fix

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/components/game/GameCanvas.tsx`

#### Overview
Fixed Loot-sense and Threat-sense scroll effects to ensure entities and items are fully visible (no blur, no particles) when they enter the player's vision radius (spotlight). Also fixed Loot-sense to display proper item icons instead of colored rectangles.

#### Problem
When using Scroll of Loot-sense or Scroll of Threat-sense:
1. **Blur and particles persisted in spotlight**: Entities and items that were outside the vision radius would be drawn with blur and particle effects. When they entered the vision radius, the blur and particles would still be visible, making them hard to see clearly.
2. **Rarity color overlapping item icons**: In Loot-sense, items were being drawn as simple colored rectangles using the rarity color, which overlapped and obscured the actual item icons.

#### Solution
1. **Explicit blur clearing**: When entities/items are within the vision radius, explicitly set `ctx.filter = 'none'` and `ctx.globalAlpha = 1.0` to ensure full visibility.
2. **Particle removal**: Track entities/items that are in range and remove particles within `TILE_SIZE * 1.5` distance of their positions.
3. **Proper icon rendering**: Replace colored rectangles with proper item icon drawing functions (`drawWeaponIcon`, `drawArmorIcon`, `drawUtilityIcon`, `drawConsumableIcon`) for both blurred (outside range) and clear (in range) states.

#### Technical Implementation

**Files Modified:**

1. **`client/src/components/game/GameCanvas.tsx`**
   - Updated Threat-sense rendering (lines ~2802-2888)
   - Updated Loot-sense rendering (lines ~2904-2978)

**Threat-sense Implementation:**
- Added tracking array `entitiesInRange` to store positions of entities within vision radius
- When entity is outside range: Draw with blur (3px) and reduced opacity (0.6), add sparkling particles
- When entity is in range: 
  - Explicitly clear blur with `ctx.filter = 'none'`
  - Set full opacity with `ctx.globalAlpha = 1.0`
  - Wrap drawing in `ctx.save()`/`ctx.restore()` to isolate state
  - Track entity position for particle removal
- After drawing all entities, filter out particles near entities that are in range

**Loot-sense Implementation:**
- Added tracking array `itemsInRange` to store positions of items within vision radius
- When item is outside range: Draw icon with blur (3px) and reduced opacity (0.6), add sparkling particles
- When item is in range:
  - Explicitly clear blur with `ctx.filter = 'none'`
  - Set full opacity with `ctx.globalAlpha = 1.0`
  - Use proper icon drawing functions instead of colored rectangles
  - Track item position for particle removal
- After drawing all items, filter out particles near items that are in range

**Key Code Changes:**

```typescript
// Threat-sense: Entity in range
} else {
  // Entity is in range - ensure it's fully visible with no blur
  ctx.save();
  ctx.filter = 'none'; // Explicitly clear blur
  ctx.globalAlpha = 1.0; // Full opacity
  
  // ... draw entity ...
  
  ctx.restore();
  
  // Track this entity's position to remove nearby particles
  entitiesInRange.push({ x: entityScreenX, y: entityScreenY });
}

// Remove particles near entities that are now in range
if (levelRef.current && levelRef.current.particles && entitiesInRange.length > 0) {
  levelRef.current.particles = levelRef.current.particles.filter((p: any) => {
    if (p.id && p.id.startsWith('threatsense-sparkle-')) {
      for (const entityPos of entitiesInRange) {
        const dist = Math.sqrt(
          Math.pow(p.pos.x - entityPos.x, 2) + Math.pow(p.pos.y - entityPos.y, 2)
        );
        if (dist < TILE_SIZE * 1.5) {
          return false; // Remove particle
        }
      }
    }
    return true;
  });
}
```

```typescript
// Loot-sense: Item in range
} else {
  // Item is in range - ensure it's fully visible with no blur
  ctx.save();
  ctx.filter = 'none'; // Explicitly clear blur
  ctx.globalAlpha = 1.0; // Full opacity
  
  // Draw item icon using proper icon functions
  const itemSize = TILE_SIZE - 12;
  const offset = (TILE_SIZE - itemSize) / 2;
  const iconX = itemScreenX - TILE_SIZE / 2 + offset;
  const iconY = itemScreenY - TILE_SIZE / 2 + offset;
  
  if (item.type === 'weapon') {
    drawWeaponIcon(ctx, iconX, iconY, itemSize, item);
  } else if (item.type === 'armor') {
    drawArmorIcon(ctx, iconX, iconY, itemSize, item);
  } else if (item.type === 'utility') {
    drawUtilityIcon(ctx, iconX, iconY, itemSize, item);
  } else if (item.type === 'consumable') {
    drawConsumableIcon(ctx, iconX, iconY, itemSize, item);
  }
  
  ctx.restore();
  
  // Track this item's position to remove nearby particles
  itemsInRange.push({ x: itemScreenX, y: itemScreenY });
}
```

#### Result
- ✅ Entities and items are fully visible (no blur, full opacity) when in the spotlight
- ✅ Particles are automatically removed when entities/items enter the vision radius
- ✅ Loot-sense displays proper item icons (weapons, armor, utility, consumables) instead of colored rectangles
- ✅ Blur and particles still work correctly for entities/items outside the vision radius
- ✅ Visual clarity is maintained - players can clearly see what they're approaching

#### Behavior Notes
- Blur and particles are only applied to entities/items outside the vision radius
- When entities/items enter the vision radius, they immediately become fully visible
- Particle removal uses a distance threshold of `TILE_SIZE * 1.5` to catch particles near the entity/item
- Item icons use the same size and positioning as normal item rendering (`TILE_SIZE - 12` with proper centering)
- Canvas state is properly isolated using `save()`/`restore()` to prevent affecting other rendering

#### Testing Notes
- Activate Scroll of Threat-sense and verify enemies are blurred outside range but clear inside range
- Activate Scroll of Loot-sense and verify items show proper icons (not colored rectangles)
- Verify particles disappear when entities/items enter the vision radius
- Test with different item types (weapons, armor, utility, consumables) to ensure all icons render correctly
- Confirm blur and particles still work for entities/items outside the vision radius
- Test with varying vision radius sizes to ensure behavior is consistent

---

### Cerberus Mob Movement and Attack Fixes

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/lib/game/types.ts`
- `client/src/components/game/GameCanvas.tsx`

#### Overview
Fixed two critical issues with the Cerberus mob (Cerberus Firewall): improved triple-lunge collision detection to prevent phasing through walls, and enhanced tri-bite combo damage tracking to prevent duplicate hits.

#### Problem

##### Issue 1: Triple-Lunge Collision Detection
The Cerberus mob's triple-lunge ability (moving 3 tiles at once when a straight lane exists) only checked the final destination tile for collisions, not the intermediate tiles. This allowed the mob to phase through walls if the final position was valid but intermediate tiles contained walls.

##### Issue 2: Tri-Bite Combo Duplicate Damage
The tri-bite combo system could apply damage multiple times for the same bite count. The damage check relied on timing windows and combo count transitions, but didn't track which specific combo count had already dealt damage, leading to potential duplicate hits in edge cases.

#### Solution

##### Fix 1: Intermediate Tile Collision Checking
Added collision detection for all intermediate tiles (1, 2, and 3 tiles away) before executing the triple-lunge. If any intermediate tile is blocked, the mob falls back to normal single-tile movement instead of attempting the lunge.

##### Fix 2: Combo Damage Tracking
Added a new `lastDamageComboCount` property to the `Entity` interface to track which combo count has already dealt damage. This ensures each bite in the combo (1, 2, 3) can only deal damage once, even if timing checks would otherwise allow multiple hits.

#### Technical Implementation

##### Entity Interface Update
Added `lastDamageComboCount` property to track damage state:

```typescript
// client/src/lib/game/types.ts
export interface Entity {
  // ... existing properties ...
  biteComboCount?: number;   // For cerberus tri-bite
  lastBiteTime?: number;    // For cerberus combo timing
  lastDamageComboCount?: number; // For cerberus - tracks which combo count has already dealt damage
  // ... other properties ...
}
```

##### Triple-Lunge Collision Fix
Enhanced the triple-lunge logic to check intermediate tiles:

```typescript
if (hasStraightLane && distToPlayer > 1.5) {
  // Triple-lunge (restricted to cardinal)
  const dir = restrictToCardinal(dx, dy);
  // Check each intermediate tile for collisions
  let canLunge = true;
  if (levelRef.current) {
    for (let i = 1; i <= 3; i++) {
      const checkPos = {
        x: entity.pos.x + dir.x * i,
        y: entity.pos.y + dir.y * i,
      };
      if (checkCollision(checkPos, levelRef.current)) {
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
}
```

##### Combo Damage Tracking Fix
Updated damage application logic to prevent duplicates:

```typescript
// Special handling for Cerberus tri-bite combo
if (mobSubtype === 'cerberus') {
  const biteComboCount = updatedEntity.biteComboCount || 0;
  const lastBite = updatedEntity.lastBiteTime || 0;
  const timeSinceLastBite = now - lastBite;
  const lastDamageComboCount = updatedEntity.lastDamageComboCount || 0;
  
  // Apply damage when combo count changes and timing is right
  // Track which combo count has already dealt damage to prevent duplicates
  let shouldDamage = false;
  if (biteComboCount === 1 && biteComboCount > lastDamageComboCount && timeSinceLastBite < 100) {
    // First bite - immediate (within 100ms of combo start)
    shouldDamage = true;
  } else if (biteComboCount === 2 && biteComboCount > lastDamageComboCount && timeSinceLastBite >= 200 && timeSinceLastBite < 300) {
    // Second bite - around 200ms
    shouldDamage = true;
  } else if (biteComboCount === 3 && biteComboCount > lastDamageComboCount && timeSinceLastBite >= 400 && timeSinceLastBite < 500) {
    // Third bite - around 400ms
    shouldDamage = true;
  }
  
  // Also check if we just transitioned to a new combo count (fallback)
  const prevBiteComboCount = entity.biteComboCount || 0;
  if (biteComboCount > prevBiteComboCount && biteComboCount > lastDamageComboCount) {
    shouldDamage = true;
  }
  
  if (shouldDamage) {
    // ... damage application ...
    // Mark this combo count as having dealt damage
    updatedEntity.lastDamageComboCount = biteComboCount;
    // ... rest of damage logic ...
  }
}
```

##### Combo Reset Logic
Updated all combo reset points to also reset damage tracking:

```typescript
// Reset damage tracking when combo resets
if (biteComboCount === 0 && timeSinceLastBite >= cooldown) {
  updatedEntity.biteComboCount = 1;
  updatedEntity.lastBiteTime = now;
  updatedEntity.lastDamageComboCount = 0; // Reset damage tracking for new combo
}
// ... similar updates for all reset conditions ...
```

#### Result
- ✅ Triple-lunge now properly validates all intermediate tiles before moving
- ✅ Cerberus mob cannot phase through walls during triple-lunge
- ✅ Tri-bite combo prevents duplicate damage hits
- ✅ Each bite (1, 2, 3) can only deal damage once per combo cycle
- ✅ Combo damage tracking resets properly when combo completes or times out
- ✅ Fallback to normal movement when lunge path is blocked maintains intended behavior

#### Behavior Notes
- The triple-lunge checks tiles at positions 1, 2, and 3 tiles away in the movement direction
- If any intermediate tile is blocked, the mob automatically falls back to single-tile movement
- Damage tracking uses the combo count (1, 2, 3) as the identifier for which bite has dealt damage
- The `lastDamageComboCount` is reset to 0 when starting a new combo, completing a combo, or resetting due to timeout/distance
- The existing 100ms damage cooldown still applies as an additional safeguard

#### Testing Notes
- Verify Cerberus cannot phase through walls during triple-lunge
- Test triple-lunge with walls at positions 1, 2, and 3 tiles away
- Confirm fallback to normal movement when lunge path is blocked
- Verify tri-bite combo deals exactly 3 hits per combo cycle (no duplicates)
- Test combo reset behavior when player moves out of range
- Confirm damage tracking resets properly between combo cycles
- Test edge cases where combo count advances quickly in a single frame

---

### Input Direction Reset on Sector Load Fix

**Type**: Bug Fix  
**Files Modified**: 
- `client/src/pages/Game.tsx`

#### Overview
Fixed an issue where the player would occasionally start moving automatically when a new sector loads, even without any user input. This was caused by input direction state persisting from the previous level.

#### Problem
When a new sector loads, the `inputDir` state in `Game.tsx` was not being reset. This meant:
- If a movement key was still being held during the level transition, the direction persisted
- If touch controls were active when the level completed, the input state carried over
- The player would immediately start moving in the new sector without any user input
- This created a jarring experience where players would unexpectedly move upon entering a new level

#### Solution
Added a `useEffect` hook that resets the input direction to `{ x: 0, y: 0 }` whenever:
1. A new level starts (`state.currentLevel` changes)
2. The screen changes to `'run'` (entering gameplay)

This ensures the player always starts stationary when entering a new sector, regardless of any lingering input state from the previous level.

#### Technical Implementation

**Files Modified:**

1. **`client/src/pages/Game.tsx`**
   - Added `useEffect` hook (after line 351) to reset input direction on level load
   - Resets `inputDir` state to `{ x: 0, y: 0 }` when entering a new level
   - Triggers on `state.currentLevel` and `state.screen` changes

**Implementation:**
```typescript
// Reset input direction when a new level loads to prevent unwanted movement
useEffect(() => {
  if (state.screen === 'run') {
    setInputDir({ x: 0, y: 0 });
  }
}, [state.currentLevel, state.screen]);
```

#### Result
- ✅ Player always starts stationary when entering a new sector
- ✅ Input direction is properly reset regardless of previous input state
- ✅ No unwanted movement occurs when transitioning between sectors
- ✅ Works for both keyboard and touch control inputs
- ✅ Minimal impact - only resets input when entering a new level

#### Behavior Notes
- The reset only occurs when the screen is `'run'` to avoid interfering with other screens
- The effect triggers on both `state.currentLevel` and `state.screen` changes to catch all level transition scenarios
- This fix ensures a clean slate for player input at the start of each new sector

#### Testing Notes
- Complete a sector while holding a movement key - verify player doesn't move in new sector
- Complete a sector with touch controls active - verify player starts stationary
- Test with keyboard controls (WASD/Arrow keys)
- Test with mobile touch controls (joystick, d-pad, touchpad)
- Verify normal movement still works correctly during gameplay
- Test rapid level transitions to ensure reset works consistently

---

## Suggestions / Roadmap

### Potential Enhancements

#### Visual Improvements
- Consider applying similar color filtering to other game assets (items, enemies, etc.)
- Add transition effects when theme colors change between sectors
- Allow players to preview theme colors in the UI
- Add visual indicators when projectiles phase through walls

#### Gameplay Enhancements
- Consider different phase chance formulas for different enemy tiers
- Explore additional projectile mechanics and interactions

#### Technical Notes
- The color filtering uses the theme's `floor` color as the base tint
- The `color` blend mode is well-supported in modern browsers
- Canvas state is properly managed to avoid affecting other drawing operations
- Wall phasing uses independent random rolls per wall encounter
- Phase chance scaling ensures higher-level enemies are more dangerous
