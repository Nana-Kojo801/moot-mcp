"use client";
// Synthesized sound effects (Web Audio). No audio files.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a user gesture so later sounds are allowed to play. */
export function unlockAudio() {
  audio();
}

function noiseBurst(ac: AudioContext, at: number, duration: number, freq: number, gain: number) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(at);
}

/** The rubber stamp: a low thump with a papery slap. */
export function playThump() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.18);
  noiseBurst(ac, t, 0.03, 1800, 0.5);
}

/** Two knocks of the Speaker's gavel. */
export function playGavel() {
  const ac = audio();
  if (!ac) return;
  [0, 0.22].forEach((offset) => {
    const t = ac.currentTime + 0.01 + offset;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(820, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.05);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.1);
    noiseBurst(ac, t, 0.02, 3000, 0.35);
  });
}

export function buzz(ms: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // Some browsers throw when vibration is not allowed; it is only a nicety.
    }
  }
}
