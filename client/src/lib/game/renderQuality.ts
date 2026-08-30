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
