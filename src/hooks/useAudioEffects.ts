// ============================================================
// Shadow Protocol - Audio Effects Hook (Web Audio API)
// ============================================================
import { useRef, useCallback } from 'react';

const BASE = import.meta.env.BASE_URL;

export function useAudioEffects() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playGunshot = useCallback(() => {
    const ctx = getContext();
    const duration = 0.15;

    // White noise buffer
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Exponential decay envelope
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Bandpass filter to shape the sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.5;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }, [getContext]);

  const playExplosion = useCallback(() => {
    const ctx = getContext();
    const duration = 0.4;
    const now = ctx.currentTime;

    // White noise buffer for the main blast
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    // Bandpass filter — lower frequency for explosion
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.3;

    // Main gain envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + duration);

    // Secondary low-frequency oscillator for rumble
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 60;

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }, [getContext]);

  const playLevelUp = useCallback(() => {
    const ctx = getContext();
    const now = ctx.currentTime;

    // First tone — C5 (523 Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 523;
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second tone — E5 (659 Hz)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 659;
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.0001, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.2, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.3);
  }, [getContext]);

  const playFlashbang = useCallback(() => {
    const ctx = getContext();
    const duration = 0.2;
    const now = ctx.currentTime;

    // White noise burst
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // High-frequency bandpass
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4000;
    filter.Q.value = 1.0;

    // Sharp attack, fast decay
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }, [getContext]);

  // #2: Footstep sound — soft low-frequency noise burst
  const playFootstep = useCallback(() => {
    const ctx = getContext();
    const duration = 0.06;
    const now = ctx.currentTime;

    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }, [getContext]);

  // #4: Construction sound — descending triangle oscillator
  const playConstruction = useCallback(() => {
    const ctx = getContext();
    const duration = 0.3;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }, [getContext]);

  // #5: Drone sound — two detuned sawtooth oscillators (reduced gain)
  const playDrone = useCallback(() => {
    const ctx = getContext();
    const duration = 0.4;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 180;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 186;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }, [getContext]);

  // Last step sound — heavier thud than regular footstep
  const playLastStep = useCallback(() => {
    const ctx = getContext();
    const duration = 0.1;
    const now = ctx.currentTime;

    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }, [getContext]);

  // Stimulant injection sound — hiss + sharp click
  const playStimulant = useCallback(() => {
    const ctx = getContext();
    const now = ctx.currentTime;

    // Hiss: filtered noise burst
    const hissLen = 0.12;
    const hissSize = Math.ceil(ctx.sampleRate * hissLen);
    const hissBuf = ctx.createBuffer(1, hissSize, ctx.sampleRate);
    const hissData = hissBuf.getChannelData(0);
    for (let i = 0; i < hissSize; i++) hissData[i] = (Math.random() * 2 - 1);

    const hissSource = ctx.createBufferSource();
    hissSource.buffer = hissBuf;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 3000;
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.15, now);
    hissGain.gain.exponentialRampToValueAtTime(0.001, now + hissLen);
    hissSource.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(ctx.destination);
    hissSource.start(now);
    hissSource.stop(now + hissLen);

    // Click: short sine blip
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, now + 0.08);
    clickGain.gain.exponentialRampToValueAtTime(0.25, now + 0.09);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(clickGain);
    clickGain.connect(ctx.destination);
    osc.start(now + 0.08);
    osc.stop(now + 0.15);
  }, [getContext]);

  // MP3 cache for file-based sounds
  const mp3CacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  const loadMp3 = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    const cached = mp3CacheRef.current.get(url);
    if (cached) return cached;
    try {
      const ctx = getContext();
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      mp3CacheRef.current.set(url, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }, [getContext]);

  // Hydrabad hacking sound — plays MP3 with graceful fallback
  const playHydrabad = useCallback(async () => {
    const buffer = await loadMp3(`${BASE}assets/audio/hydrabad.mp3`);
    if (!buffer) return; // Graceful silence if MP3 missing
    const ctx = getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }, [getContext, loadMp3]);

  // Golden Eagle individual shot sound
  const playGoldenEagleShot = useCallback(async () => {
    const buffer = await loadMp3(`${BASE}assets/audio/goldeneagle.mp3`);
    if (!buffer) return;
    const ctx = getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }, [getContext, loadMp3]);

  // Reina rally sound
  const playCartelRally = useCallback(async () => {
    const buffer = await loadMp3(`${BASE}assets/audio/cartelrally.mp3`);
    if (!buffer) return;
    const ctx = getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }, [getContext, loadMp3]);

  return { playGunshot, playExplosion, playLevelUp, playFlashbang, playFootstep, playLastStep, playConstruction, playDrone, playStimulant, playHydrabad, playGoldenEagleShot, playCartelRally };
}
