// ============================================================
// Shadow Protocol - Web Audio API Sound Effects Engine
// ============================================================

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ─── Utility helpers ────────────────────────────────────────

function noise(ctx: AudioContext, duration: number): AudioBufferSourceNode {
  const len = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// ─── Sound Effects ──────────────────────────────────────────

export function playShoot() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Sharp attack noise burst (gunshot crack)
  const n = noise(ctx, 0.12);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  n.connect(hp).connect(gain).connect(ctx.destination);
  n.start(now);
  n.stop(now + 0.12);

  // Low thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.3, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  osc.connect(g2).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function playExplosion() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Rumble noise
  const n = noise(ctx, 0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1000, now);
  lp.frequency.exponentialRampToValueAtTime(60, now + 0.5);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  n.connect(lp).connect(gain).connect(ctx.destination);
  n.start(now);
  n.stop(now + 0.6);

  // Sub bass boom
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);

  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.5, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc.connect(g2).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

export function playMove() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Soft footstep - filtered noise tap
  const n = noise(ctx, 0.08);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2000;
  bp.Q.value = 1;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  n.connect(bp).connect(gain).connect(ctx.destination);
  n.start(now);
  n.stop(now + 0.08);
}

export function playCriticalHit() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Impact crack (louder than normal shot)
  const n = noise(ctx, 0.15);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 600;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  n.connect(hp).connect(gain).connect(ctx.destination);
  n.start(now);
  n.stop(now + 0.15);

  // Rising metallic ping
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(1800, now + 0.15);

  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.2, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(g2).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);

  // Sub thud
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(200, now);
  osc2.frequency.exponentialRampToValueAtTime(30, now + 0.15);

  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(0.4, now);
  g3.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc2.connect(g3).connect(ctx.destination);
  osc2.start(now);
  osc2.stop(now + 0.15);
}

export function playMiss() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Quick whoosh
  const n = noise(ctx, 0.1);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(3000, now);
  bp.frequency.exponentialRampToValueAtTime(800, now + 0.1);
  bp.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  n.connect(bp).connect(gain).connect(ctx.destination);
  n.start(now);
  n.stop(now + 0.1);
}

export function playHeal() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Gentle ascending chime
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523, now);       // C5
  osc.frequency.setValueAtTime(659, now + 0.1);  // E5
  osc.frequency.setValueAtTime(784, now + 0.2);  // G5

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

export function playUnitKilled() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Descending tone
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 800;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc.connect(lp).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.35);
}

export function playAbility() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Sci-fi activation sweep
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.25);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(lp).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}
