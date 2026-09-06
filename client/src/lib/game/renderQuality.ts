export type RenderQualitySetting = 'auto' | 'high' | 'medium' | 'low';
export type EffectiveRenderQuality = 'high' | 'medium' | 'low';
export type ShadowTier = 'player' | 'boss' | 'exit' | 'generic';

export const MOBILE_BREAKPOINT = 768;

let activeQuality: EffectiveRenderQuality = 'high';
let lastEffectiveQuality: EffectiveRenderQuality = 'high';

const tierRef: { current: ShadowTier } = { current: 'generic' };

export function resolveRenderQuality(
  setting: RenderQualitySetting | undefined,
  isMobileViewport: boolean,
): EffectiveRenderQuality {
  if (setting === 'high') return 'high';
  if (setting === 'medium') return 'medium';
  if (setting === 'low') return 'low';
  return isMobileViewport ? 'low' : 'high';
}

export function getActiveRenderQuality(): EffectiveRenderQuality {
  return lastEffectiveQuality;
}

export function setShadowTier(tier: ShadowTier): void {
  tierRef.current = tier;
}

function shadowAllowed(quality: EffectiveRenderQuality, tier: ShadowTier, blur: number): boolean {
  if (blur === 0) return true;
  if (quality === 'high') return true;
  if (quality === 'low') return false;
  return tier === 'player' || tier === 'boss' || tier === 'exit';
}

/** Patches ctx.shadowBlur for the duration of a draw pass. Returns restore fn. */
export function installShadowQualityGate(
  ctx: CanvasRenderingContext2D,
  quality: EffectiveRenderQuality,
): () => void {
  activeQuality = quality;
  lastEffectiveQuality = quality;
  tierRef.current = 'generic';

  if (quality === 'high') {
    return () => {
      activeQuality = 'high';
      tierRef.current = 'generic';
    };
  }

  const blurDescriptor = Object.getOwnPropertyDescriptor(
    CanvasRenderingContext2D.prototype,
    'shadowBlur',
  );

  if (!blurDescriptor?.set || !blurDescriptor.get) {
    return () => {
      activeQuality = 'high';
      tierRef.current = 'generic';
    };
  }

  Object.defineProperty(ctx, 'shadowBlur', {
    configurable: true,
    get() {
      return blurDescriptor.get!.call(this);
    },
    set(value: number) {
      const allowed = shadowAllowed(quality, tierRef.current, value);
      blurDescriptor.set!.call(this, allowed ? value : 0);
    },
  });

  return () => {
    Object.defineProperty(ctx, 'shadowBlur', blurDescriptor);
    activeQuality = 'high';
    tierRef.current = 'generic';
  };
}

/**
 * The same shadow policy, pinned to one quality and tier, with no module-level
 * side effects.
 *
 * `installShadowQualityGate` writes `activeQuality` and `tierRef`, which the
 * live pass's own gate reads — so using it to render into an offscreen sprite
 * mid-frame would quietly change what the main context is allowed to draw for
 * the rest of that frame. The sprite cache needs a gate that touches nothing
 * but the canvas it is given.
 */
export function installStaticShadowGate(
  ctx: CanvasRenderingContext2D,
  quality: EffectiveRenderQuality,
  tier: ShadowTier,
): () => void {
  if (quality === 'high') return () => {};

  const blurDescriptor = Object.getOwnPropertyDescriptor(
    CanvasRenderingContext2D.prototype,
    'shadowBlur',
  );
  if (!blurDescriptor?.set || !blurDescriptor.get) return () => {};

  Object.defineProperty(ctx, 'shadowBlur', {
    configurable: true,
    get() {
      return blurDescriptor.get!.call(this);
    },
    set(value: number) {
      blurDescriptor.set!.call(this, shadowAllowed(quality, tier, value) ? value : 0);
    },
  });

  return () => {
    Object.defineProperty(ctx, 'shadowBlur', blurDescriptor);
  };
}

/**
 * A `strokeGlowCircle` bound to a given quality rather than the live one, for
 * the same reason: a sprite is rendered once and must not depend on whatever
 * the module happened to be set to at the time.
 */
export function makeStrokeGlowCircle(quality: EffectiveRenderQuality) {
  return (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    lineWidth = 2,
  ): void => {
    if (quality !== 'low') return;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
}

/** Low-quality glow substitute: bright outline stroke. */
export function strokeGlowRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  lineWidth = 2,
): void {
  if (activeQuality !== 'low') return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, width - lineWidth, height - lineWidth);
  ctx.restore();
}

export function strokeGlowCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  lineWidth = 2,
): void {
  if (activeQuality !== 'low') return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function initRenderQuality(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_RENDER__ = {
    getActiveQuality: () => lastEffectiveQuality,
    resolveRenderQuality,
  };
}

declare global {
  interface Window {
    __PIXLAB_RENDER__?: {
      getActiveQuality: () => EffectiveRenderQuality;
      resolveRenderQuality: typeof resolveRenderQuality;
    };
  }
}
