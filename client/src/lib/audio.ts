// Audio manager: WEBM background music + procedural SFX via Web Audio API

import themeMusicUrl from '../assets/audio/Glitched Catacombs (Theme).webm';
import mazeMusicUrl from '../assets/audio/Enter The Catacombs.webm';
import vendorMusicUrl from '../assets/audio/Uncanny Times.webm';
import lobbyReturnMusicUrl from '../assets/audio/Uncanny Times (Extended).webm';

export type MusicTrack = 'theme' | 'maze' | 'vendor' | 'lobbyReturn';

const TRACK_URLS: Record<MusicTrack, string> = {
  theme: themeMusicUrl,
  maze: mazeMusicUrl,
  vendor: vendorMusicUrl,
  lobbyReturn: lobbyReturnMusicUrl,
};

declare global {
  interface Window {
    __PIXLAB_AUDIO__?: {
      getCurrentTrack: () => MusicTrack | null;
      isMusicPlaying: () => boolean;
    };
  }
}

class AudioManager {
  private audioContext: AudioContext | null = null;
  private musicGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private musicElement: HTMLAudioElement | null = null;
  private musicMediaSource: MediaElementAudioSourceNode | null = null;
  private musicVolume: number = 0.5;
  private sfxVolume: number = 0.5;
  private isInitialized: boolean = false;
  private currentTrack: MusicTrack | null = null;
  private loadedMusicSrc: string | null = null;
  private musicPausedForVisibility = false;

  init() {
    if (this.isInitialized) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.musicGainNode = this.audioContext.createGain();
      this.sfxGainNode = this.audioContext.createGain();

      this.musicGainNode.connect(this.audioContext.destination);
      this.sfxGainNode.connect(this.audioContext.destination);

      this.musicGainNode.gain.value = this.musicVolume;
      this.sfxGainNode.gain.value = this.sfxVolume;

      this.ensureMusicElement();

      this.isInitialized = true;
    } catch (error) {
      console.warn('Audio initialization failed:', error);
    }
  }

  get initialized() {
    return this.isInitialized;
  }

  private ensureMusicElement() {
    if (!this.musicElement) {
      this.musicElement = new Audio();
      this.musicElement.loop = true;
      this.musicElement.preload = 'auto';
    }

    if (this.audioContext && this.musicGainNode && !this.musicMediaSource) {
      this.musicMediaSource = this.audioContext.createMediaElementSource(this.musicElement);
      this.musicMediaSource.connect(this.musicGainNode);
    }
  }

  async resume() {
    if (!this.audioContext) {
      return;
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        // Resume may be blocked until a user gesture
      }
    }

    if (this.musicElement && this.currentTrack && this.musicPausedForVisibility) {
      this.musicPausedForVisibility = false;
      try {
        await this.musicElement.play();
      } catch {
        // Ignore autoplay failures
      }
    }
  }

  async suspend() {
    if (this.musicElement && !this.musicElement.paused) {
      this.musicElement.pause();
      this.musicPausedForVisibility = true;
    }

    if (!this.audioContext) return;
    if (this.audioContext.state === 'running') {
      try {
        await this.audioContext.suspend();
      } catch {
        // Ignore suspend failures
      }
    }
  }

  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicGainNode) {
      this.musicGainNode.gain.value = this.musicVolume;
    }
  }

  setSfxVolume(volume: number) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGainNode) {
      this.sfxGainNode.gain.value = this.sfxVolume;
    }
  }

  stopMusic() {
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.currentTime = 0;
    }
    this.currentTrack = null;
    this.loadedMusicSrc = null;
    this.musicPausedForVisibility = false;
  }

  playMusic(type: MusicTrack) {
    if (!this.audioContext || !this.musicGainNode) {
      this.init();
      if (!this.audioContext || !this.musicGainNode) return;
    }

    if (
      this.currentTrack === type &&
      this.musicElement &&
      !this.musicElement.paused &&
      !this.musicPausedForVisibility
    ) {
      return;
    }

    this.ensureMusicElement();
    if (!this.musicElement) return;

    const nextSrc = TRACK_URLS[type];
    const sameSource = this.loadedMusicSrc === nextSrc;

    this.currentTrack = type;
    this.musicPausedForVisibility = false;

    if (!sameSource) {
      this.musicElement.pause();
      this.musicElement.src = nextSrc;
      this.musicElement.load();
      this.loadedMusicSrc = nextSrc;
    }

    void this.musicElement.play().catch((error) => {
      console.warn('Music playback failed:', error);
    });
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  isMusicPlaying() {
    return Boolean(this.musicElement && this.currentTrack && !this.musicElement.paused);
  }

  playSound(type: 'move' | 'attack' | 'enemyDeath' | 'itemPickup' | 'damage' | 'levelComplete' | 'gameOver' | 'coin' | 'purchase') {
    if (!this.audioContext || !this.sfxGainNode) {
      this.init();
      return;
    }

    switch (type) {
      case 'move':
        this.playTone(200, 0.05, 0.1, 'sine');
        break;

      case 'attack':
        this.playTone(400, 0.1, 0.15, 'square');
        break;

      case 'enemyDeath':
        this.playTone(300, 0.1, 0.2, 'sawtooth', true);
        break;

      case 'itemPickup':
        this.playTone(600, 0.15, 0.2, 'sine', true);
        break;

      case 'damage':
        this.playTone(150, 0.2, 0.3, 'sawtooth');
        break;

      case 'levelComplete':
        this.playMelody([523.25, 659.25, 783.99], 0.15, 0.1);
        break;

      case 'gameOver':
        this.playMelody([196, 174.61, 155.56], 0.2, 0.15);
        break;

      case 'coin':
        this.playTone(800, 0.1, 0.15, 'sine', true);
        break;

      case 'purchase':
        this.playMelody([523.25, 659.25], 0.15, 0.1);
        break;
    }
  }

  private playTone(
    frequency: number,
    duration: number,
    volume: number,
    waveType: OscillatorType = 'sine',
    pitchSlide: boolean = false
  ) {
    if (!this.audioContext || !this.sfxGainNode) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = waveType;
    oscillator.frequency.value = frequency;

    if (pitchSlide) {
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 1.5,
        this.audioContext.currentTime + duration
      );
    }

    oscillator.connect(gainNode);
    gainNode.connect(this.sfxGainNode);

    const now = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.linearRampToValueAtTime(volume * 0.5, now + duration * 0.7);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private playMelody(frequencies: number[], duration: number, delay: number) {
    if (!this.audioContext || !this.sfxGainNode) return;

    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, duration, 0.15, 'sine');
      }, index * delay * 1000);
    });
  }
}

export const audioManager = new AudioManager();

export function startThemeMusic() {
  audioManager.init();
  void audioManager.resume();
  audioManager.playMusic('theme');
}

if (typeof window !== 'undefined') {
  window.__PIXLAB_AUDIO__ = {
    getCurrentTrack: () => audioManager.getCurrentTrack(),
    isMusicPlaying: () => audioManager.isMusicPlaying(),
  };

  const initAudio = async () => {
    audioManager.init();
    await audioManager.resume();
  };

  window.addEventListener('click', initAudio, { once: true });
  window.addEventListener('touchstart', initAudio, { once: true });
  window.addEventListener('keydown', initAudio, { once: true });
}
