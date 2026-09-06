import { TILE_SIZE } from '../constants';
import type { MobSubtype } from '../types';

// The static half of a mob's appearance, lifted verbatim out of GameCanvas's
// entity loop so it can be rendered once into a sprite instead of re-walked
// per entity per frame.
//
// M7 flattened `update()` to ~0.3 ms whatever the mob count, which left drawing
// as the only thing still scaling with population: 2.7 -> 3.5 ms from 8 to 62
// mobs, most of it per-entity path building and `shadowBlur`, which forces a
// blur filter on every call.
//
// Everything here is a pure function of the options below — that is what makes
// it cacheable. The parts that are not (the attack telegraph, the hit flash,
// the health bar) stayed behind in the entity loop as live overlays.

export interface MobArtOptions {
  subtype: MobSubtype | undefined;
  isBoss: boolean;
  centerX: number;
  centerY: number;
  color: string;
  size: number;
  quality: string;
  /** Ares lights up mid-charge, so it is part of the appearance, not an overlay. */
  charging: boolean;
}

/** Stroke a glowing ring — the low-quality substitute for `shadowBlur`. */
export type StrokeGlowCircle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  width: number,
) => void;

export function drawMobArt(
  ctx: CanvasRenderingContext2D,
  opts: MobArtOptions,
  strokeGlowCircle: StrokeGlowCircle,
): void {
  const { subtype, isBoss, centerX, centerY, color, size, quality, charging } = opts;

  // Save context state before drawing
  ctx.save();
  
  // Special rendering for bosses
  if (isBoss) {
    
    if (subtype === 'boss_zeus') {
      // Zeus Boss: Electric energy effect with lightning glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      ctx.fill();
      // Inner glow
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (subtype === 'boss_hades') {
      // Hades Boss: Shadow/void effect with purple glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      ctx.fill();
      // Dark center
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (subtype === 'boss_ares') {
      // Ares Boss: Aggressive red with charge indicator
      if (charging) {
        // Enhanced glow when charging
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
      } else {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      ctx.fill();
      // Inner fire effect
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 100, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Default boss rendering
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (quality === 'low') {
      strokeGlowCircle(ctx, centerX, centerY, size / 2, color, 2);
    }
  } else if (subtype === 'phase') {
    // Hades Phase: Ghost/wraith appearance with bright eyes
    
    // Wispy, ethereal body - elongated oval shape
    ctx.save();
    ctx.globalAlpha = 0.7; // Semi-transparent ghostly effect
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    
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
    
    // Small, bright eyes
    const eyeSize = 2.5;
    const eyeY = centerY - size / 4;
    const eyeSpacing = size / 4;
    
    // Left eye - bright cyan
    ctx.fillStyle = '#00FFFF'; // Bright cyan
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 8;
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
  } else if (subtype === 'charger') {
    // Ares Charger: Octagon with horns and nose ring
    
    // Glowing effect when charging
    if (charging) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }
    
    // Octagon shape
    ctx.fillStyle = color;
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
    const noseRingThickness = 3.5; // Thicker
    ctx.strokeStyle = '#FFD700'; // Yellow
    ctx.lineWidth = noseRingThickness;
    ctx.beginPath();
    ctx.arc(centerX, centerY + size * 0.1, noseRingRadius, 0, Math.PI);
    ctx.stroke();
  } else if (subtype === 'turret') {
    // Hephaestus Turret: Base, turret top, and gun barrel pointing left
    const baseSize = size * 0.7;
    const turretSize = size * 0.6;
    
    // Base (bottom rectangle)
    ctx.fillStyle = color;
    ctx.fillRect(
      centerX - baseSize / 2,
      centerY + baseSize / 4,
      baseSize,
      baseSize / 2
    );
    
    // Turret top (square on top of base)
    ctx.fillStyle = '#0d8f6a';
    ctx.fillRect(
      centerX - turretSize / 2,
      centerY - turretSize / 2,
      turretSize,
      turretSize
    );
    
    // Glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#0d8f6a';
    ctx.fillRect(
      centerX - turretSize / 2 + 3,
      centerY - turretSize / 2 + 3,
      turretSize - 6,
      turretSize - 6
    );
    ctx.shadowBlur = 0;
    
    // Gun barrel pointing left - shorter and same color as turret
    const barrelLength = size * 0.35; // Shorter
    const barrelWidth = size * 0.3;
    const barrelX = centerX - turretSize / 2 - barrelLength;
    const barrelY = centerY - barrelWidth / 2;
    
    // Main barrel body (same color as turret)
    ctx.fillStyle = '#0d8f6a';
    ctx.fillRect(barrelX, barrelY, barrelLength, barrelWidth);
    
    // Barrel outline for definition
    ctx.strokeStyle = '#0d8f6a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barrelX, barrelY, barrelLength, barrelWidth);
    
    // Barrel tip (slightly darker turret color)
    ctx.fillStyle = '#0a6b52';
    ctx.fillRect(barrelX, barrelY, barrelLength * 0.2, barrelWidth);
    
    // Barrel connection to turret (mount)
    ctx.fillStyle = '#0d8f6a';
    ctx.fillRect(centerX - turretSize / 2 - 3, centerY - barrelWidth / 3, 3, barrelWidth * 0.67);
    
    // Barrel details (rings/segments)
    ctx.strokeStyle = '#0a6b52';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const ringX = barrelX + (barrelLength * 0.33 * i);
      ctx.beginPath();
      ctx.moveTo(ringX, barrelY);
      ctx.lineTo(ringX, barrelY + barrelWidth);
      ctx.stroke();
    }
  } else if (subtype === 'sniper') {
    // Apollo Sniper: Diamond shape with reticle
    
    // Diamond shape
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size / 2);
    ctx.lineTo(centerX + size / 2, centerY);
    ctx.lineTo(centerX, centerY + size / 2);
    ctx.lineTo(centerX - size / 2, centerY);
    ctx.closePath();
    ctx.fill();
    
    // Reticle (crosshair) in center with detail
    const reticleSize = size * 0.35;
    const reticleThickness = 1.5;
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
    const tickLength = 3;
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
  } else if (subtype === 'moth') {
    // Nyx Glitchmoth: Smaller body with transparent wings and pixie trail
    const bodySize = size / 3; // Smaller body (was size / 2)
    
    // Draw transparent wings first (behind body)
    ctx.save();
    ctx.globalAlpha = 0.3; // Transparent wings
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    
    // Left wing
    ctx.beginPath();
    ctx.ellipse(
      centerX - bodySize * 0.8,
      centerY,
      bodySize * 1.2,
      bodySize * 0.8,
      -0.3,
      0,
      Math.PI * 2
    );
    ctx.fill();
    
    // Right wing
    ctx.beginPath();
    ctx.ellipse(
      centerX + bodySize * 0.8,
      centerY,
      bodySize * 1.2,
      bodySize * 0.8,
      0.3,
      0,
      Math.PI * 2
    );
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.restore();
    
    // Draw main body - smaller
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, bodySize, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner glow
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2d1a5a';
    ctx.beginPath();
    ctx.arc(centerX, centerY, bodySize / 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (subtype === 'tracker') {
    // Artemis Tracker: Lunar Neon, angular shape
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
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
  } else if (subtype === 'cerberus') {
    // Cerberus Firewall: Brimstone Vermillion, three-part design (three heads)
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    // Draw three heads
    const headSize = size / 3;
    // Left head
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
    // Body
    ctx.fillRect(centerX - size / 2, centerY, size, size / 2);
    ctx.shadowBlur = 0;
  } else if (subtype === 'drone') {
    // Hermes Drone: Redesigned with pronounced yellow eye
    
    // Main body with glow
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
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
    const eyeSize = size / 4.5; // Smaller than before (was size / 3)
    ctx.fillStyle = '#FFD700'; // Bright yellow
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 10;
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
  } else if (subtype === 'guardian') {
    // Athena Guardian: Helmet with glowing eye space
    
    // Helmet shape (rounded top, wider bottom)
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
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
    ctx.shadowBlur = 15;
    ctx.fillRect(
      centerX - eyeSlitWidth / 2,
      eyeSlitY - eyeSlitHeight / 2,
      eyeSlitWidth,
      eyeSlitHeight
    );
    ctx.shadowBlur = 0;
    
    // Eye slit outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      centerX - eyeSlitWidth / 2,
      eyeSlitY - eyeSlitHeight / 2,
      eyeSlitWidth,
      eyeSlitHeight
    );
  } else if (subtype === 'swarm') {
    // Minion Swarm: Multiple small squares with eyes (matching compendium)
    const minionSize = size / 2.5; // Smaller squares
    
    // Render multiple small minions in a pattern
    const positions = [
      { x: centerX - minionSize * 0.6, y: centerY - minionSize * 0.6 },
      { x: centerX + minionSize * 0.6, y: centerY - minionSize * 0.6 },
      { x: centerX - minionSize * 0.6, y: centerY + minionSize * 0.6 },
      { x: centerX + minionSize * 0.6, y: centerY + minionSize * 0.6 },
      { x: centerX, y: centerY - minionSize * 0.9 },
      { x: centerX, y: centerY + minionSize * 0.9 },
      { x: centerX - minionSize * 0.9, y: centerY },
      { x: centerX + minionSize * 0.9, y: centerY },
    ];
    
    positions.forEach(pos => {
      // Outer square
      ctx.fillStyle = color;
      ctx.fillRect(pos.x - minionSize / 2, pos.y - minionSize / 2, minionSize, minionSize);
      
      // Inner square with glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffd633';
      ctx.fillRect(pos.x - minionSize / 2 + 1, pos.y - minionSize / 2 + 1, minionSize - 2, minionSize - 2);
      ctx.shadowBlur = 0;
      
      // Black dots for eyes (larger)
      const eyeSize = 2.5;
      ctx.fillStyle = '#000000';
      ctx.fillRect(pos.x - minionSize / 4 - eyeSize / 2, pos.y - minionSize / 4 - eyeSize / 2, eyeSize, eyeSize);
      ctx.fillRect(pos.x + minionSize / 4 - eyeSize / 2, pos.y - minionSize / 4 - eyeSize / 2, eyeSize, eyeSize);
    });
  } else {
    // Default: Circle for most mobs
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      size / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  
  // Restore context state (resets globalAlpha and shadow)
  ctx.restore();
}
