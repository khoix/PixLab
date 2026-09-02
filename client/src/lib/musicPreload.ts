// Downloads every music track up front (title screen) so track switches never
// wait on the network, and hands the audio manager blob: URLs to play from.
// Responses are also stored in the Cache API so a return visit is near-instant.

import type { MusicTrack } from './audio';

export type MusicPreloadStatus = 'idle' | 'loading' | 'done' | 'error';

export interface MusicPreloadState {
  status: MusicPreloadStatus;
  /** 0..1 — mean of per-track byte fractions, so a missing Content-Length on one file cannot skew it. */
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  completedTracks: number;
  totalTracks: number;
  error: string | null;
}

type Listener = (state: MusicPreloadState) => void;

const CACHE_NAME = 'pixlab-music-v1';

const INITIAL_STATE: MusicPreloadState = {
  status: 'idle',
  progress: 0,
  loadedBytes: 0,
  totalBytes: 0,
  completedTracks: 0,
  totalTracks: 0,
  error: null,
};

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

interface TrackProgress {
  loaded: number;
  total: number;
  done: boolean;
}

class MusicPreloader {
  private state: MusicPreloadState = { ...INITIAL_STATE };
  private listeners = new Set<Listener>();
  private inflight: Promise<void> | null = null;
  private objectUrls = new Map<MusicTrack, string>();
  private perTrack = new Map<MusicTrack, TrackProgress>();

  getState(): MusicPreloadState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getPreloadedUrl(track: MusicTrack): string | null {
    return this.objectUrls.get(track) ?? null;
  }

  /** Idempotent: repeated calls (re-mounting the title screen) share one download. */
  start(sources: Record<MusicTrack, string>): Promise<void> {
    if (this.inflight) return this.inflight;
    if (this.state.status === 'done') return Promise.resolve();

    const tracks = Object.keys(sources) as MusicTrack[];
    this.perTrack.clear();
    for (const track of tracks) {
      this.perTrack.set(track, { loaded: 0, total: 0, done: false });
    }
    this.setState({ ...INITIAL_STATE, status: 'loading', totalTracks: tracks.length });

    this.inflight = (async () => {
      const cache = await openCache();
      const results = await Promise.allSettled(
        tracks.map((track) => this.loadTrack(track, sources[track], cache)),
      );
      const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (cache) void this.pruneCache(cache, Object.values(sources));

      if (failure) {
        const message = failure.reason instanceof Error ? failure.reason.message : String(failure.reason);
        console.warn('Music preload failed; tracks will stream on demand:', failure.reason);
        this.setState({ ...this.state, status: 'error', error: message });
      } else {
        this.setState({ ...this.state, status: 'done', progress: 1 });
      }
    })().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async loadTrack(track: MusicTrack, url: string, cache: Cache | null): Promise<void> {
    let response: Response | undefined;
    if (cache) {
      try {
        response = await cache.match(url);
      } catch {
        response = undefined;
      }
    }
    if (!response) {
      response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
      }
      if (cache) {
        try {
          await cache.put(url, response.clone());
        } catch {
          // Quota or opaque-response failures just mean no offline cache.
        }
      }
    }

    const contentType = response.headers.get('content-type') ?? '';
    const declaredTotal = Number(response.headers.get('content-length')) || 0;
    let blob: Blob;

    if (!response.body) {
      blob = await response.blob();
      this.updateTrack(track, { loaded: blob.size, total: blob.size, done: true });
    } else {
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let loaded = 0;
      this.updateTrack(track, { loaded: 0, total: declaredTotal, done: false });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          this.updateTrack(track, { loaded, total: Math.max(declaredTotal, loaded), done: false });
        }
      }
      blob = new Blob(chunks, { type: contentType });
      this.updateTrack(track, { loaded: blob.size, total: blob.size, done: true });
    }

    const previous = this.objectUrls.get(track);
    if (previous) URL.revokeObjectURL(previous);
    this.objectUrls.set(track, URL.createObjectURL(blob));
  }

  private updateTrack(track: MusicTrack, progress: TrackProgress) {
    this.perTrack.set(track, progress);

    let fractionSum = 0;
    let loadedBytes = 0;
    let totalBytes = 0;
    let completedTracks = 0;
    this.perTrack.forEach((p) => {
      loadedBytes += p.loaded;
      totalBytes += p.total;
      if (p.done) completedTracks++;
      fractionSum += p.done ? 1 : p.total > 0 ? Math.min(1, p.loaded / p.total) : 0;
    });
    const count = this.perTrack.size || 1;
    this.setState({
      ...this.state,
      progress: Math.min(1, fractionSum / count),
      loadedBytes,
      totalBytes,
      completedTracks,
    });
  }

  private async pruneCache(cache: Cache, keep: string[]) {
    try {
      const keepSet = new Set(keep.map((u) => new URL(u, location.href).href));
      const requests = await cache.keys();
      await Promise.all(
        requests.filter((req) => !keepSet.has(req.url)).map((req) => cache.delete(req)),
      );
    } catch {
      // Best-effort housekeeping.
    }
  }

  private setState(next: MusicPreloadState) {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }
}

export const musicPreloader = new MusicPreloader();
