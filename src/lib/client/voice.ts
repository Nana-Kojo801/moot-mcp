"use client";
// Browser speech: SpeechRecognition for the microphone, speechSynthesis for the Clerk.

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechInputSupported(): boolean {
  return recognitionCtor() !== null;
}

export function describeRecognitionError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in your browser's site settings, or type below.";
    case "no-speech":
      return "No speech was heard. Tap Speak and talk after the ring appears.";
    case "audio-capture":
      return "No microphone was found. Type below instead.";
    case "network":
      return "Speech recognition needs a network connection. Check your connection, or type below.";
    case "aborted":
      return "";
    default:
      return `Speech recognition stopped (${code}). Tap Speak to try again, or type below.`;
  }
}

export interface Listener {
  stop(): void;
  abort(): void;
}

export function listen(handlers: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
}): Listener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = "";
  let latest = "";
  let failed = false;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    latest = (finalText + " " + interim).trim();
    handlers.onInterim(latest);
  };
  rec.onerror = (e) => {
    failed = true;
    handlers.onError(e.error);
  };
  rec.onend = () => {
    if (failed) return;
    const text = (finalText || latest).trim();
    if (text) handlers.onFinal(text);
    else handlers.onError("no-speech");
  };
  rec.start();
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}

// ---------- speech synthesis ----------

function englishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
}

export function speechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Call once from a user gesture so later replies may speak on mobile browsers. */
export function unlockSpeech() {
  if (!speechOutputSupported()) return;
  const u = new SpeechSynthesisUtterance("");
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

/**
 * Speaks text. `business` uses the Clerk's parliamentary voice: a different
 * English voice when the device has one, and a lower pitch either way.
 */
export function speak(text: string, opts: { business?: boolean; onEnd?: () => void } = {}) {
  if (!speechOutputSupported() || !text) {
    opts.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = englishVoices();
  const base = voices.find((v) => v.default) ?? voices[0];
  if (opts.business) {
    const alt = voices.find((v) => v !== base && v.lang.toLowerCase().startsWith(base?.lang.toLowerCase().slice(0, 2) ?? "en"));
    if (alt) u.voice = alt;
    else if (base) u.voice = base;
    u.pitch = 0.8;
    u.rate = 0.95;
  } else if (base) {
    u.voice = base;
  }
  u.lang = u.voice?.lang ?? "en-US";
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  synth.speak(u);
}

export function stopSpeaking() {
  if (speechOutputSupported()) window.speechSynthesis.cancel();
}
