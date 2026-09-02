// Chooses which encoded rendition of the background music to load.
//
// WebM/Opus is the preferred format, but WebKit cannot change the volume of a
// WebM/Opus <audio> element routed through a MediaElementAudioSourceNode
// (https://bugs.webkit.org/show_bug.cgi?id=276813) — the GainNode is ignored.
// HTMLMediaElement.volume is also read-only on iOS, so on WebKit the only way to
// make the in-game volume slider work is to feed it MP4/AAC instead.

export type MusicFormat = 'webm' | 'aac';

export interface MusicFormatEnv {
  userAgent: string;
  canPlayAac: boolean;
  canPlayWebmOpus: boolean;
}

const NON_SAFARI_WEBKIT_UA = /Chrome|Chromium|CriOS|Edg\/|EdgiOS|OPR\/|SamsungBrowser|Firefox|FxiOS/i;

export function isIosDevice(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

export function isSafariBrowser(userAgent: string): boolean {
  return /AppleWebKit/i.test(userAgent) && !NON_SAFARI_WEBKIT_UA.test(userAgent);
}

/** True for any browser whose media pipeline is WebKit (Safari, or anything on iOS). */
export function isWebKitEngine(userAgent: string): boolean {
  return isIosDevice(userAgent) || isSafariBrowser(userAgent);
}

export function selectMusicFormat(env: MusicFormatEnv): MusicFormat {
  if (!env.canPlayAac) return 'webm';
  if (isWebKitEngine(env.userAgent)) return 'aac';
  return env.canPlayWebmOpus ? 'webm' : 'aac';
}

export function detectMusicFormat(): MusicFormat {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return 'webm';
  const probe = document.createElement('audio');
  const canPlay = (type: string) => {
    try {
      return probe.canPlayType(type) !== '';
    } catch {
      return false;
    }
  };
  return selectMusicFormat({
    userAgent: navigator.userAgent,
    canPlayAac: canPlay('audio/mp4; codecs="mp4a.40.2"'),
    canPlayWebmOpus: canPlay('audio/webm; codecs="opus"'),
  });
}
