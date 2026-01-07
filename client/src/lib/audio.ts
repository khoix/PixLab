// Audio Manager using Web Audio API for procedural sound generation
// This creates sounds programmatically without requiring audio files

class AudioManager {
  private audioContext: AudioContext | null = null;
  private musicGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private currentMusicOscillator: OscillatorNode | null = null;
  private currentMusicSource: AudioBufferSourceNode | null = null;
  private musicVolume: number = 0.5;
  private sfxVolume: number = 0.5;
  private isInitialized: boolean = false;
  private userActivated: boolean = false;

  // Initialize audio context (must be called after user interaction)
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
      
      this.isInitialized = true;
      this.userActivated = true; // Mark as user-activated when init is called from user gesture
    } catch (error) {
      console.warn('Audio initialization failed:', error);
    }
  }

  // Resume audio context (required after user interaction)
  async resume() {
    if (!this.audioContext) {
      // Don't auto-initialize here - wait for user gesture
      return;
    }
    // Try to resume if suspended (userActivated is set when init is called from user gesture)
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        // Silently fail if resume is not allowed
        // This can happen if the context was suspended after initialization
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

  // Stop current music
  stopMusic() {
    if (this.currentMusicOscillator) {
      try {
        this.currentMusicOscillator.stop();
      } catch (e) {
        // Already stopped
      }
      this.currentMusicOscillator = null;
    }
    if (this.currentMusicSource) {
      try {
        this.currentMusicSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.currentMusicSource = null;
    }
  }

  // Play ambient background music
  playMusic(type: 'lobby' | 'combat' | 'shop' | 'boss') {
    if (!this.audioContext || !this.musicGainNode) {
      this.init();
      return;
    }

    this.stopMusic();

    // Create a simple ambient melody using oscillators
    const createMelody = () => {
      const oscillator = this.audioContext!.createOscillator();
      const gainNode = this.audioContext!.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.musicGainNode!);

      // Different frequencies for different music types
      const baseFreqs: Record<typeof type, number[]> = {
        lobby: [220, 261.63, 293.66, 329.63], // A, C, D, E
        combat: [196, 233.08, 277.18, 311.13], // G, Bb, C#, D#
        shop: [246.94, 293.66, 329.63, 369.99], // B, D, E, F#
        boss: [146.83, 174.61, 196, 220], // D, F, G, A (lower, more ominous)
      };

      const freqs = baseFreqs[type];
      let currentNote = 0;
      const noteDuration = type === 'boss' ? 800 : 600;

      const playNote = () => {
        if (!this.audioContext || !this.musicGainNode) return;

        const freq = freqs[currentNote % freqs.length];
        oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
        
        // Create a soft attack and release
        const now = this.audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.15, now + 0.1);
        gainNode.gain.linearRampToValueAtTime(0.1, now + noteDuration / 1000 - 0.1);
        gainNode.gain.linearRampToValueAtTime(0, now + noteDuration / 1000);

        currentNote++;
        
        if (currentNote < 1000) { // Play for a long time
          setTimeout(playNote, noteDuration);
        }
      };

      oscillator.type = type === 'boss' ? 'sawtooth' : 'sine';
      oscillator.start();
      playNote();
      
      this.currentMusicOscillator = oscillator;
    };

    // For more complex music, use a pattern-based approach
    const playPattern = () => {
      if (!this.audioContext || !this.musicGainNode) return;

      const patterns: Record<typeof type, { notes: number[], tempo: number }> = {
        lobby: { notes: [0, 2, 3, 2, 0, 1, 2, 1], tempo: 120 },
        combat: { notes: [0, 1, 2, 0, 1, 2, 3, 2], tempo: 140 },
        shop: { notes: [0, 2, 3, 4, 3, 2, 0, 1], tempo: 100 },
        boss: { notes: [0, 1, 0, 2, 0, 1, 0, 3], tempo: 90 },
      };

      const pattern = patterns[type];
      const baseFreqs: Record<typeof type, number[]> = {
        lobby: [220, 261.63, 293.66, 329.63, 349.23],
        combat: [196, 233.08, 277.18, 311.13, 349.23],
        shop: [246.94, 293.66, 329.63, 369.99, 392],
        boss: [146.83, 174.61, 196, 220, 246.94],
      };

      const freqs = baseFreqs[type];
      let noteIndex = 0;
      const noteTime = (60 / pattern.tempo) * 1000;

      const playNextNote = () => {
        if (!this.audioContext || !this.musicGainNode) return;

        const note = pattern.notes[noteIndex % pattern.notes.length];
        const freq = freqs[note];

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = type === 'boss' ? 'sawtooth' : 'triangle';
        oscillator.frequency.value = freq;

        oscillator.connect(gainNode);
        gainNode.connect(this.musicGainNode);

        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gainNode.gain.linearRampToValueAtTime(0.08, now + (noteTime * 0.7) / 1000);
        gainNode.gain.linearRampToValueAtTime(0, now + noteTime / 1000);

        oscillator.start(now);
        oscillator.stop(now + noteTime / 1000);

        noteIndex++;
        setTimeout(playNextNote, noteTime);
      };

      playNextNote();
    };

    playPattern();
  }

  // Sound effects
  playSound(type: 'move' | 'attack' | 'enemyDeath' | 'itemPickup' | 'damage' | 'levelComplete' | 'gameOver' | 'coin' | 'purchase') {
    if (!this.audioContext || !this.sfxGainNode) {
      this.init();
      return;
    }

    const now = this.audioContext.currentTime;

    // Create sound based on type
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
        this.playMelody([523.25, 659.25, 783.99], 0.15, 0.1); // C, E, G
        break;
      
      case 'gameOver':
        this.playMelody([196, 174.61, 155.56], 0.2, 0.15); // Descending
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

// Singleton instance
export const audioManager = new AudioManager();

// Initialize on first user interaction
if (typeof window !== 'undefined') {
  const initAudio = async () => {
    audioManager.init();
    await audioManager.resume();
    window.removeEventListener('click', initAudio);
    window.removeEventListener('touchstart', initAudio);
    window.removeEventListener('keydown', initAudio);
  };

  window.addEventListener('click', initAudio, { once: true });
  window.addEventListener('touchstart', initAudio, { once: true });
  window.addEventListener('keydown', initAudio, { once: true });
}

