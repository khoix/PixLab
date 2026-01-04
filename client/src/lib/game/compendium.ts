import { MobSubtype, Item } from './types';
import { COLORS } from './constants';
import {
  getOperatorBasePath,
  getOperatorHandPath,
  getWeaponImagePath,
  getArmorImagePath,
  getUtilityImagePath,
  getWeaponSubtype,
  getArmorSubtype,
  getUtilitySubtype,
  getMobImagePath,
  getGauntletsImagePath,
  getGauntletsSleeveImagePath,
} from './compendium-image-map';

export interface MobCardData {
  subtype: MobSubtype;
  name: string;
  imageGenerator: (canvas: HTMLCanvasElement) => void | Promise<void>; // Can be async
  combatDescription: string;
  mythology: string;
}

// Hi-res rendering size
const COMPENDIUM_SIZE = 320;

// Image cache to avoid reloading
const imageCache = new Map<string, HTMLImageElement>();

// Load image with caching
function loadImage(path: string, silent: boolean = false): Promise<HTMLImageElement | null> {
  if (!path) return Promise.resolve(null);
  
  // Check cache first
  if (imageCache.has(path)) {
    return Promise.resolve(imageCache.get(path)!);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(path, img);
      resolve(img);
    };
    img.onerror = () => {
      // Only log if not silent (for optional images like items)
      if (!silent) {
        console.warn(`Failed to load image: ${path}`);
      }
      resolve(null);
    };
    // Add cache busting for development (remove in production if needed)
    const cacheBuster = process.env.NODE_ENV === 'development' ? `?t=${Date.now()}` : '';
    img.src = path + cacheBuster;
  });
}

// Render operator with gear using image composition
export async function renderOperatorWithGear(
  canvas: HTMLCanvasElement,
  loadout: { weapon: Item | null; armor: Item | null; utility: Item | null }
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  // Clear canvas with black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  // Get image paths
  const operatorPath = getOperatorBasePath();
  const handPath = getOperatorHandPath();
  const weaponSubtype = getWeaponSubtype(loadout.weapon);
  const armorSubtype = getArmorSubtype(loadout.armor);
  const utilitySubtype = getUtilitySubtype(loadout.utility);
  const weaponPath = getWeaponImagePath(weaponSubtype);
  const armorPath = getArmorImagePath(armorSubtype);
  const utilityPath = getUtilityImagePath(utilitySubtype);
  
  // Check if gauntlets are equipped (special handling with separate sleeve layer)
  const hasGauntlets = armorSubtype === 'gauntlets';
  const gauntletsPath = hasGauntlets ? getGauntletsImagePath() : '';
  const gauntletsSleevePath = hasGauntlets ? getGauntletsSleeveImagePath() : '';

  // Load all images
  // Operator base and hand are required, others are optional (silent failures)
  const [
    operatorImg,
    handImg,
    weaponImg,
    armorImg,
    utilityImg,
    gauntletsImg,
    gauntletsSleeveImg,
  ] = await Promise.all([
    loadImage(operatorPath, false), // Log errors for base operator
    loadImage(handPath, false), // Log errors for hand
    loadImage(weaponPath, true), // Silent for optional items
    loadImage(armorPath, true), // Silent for optional items
    loadImage(utilityPath, true), // Silent for optional items
    loadImage(gauntletsPath, true), // Silent for optional items
    loadImage(gauntletsSleevePath, true), // Silent for optional items
  ]);

  // Draw in order (bottom to top):
  // 1. Operator base (bottom layer)
  // 2. Armor (above operator, below gauntlets sleeve)
  // 3. Gauntlets sleeve (above armor, below weapon) - only if gauntlets equipped
  // 4. Weapon (above gauntlets sleeve, below hand)
  // 5. Hand (above weapon, overlays weapon grip)
  // 6. Gauntlets (above hand) - only if gauntlets equipped
  // 7. Utility (top layer)
  
  // Layer 1: Operator base (bottom)
  if (operatorImg) {
    ctx.drawImage(operatorImg, 0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
  } else {
    // Fallback: draw a simple placeholder if operator image is missing
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
    ctx.fillStyle = '#666666';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OPERATOR', COMPENDIUM_SIZE / 2, COMPENDIUM_SIZE / 2);
  }

  // Layer 2: Armor (above operator base, below gauntlets sleeve)
  // Only draw if not gauntlets (gauntlets have separate handling)
  if (armorImg && !hasGauntlets) {
    ctx.drawImage(armorImg, 0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
  }

  // Layer 3: Gauntlets sleeve (above armor, below weapon)
  // This goes under weapons but over operator-hand
  if (gauntletsSleeveImg && hasGauntlets) {
    ctx.drawImage(gauntletsSleeveImg, 0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
  }

  // Layer 4: Weapon (above gauntlets sleeve)
  // Weapon image should only cover the weapon area, not the entire character body
  // Only draw weapon if one is actually equipped
  if (weaponImg && loadout.weapon) {
    ctx.drawImage(weaponImg, 0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
  }

  // Layer 5: Hand (overlays weapon grip, only if weapon is equipped)
  // Only draw hand if weapon is actually equipped
  if (handImg && weaponImg && loadout.weapon) {
    ctx.drawImage(handImg, 0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
  }

  // Layer 6: Gauntlets (above hand)
  // This goes over operator-hand.png
  if (gauntletsImg && hasGauntlets) {
    ctx.drawImage(gauntletsImg, 0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
  }

  // Layer 7: Utility (top layer)
  if (utilityImg) {
    ctx.drawImage(utilityImg, 0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
  }
}

// Legacy function for backwards compatibility (now uses image composition)
export function renderPlayerHiRes(
  canvas: HTMLCanvasElement,
  loadout: { weapon: Item | null; armor: Item | null; utility: Item | null }
): void {
  renderOperatorWithGear(canvas, loadout).catch(err => {
    console.error('Failed to render operator with gear:', err);
  });
}

// Render mob using image if available, fallback to canvas
async function renderMobWithImage(
  canvas: HTMLCanvasElement,
  subtype: MobSubtype,
  fallbackRenderer: (canvas: HTMLCanvasElement) => void
): Promise<void> {
  const imagePath = getMobImagePath(subtype);
  const img = await loadImage(imagePath, true); // Silent - mob images are optional
  
  if (img) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = COMPENDIUM_SIZE;
    canvas.height = COMPENDIUM_SIZE;
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
    ctx.drawImage(img, 0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);
  } else {
    // Fallback to canvas rendering
    fallbackRenderer(canvas);
  }
}

// Wrapper to make mob renderers async and try image first
function createMobRenderer(
  subtype: MobSubtype,
  fallbackRenderer: (canvas: HTMLCanvasElement) => void
): (canvas: HTMLCanvasElement) => Promise<void> {
  return async (canvas: HTMLCanvasElement) => {
    await renderMobWithImage(canvas, subtype, fallbackRenderer);
  };
}

// Get the canvas fallback renderer for a mob subtype (for preview cards)
export function getMobPreviewRenderer(subtype: MobSubtype): (canvas: HTMLCanvasElement) => void {
  switch (subtype) {
    case 'drone': return renderMobDrone;
    case 'sniper': return renderMobSniper;
    case 'phase': return renderMobPhase;
    case 'charger': return renderMobCharger;
    case 'turret': return renderMobTurret;
    case 'swarm': return renderMobSwarm;
    case 'guardian': return renderMobGuardian;
    case 'moth': return renderMobMoth;
    case 'tracker': return renderMobTracker;
    case 'cerberus': return renderMobCerberus;
    case 'boss_zeus': return renderBossZeus;
    case 'boss_hades': return renderBossHades;
    case 'boss_ares': return renderBossAres;
    default: return renderMobDrone; // Fallback
  }
}

// Load and render only the uploaded image (for detail view)
export async function renderMobImageOnly(
  canvas: HTMLCanvasElement,
  subtype: MobSubtype
): Promise<boolean> {
  const imagePath = getMobImagePath(subtype);
  console.log(`[renderMobImageOnly] Attempting to load image for ${subtype} at path: ${imagePath}`);
  
  const img = await loadImage(imagePath, false); // Log errors to debug
  
  console.log(`[renderMobImageOnly] Image load result for ${subtype}:`, img ? `loaded (${img.width}x${img.height})` : 'null');
  
  if (img) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[renderMobImageOnly] Failed to get canvas context for mob image');
      return false;
    }
    
    // Don't constrain aspect ratio - use image's natural dimensions
    canvas.width = img.width;
    canvas.height = img.height;
    
    ctx.drawImage(img, 0, 0);
    console.log(`[renderMobImageOnly] Successfully rendered mob image for ${subtype}: ${img.width}x${img.height}`);
    return true;
  }
  
  console.warn(`[renderMobImageOnly] No image found for mob subtype: ${subtype} at path: ${imagePath}`);
  return false;
}

// Mob image generators (fallback canvas rendering)
function renderMobDrone(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.7;

  // Main body with glow
  ctx.fillStyle = COLORS.mob_drone;
  ctx.shadowColor = COLORS.mob_drone;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Inner darker circle for depth
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Pronounced yellow eye (smaller so pink is visible)
  const eyeSize = size / 4.5; // Smaller to show pink body
  ctx.fillStyle = '#FFD700'; // Bright yellow
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(centerX, centerY, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  
  // Eye highlight/glow
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFF00'; // Brighter yellow for highlight
  ctx.beginPath();
  ctx.arc(centerX - eyeSize / 4, centerY - eyeSize / 4, eyeSize / 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Eye pupil
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(centerX, centerY, eyeSize / 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function renderMobSniper(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.6;

  // Apollo Sniper: Diamond shape with reticle
  ctx.fillStyle = COLORS.mob_sniper;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - size / 2);
  ctx.lineTo(centerX + size / 2, centerY);
  ctx.lineTo(centerX, centerY + size / 2);
  ctx.lineTo(centerX - size / 2, centerY);
  ctx.closePath();
  ctx.fill();
  
  // Reticle (crosshair) in center with detail
  const reticleSize = size * 0.35;
  const reticleThickness = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = reticleThickness;
  
  // Two concentric circles
  ctx.beginPath();
  ctx.arc(centerX, centerY, reticleSize * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, reticleSize * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  
  // Horizontal line with tick marks
  ctx.beginPath();
  ctx.moveTo(centerX - reticleSize / 2, centerY);
  ctx.lineTo(centerX + reticleSize / 2, centerY);
  ctx.stroke();
  // Top tick marks
  const tickLength = 4;
  ctx.beginPath();
  ctx.moveTo(centerX - reticleSize * 0.4, centerY - tickLength);
  ctx.lineTo(centerX - reticleSize * 0.4, centerY + tickLength);
  ctx.moveTo(centerX + reticleSize * 0.4, centerY - tickLength);
  ctx.lineTo(centerX + reticleSize * 0.4, centerY + tickLength);
  ctx.stroke();
  
  // Vertical line with tick marks
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - reticleSize / 2);
  ctx.lineTo(centerX, centerY + reticleSize / 2);
  ctx.stroke();
  // Side tick marks
  ctx.beginPath();
  ctx.moveTo(centerX - tickLength, centerY - reticleSize * 0.4);
  ctx.lineTo(centerX + tickLength, centerY - reticleSize * 0.4);
  ctx.moveTo(centerX - tickLength, centerY + reticleSize * 0.4);
  ctx.lineTo(centerX + tickLength, centerY + reticleSize * 0.4);
  ctx.stroke();
  
  // Center dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, reticleThickness, 0, Math.PI * 2);
  ctx.fill();
}

function renderMobPhase(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.65;

  // Wispy, ethereal body - elongated oval shape (ghost/wraith)
  ctx.save();
  ctx.globalAlpha = 0.7; // Semi-transparent ghostly effect
  ctx.fillStyle = COLORS.mob_phase;
  ctx.shadowColor = COLORS.mob_phase;
  ctx.shadowBlur = 25;
  
  // Main body - elongated oval (wraith shape)
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, size / 2.2, size / 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Wispy tail/body extension
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + size / 3, size / 3, size / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;
  ctx.restore();
  
  // Inner glow for ethereal effect
  ctx.fillStyle = 'rgba(157, 78, 221, 0.4)'; // Lighter purple
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, size / 3, size / 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Small, bright eyes (bigger for compendium)
  const eyeSize = 6; // Increased from 4
  const eyeY = centerY - size / 4;
  const eyeSpacing = size / 4;
  
  // Left eye - bright cyan
  ctx.fillStyle = '#00FFFF'; // Bright cyan
  ctx.shadowColor = '#00FFFF';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(centerX - eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  
  // Right eye - bright cyan
  ctx.beginPath();
  ctx.arc(centerX + eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  
  // Eye pupils
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(centerX - eyeSpacing, eyeY, eyeSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centerX + eyeSpacing, eyeY, eyeSize / 2, 0, Math.PI * 2);
  ctx.fill();
}

function renderMobCharger(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.7;

  // Octagon shape
  ctx.fillStyle = COLORS.mob_charger;
  ctx.beginPath();
  const octagonRadius = size / 2;
  const numSides = 8;
  for (let i = 0; i < numSides; i++) {
    const angle = (i / numSides) * Math.PI * 2 - Math.PI / 2; // Start from top
    const x = centerX + Math.cos(angle) * octagonRadius;
    const y = centerY + Math.sin(angle) * octagonRadius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  
  // Glow
  ctx.shadowColor = COLORS.mob_charger;
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ff4d5c';
  ctx.beginPath();
  const innerRadius = octagonRadius * 0.7;
  for (let i = 0; i < numSides; i++) {
    const angle = (i / numSides) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * innerRadius;
    const y = centerY + Math.sin(angle) * innerRadius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // White triangles for horns on either side
  const hornSize = size * 0.25;
  const hornOffset = size * 0.4;
  // Left horn
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(centerX - hornOffset, centerY - size * 0.15);
  ctx.lineTo(centerX - hornOffset - hornSize * 0.5, centerY - size * 0.35);
  ctx.lineTo(centerX - hornOffset + hornSize * 0.5, centerY - size * 0.35);
  ctx.closePath();
  ctx.fill();
  // Right horn
  ctx.beginPath();
  ctx.moveTo(centerX + hornOffset, centerY - size * 0.15);
  ctx.lineTo(centerX + hornOffset - hornSize * 0.5, centerY - size * 0.35);
  ctx.lineTo(centerX + hornOffset + hornSize * 0.5, centerY - size * 0.35);
  ctx.closePath();
  ctx.fill();
  
  // Yellow half hollow circle for bull's nose ring in the middle
  const noseRingRadius = size * 0.1; // Smaller
  const noseRingThickness = 5; // Thicker
  ctx.strokeStyle = '#FFD700'; // Yellow
  ctx.lineWidth = noseRingThickness;
  ctx.beginPath();
  ctx.arc(centerX, centerY + size * 0.1, noseRingRadius, 0, Math.PI);
  ctx.stroke();
}

function renderMobTurret(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const baseSize = COMPENDIUM_SIZE * 0.5;
  const turretSize = COMPENDIUM_SIZE * 0.4;

  // Base
  ctx.fillStyle = COLORS.mob_turret;
  ctx.fillRect(centerX - baseSize / 2, centerY + baseSize / 4, baseSize, baseSize / 2);
  
  // Turret top
  ctx.fillStyle = '#0d8f6a';
  ctx.fillRect(centerX - turretSize / 2, centerY - turretSize / 2, turretSize, turretSize);
  
  // Glow
  ctx.shadowColor = COLORS.mob_turret;
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#0d8f6a';
  ctx.fillRect(centerX - turretSize / 2 + 8, centerY - turretSize / 2 + 8, turretSize - 16, turretSize - 16);
  ctx.shadowBlur = 0;

  // Gun barrel pointing left - shorter and same color as turret
  const barrelLength = COMPENDIUM_SIZE * 0.22; // Shorter
  const barrelWidth = COMPENDIUM_SIZE * 0.18;
  const barrelX = centerX - turretSize / 2 - barrelLength;
  const barrelY = centerY - barrelWidth / 2;
  
  // Main barrel body (same color as turret)
  ctx.fillStyle = '#0d8f6a';
  ctx.fillRect(barrelX, barrelY, barrelLength, barrelWidth);
  
  // Barrel outline
  ctx.strokeStyle = '#0d8f6a';
  ctx.lineWidth = 2;
  ctx.strokeRect(barrelX, barrelY, barrelLength, barrelWidth);
  
  // Barrel tip (slightly darker turret color)
  ctx.fillStyle = '#0a6b52';
  ctx.fillRect(barrelX, barrelY, barrelLength * 0.2, barrelWidth);
  
  // Barrel connection to turret
  ctx.fillStyle = '#0d8f6a';
  ctx.fillRect(centerX - turretSize / 2 - 4, centerY - barrelWidth / 3, 4, barrelWidth * 0.67);
  
  // Barrel details (rings)
  ctx.strokeStyle = '#0a6b52';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 2; i++) {
    const ringX = barrelX + (barrelLength * 0.5 * i);
    ctx.beginPath();
    ctx.moveTo(ringX, barrelY);
    ctx.lineTo(ringX, barrelY + barrelWidth);
    ctx.stroke();
  }
}

function renderMobSwarm(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const minionSize = COMPENDIUM_SIZE * 0.22; // Increased from 0.15 to make minions bigger

  // Render multiple small minions
  const positions = [
    { x: centerX - 40, y: centerY - 40 },
    { x: centerX + 40, y: centerY - 40 },
    { x: centerX - 40, y: centerY + 40 },
    { x: centerX + 40, y: centerY + 40 },
    { x: centerX, y: centerY - 60 },
    { x: centerX, y: centerY + 60 },
    { x: centerX - 60, y: centerY },
    { x: centerX + 60, y: centerY },
  ];

  positions.forEach(pos => {
    ctx.fillStyle = COLORS.mob_swarm;
    ctx.fillRect(pos.x - minionSize / 2, pos.y - minionSize / 2, minionSize, minionSize);
    ctx.shadowColor = COLORS.mob_swarm;
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd633';
    ctx.fillRect(pos.x - minionSize / 2 + 2, pos.y - minionSize / 2 + 2, minionSize - 4, minionSize - 4);
    ctx.shadowBlur = 0;
    
    // Black dots for eyes (larger)
    const eyeSize = 4;
    ctx.fillStyle = '#000000';
    ctx.fillRect(pos.x - minionSize / 4 - eyeSize / 2, pos.y - minionSize / 4 - eyeSize / 2, eyeSize, eyeSize);
    ctx.fillRect(pos.x + minionSize / 4 - eyeSize / 2, pos.y - minionSize / 4 - eyeSize / 2, eyeSize, eyeSize);
  });
}

function renderMobGuardian(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.75;

  // Helmet shape (rounded top, wider bottom)
  ctx.fillStyle = COLORS.mob_guardian;
  ctx.shadowColor = COLORS.mob_guardian;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  // Top curve (helmet dome)
  ctx.arc(centerX, centerY - size * 0.15, size * 0.35, Math.PI, 0, false);
  // Sides
  ctx.lineTo(centerX + size * 0.4, centerY + size * 0.35);
  // Bottom curve
  ctx.arc(centerX, centerY + size * 0.35, size * 0.4, 0, Math.PI, true);
  // Other side
  ctx.lineTo(centerX - size * 0.4, centerY - size * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Glowing eye space (horizontal slit)
  const eyeSlitWidth = size * 0.5;
  const eyeSlitHeight = size * 0.12;
  const eyeSlitY = centerY - size * 0.05;
  
  // Eye glow
  ctx.fillStyle = '#00FFFF'; // Bright cyan glow
  ctx.shadowColor = '#00FFFF';
  ctx.shadowBlur = 20;
  ctx.fillRect(
    centerX - eyeSlitWidth / 2,
    eyeSlitY - eyeSlitHeight / 2,
    eyeSlitWidth,
    eyeSlitHeight
  );
  ctx.shadowBlur = 0;
  
  // Eye slit outline
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    centerX - eyeSlitWidth / 2,
    eyeSlitY - eyeSlitHeight / 2,
    eyeSlitWidth,
    eyeSlitHeight
  );
}

function renderBossZeus(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.8;

  // Main body
  ctx.fillStyle = COLORS.boss_zeus;
  ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);
  
  // Electric glow
  ctx.shadowColor = COLORS.boss_zeus;
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#33ffff';
  ctx.fillRect(centerX - size / 2 + 12, centerY - size / 2 + 12, size - 24, size - 24);
  ctx.shadowBlur = 0;

  // Lightning bolts
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * (size / 2);
    const y = centerY + Math.sin(angle) * (size / 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}

function renderBossHades(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.8;

  // Main body
  ctx.fillStyle = COLORS.boss_hades;
  ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);
  
  // Dark glow
  ctx.shadowColor = COLORS.boss_hades;
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#c77ef0';
  ctx.fillRect(centerX - size / 2 + 12, centerY - size / 2 + 12, size - 24, size - 24);
  ctx.shadowBlur = 0;

  // Phase effect (more intense)
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * (size / 2 - 15);
    const y = centerY + Math.sin(angle) * (size / 2 - 15);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderBossAres(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.8;

  // Main body
  ctx.fillStyle = COLORS.boss_ares;
  ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);
  
  // Intense glow
  ctx.shadowColor = COLORS.boss_ares;
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#ff4d5c';
  ctx.fillRect(centerX - size / 2 + 12, centerY - size / 2 + 12, size - 24, size - 24);
  ctx.shadowBlur = 0;

  // Aggressive spikes
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const x1 = centerX + Math.cos(angle) * (size / 2 - 10);
    const y1 = centerY + Math.sin(angle) * (size / 2 - 10);
    const x2 = centerX + Math.cos(angle) * (size / 2 + 10);
    const y2 = centerY + Math.sin(angle) * (size / 2 + 10);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

function renderMobMoth(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.4;

  // Main body - Abyssal Indigo
  ctx.fillStyle = COLORS.mob_moth;
  ctx.shadowColor = COLORS.mob_moth;
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Inner glow
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#2d1a5a';
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Wing details
  ctx.strokeStyle = '#3d2a6a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX - size / 2, centerY, size / 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX + size / 2, centerY, size / 3, 0, Math.PI * 2);
  ctx.stroke();
}

function renderMobTracker(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.6;

  // Main body - Lunar Neon, angular shape
  ctx.fillStyle = COLORS.mob_tracker;
  ctx.shadowColor = COLORS.mob_tracker;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  // Angular/predator shape
  ctx.moveTo(centerX, centerY - size / 2);
  ctx.lineTo(centerX + size / 2, centerY);
  ctx.lineTo(centerX, centerY + size / 2);
  ctx.lineTo(centerX - size / 3, centerY + size / 4);
  ctx.lineTo(centerX - size / 2, centerY);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Eye/optic detail
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX + size / 6, centerY - size / 6, size / 8, 0, Math.PI * 2);
  ctx.fill();
}

function renderMobCerberus(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = COMPENDIUM_SIZE;
  canvas.height = COMPENDIUM_SIZE;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPENDIUM_SIZE, COMPENDIUM_SIZE);

  const centerX = COMPENDIUM_SIZE / 2;
  const centerY = COMPENDIUM_SIZE / 2;
  const size = COMPENDIUM_SIZE * 0.7;
  const headSize = size / 3;

  // Main body - Brimstone Vermillion
  ctx.fillStyle = COLORS.mob_cerberus;
  ctx.fillRect(centerX - size / 2, centerY, size, size / 2);
  
  // Glow
  ctx.shadowColor = COLORS.mob_cerberus;
  ctx.shadowBlur = 20;
  
  // Three heads
  // Left head
  ctx.fillStyle = COLORS.mob_cerberus;
  ctx.beginPath();
  ctx.arc(centerX - size / 3, centerY, headSize / 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Center head
  ctx.beginPath();
  ctx.arc(centerX, centerY, headSize / 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Right head
  ctx.beginPath();
  ctx.arc(centerX + size / 3, centerY, headSize / 2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.shadowBlur = 0;

  // Eyes on each head
  ctx.fillStyle = '#ffffff';
  [centerX - size / 3, centerX, centerX + size / 3].forEach(headX => {
    ctx.beginPath();
    ctx.arc(headX - headSize / 6, centerY - headSize / 6, headSize / 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headX + headSize / 6, centerY - headSize / 6, headSize / 8, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Mob card data with placeholder content
export const MOB_CARD_DATA: MobCardData[] = [
  {
    subtype: 'drone',
    name: 'Hermes Drone',
    imageGenerator: createMobRenderer('drone', renderMobDrone),
    combatDescription: 'Swift as the messenger god himself, these drones dart across the battlefield with relentless speed. They strike quickly but fall just as fast, making them the most common threat you\'ll face. Beware their numbers, for where one falls, three more take its place.',
    mythology: 'Named after Hermes, the swift messenger of the gods, these drones embody speed and agility. In the digital realm, they carry the whispers of the network, moving faster than thought itself. Some say they are fragments of the original Hermes protocol, corrupted by the labyrinth\'s chaos.',
  },
  {
    subtype: 'sniper',
    name: 'Apollo Sniper',
    imageGenerator: createMobRenderer('sniper', renderMobSniper),
    combatDescription: 'From the shadows they strike, these patient hunters wait for the perfect moment. Their shots ring true like Apollo\'s arrows, dealing devastating damage from afar. Move quickly, for they are slow to reposition but deadly when they find their mark.',
    mythology: 'Apollo, god of archery and prophecy, lends his name to these precise killers. They see all from their vantage points, calculating trajectories with divine accuracy. Legends speak of snipers who never miss, their aim guided by the god\'s own hand.',
  },
  {
    subtype: 'phase',
    name: 'Hades Phase',
    imageGenerator: createMobRenderer('phase', renderMobPhase),
    combatDescription: 'They slip through walls like shadows, these phantoms of the underworld. Their attacks are weak, but their ability to phase through barriers makes them unpredictable. Never trust a wall to protect you from their ethereal touch.',
    mythology: 'Hades, ruler of the underworld, grants these entities the power to move between realms. They exist in the space between matter, neither fully here nor there. Some believe they are the souls of fallen operators, trapped between life and deletion.',
  },
  {
    subtype: 'charger',
    name: 'Ares Charger',
    imageGenerator: createMobRenderer('charger', renderMobCharger),
    combatDescription: 'War incarnate, these chargers rush into battle with reckless abandon. They move faster than thought, closing the distance before you can react. Their charge is devastating, but predictable - use their momentum against them.',
    mythology: 'Ares, god of war, fills these machines with bloodlust and fury. They know only forward, only attack, only victory through overwhelming force. In the heat of battle, they become extensions of the war god\'s will, unstoppable until destroyed.',
  },
  {
    subtype: 'turret',
    name: 'Hephaestus Turret',
    imageGenerator: createMobRenderer('turret', renderMobTurret),
    combatDescription: 'Forged in digital fire, these stationary sentinels guard key positions with unwavering vigilance. They cannot move, but their range and power make them deadly from any distance. Approach carefully, for they see all in their domain.',
    mythology: 'Hephaestus, the smith god, crafted these mechanical guardians. Each turret is a masterpiece of engineering, built to last eternally. They are the walls of the labyrinth, the unyielding guardians that test every operator\'s resolve.',
  },
  {
    subtype: 'swarm',
    name: 'Minion Swarm',
    imageGenerator: createMobRenderer('swarm', renderMobSwarm),
    combatDescription: 'Individually weak, but overwhelming in numbers, these swarms move as one. They strike fast and often, their combined attacks wearing down even the strongest defenses. Alone they are nothing, together they are everything.',
    mythology: 'The nameless minions of the labyrinth, these swarms have no god to call their own. They are the forgotten, the discarded, the fragments of code that found purpose in unity. Some say they are the echoes of every operator who fell before you.',
  },
  {
    subtype: 'guardian',
    name: 'Athena Guardian',
    imageGenerator: createMobRenderer('guardian', renderMobGuardian),
    combatDescription: 'Wisdom and strength combined, these guardians stand as immovable walls. They move slowly but hit hard, their defenses nearly impenetrable. Patience and strategy are your only weapons against these tactical titans.',
    mythology: 'Athena, goddess of wisdom and warfare, grants these guardians her strategic mind. They are the tacticians of the labyrinth, calculating every move, defending every position. To defeat one is to prove your worth as a true operator.',
  },
  {
    subtype: 'boss_zeus',
    name: 'Zeus Mainframe',
    imageGenerator: createMobRenderer('boss_zeus', renderBossZeus),
    combatDescription: 'The king of the digital gods, Zeus commands lightning and thunder from afar. His ranged attacks strike with the fury of a storm, and his presence alone shakes the very foundations of the labyrinth. Face him only when you are ready for divine judgment.',
    mythology: 'Zeus, ruler of Olympus, has transcended into the digital realm. His mainframe is the heart of the labyrinth, the source of all power. Those who challenge him face not just a boss, but a god made manifest in code and electricity.',
  },
  {
    subtype: 'boss_hades',
    name: 'Hades Core',
    imageGenerator: createMobRenderer('boss_hades', renderBossHades),
    combatDescription: 'The lord of the underworld phases through reality itself, untouchable and eternal. His attacks are relentless, his movement unpredictable. He exists in the space between, making him nearly impossible to pin down. Only the most skilled can hope to defeat him.',
    mythology: 'Hades, keeper of the dead, has found new purpose in the digital afterlife. His core is the gateway between realms, the boundary between existence and deletion. To face him is to stare into the abyss itself.',
  },
  {
    subtype: 'boss_ares',
    name: 'Ares Protocol',
    imageGenerator: createMobRenderer('boss_ares', renderBossAres),
    combatDescription: 'War itself given form, Ares charges with unstoppable fury. His speed is unmatched, his attacks devastating. He knows no strategy, only violence. To defeat him, you must become faster, stronger, more aggressive than war itself.',
    mythology: 'Ares, the embodiment of conflict, has been unleashed in the labyrinth. His protocol is chaos, his purpose destruction. Where he goes, only battle remains. To defeat him is to prove that strategy can overcome pure aggression.',
  },
  {
    subtype: 'moth',
    name: 'Nyx Glitchmoth',
    imageGenerator: createMobRenderer('moth', renderMobMoth),
    imagePath: getMobImagePath('moth'),
    combatDescription: 'A nocturnal data-spirit that "eats" light and navigates by your panic. These glitchmoths orbit just outside melee range, periodically blinking to darker areas. Their shadow pulses dim your vision, making them frustrating to chase. If you pursue, they backstep and repeat—annoying, not tanky.',
    mythology: 'Named after Nyx, the primordial goddess of night, these glitchmoths are fragments of darkness made manifest. They consume light itself, thriving in the shadows of the labyrinth. Some say they are the remnants of failed escape attempts, forever drawn to the light of living operators.',
  },
  {
    subtype: 'tracker',
    name: 'Artemis Tracker',
    imageGenerator: createMobRenderer('tracker', renderMobTracker),
    imagePath: getMobImagePath('tracker'),
    combatDescription: 'A hunter-drone with moonlit optics and a taste for corners. These trackers stalk until they have a straight lane, then pounce in a fast line. After a pounce, they reposition to flank rather than face-tank. Their pounce leaves a brief "hunter line" afterimage—touching it causes chip damage, punishing sloppy sidesteps.',
    mythology: 'Artemis, goddess of the hunt, lends her precision to these patient killers. They see all from the shadows, waiting for the perfect moment to strike. Their afterimages are the echoes of their hunts, marking the paths they have taken. To face one is to become the hunted.',
  },
  {
    subtype: 'cerberus',
    name: 'Cerberus Firewall',
    imageGenerator: createMobRenderer('cerberus', renderMobCerberus),
    imagePath: getMobImagePath('cerberus'),
    combatDescription: 'A three-headed security daemon that patrols boss corridors like they\'re sacred gates. Heavy but relentless, it uses slow walks followed by short triple-lunges if you\'re in a lane. Its tri-bite combo delivers three quick hits with slight tracking. This elite guard forces resource spend before the boss, appearing only in boss sectors.',
    mythology: 'Cerberus, the three-headed hound of Hades, guards the gates of the digital underworld. In the labyrinth, these firewalls are the last line of defense before the bosses themselves. Each head takes turns leading, allowing quick pivots without fully turning around. To pass one is to prove you are worthy of facing the gods.',
  },
];

// Get mob card data by subtype
export function getMobCardData(subtype: MobSubtype): MobCardData | undefined {
  return MOB_CARD_DATA.find(card => card.subtype === subtype);
}

// Get all mob subtypes
export function getAllMobSubtypes(): MobSubtype[] {
  return MOB_CARD_DATA.map(card => card.subtype);
}

