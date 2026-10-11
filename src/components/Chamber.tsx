"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { postJson, recallSpeaker, rememberSpeaker, type MootState } from "@/lib/client/useMoot";
import { buzz, playGavel, playThump, unlockAudio } from "@/lib/client/sound";
import {
  describeRecognitionError,
  listen,
  speak,
  speechInputSupported,
  stopSpeaking,
  unlockSpeech,
  type Listener,
} from "@/lib/client/voice";
import { Hemicycle } from "./Hemicycle";
import { OrderPaper } from "./OrderPaper";
import { InkFilter, MicIcon, SendIcon } from "./icons";
import { DemoControls } from "./DemoControls";

type Phase = "idle" | "listening" | "thinking" | "speaking";

interface Line {
  id: number;
  who: string;
  text: string;
  clerk: boolean;
}

interface ClerkStep {
  name: string;
  ok: boolean;
  outcome: string | null;
  spoken: string | null;
  budget_exhausted: boolean;
}

interface ClerkReply {
  reply: string;
  steps: ClerkStep[];
  budget_exhausted?: boolean;
}

const BUSINESS = new Set(["call_vote", "close_vote", "give_assent", "get_due_reminders"]);

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Chamber({
  state,
  refresh,
}: {
  state: MootState;
  refresh: () => Promise<MootState | null>;
}) {
  const [speakingAs, setSpeakingAs] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [voiceIn, setVoiceIn] = useState(true);
  const [draft, setDraft] = useState("");
  const [animateStamp, setAnimateStamp] = useState(false);
  const listener = useRef<Listener | null>(null);
  const lineId = useRef(0);

  const members = state.members;
  const current = members.find((m) => m.id === speakingAs) ?? members[0] ?? null;

  useEffect(() => {
    // Read browser-only capabilities after mount so server and client render the same markup.
    const supported = speechInputSupported();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoiceIn(supported);
    if (!supported) setTyping(true);
    const saved = recallSpeaker();
    if (saved) setSpeakingAs(saved);
  }, []);

  const addLine = useCallback((who: string, text: string, clerk: boolean) => {
    lineId.current += 1;
    const id = lineId.current;
    setLines((prev) => [...prev.slice(-3), { id, who, text, clerk }]);
  }, []);

  const say = useCallback((text: string, business: boolean) => {
    setPhase("speaking");
    speak(text, { business, onEnd: () => setPhase((p) => (p === "speaking" ? "idle" : p)) });
  }, []);

  const strike = useCallback(() => {
    setAnimateStamp(true);
    const calm = reducedMotion();
    document.querySelector(".paper")?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    window.setTimeout(() => {
      playThump();
      if (!calm) buzz(25);
    }, calm ? 0 : 170);
  }, []);

  const send = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text || !current) return;
      setNotice(null);
      setInterim("");
      addLine(current.name, text, false);
      setPhase("thinking");
      setAnimateStamp(false);
      try {
        const res = await postJson<ClerkReply>("/api/clerk", { utterance: text, member_id: current.id });
        res.steps ??= [];
        if (!res.reply) throw new Error("The Clerk sent no reply. Try again.");
        const outcomes = res.steps.map((s) => s.outcome);
        await refresh();
        if (res.steps.some((s) => s.name === "call_vote" && s.ok)) playGavel();
        if (outcomes.includes("enacted") || outcomes.includes("defeated")) strike();
        if (res.budget_exhausted || res.steps.some((s) => s.budget_exhausted)) setNotice(res.reply);
        addLine("Clerk", res.reply, true);
        say(res.reply, res.steps.some((s) => BUSINESS.has(s.name)));
      } catch (err) {
        setPhase("idle");
        setNotice(err instanceof Error ? err.message : "The Clerk could not be reached. Try again.");
      }
    },
    [addLine, current, refresh, say, strike],
  );

  const toggleListening = useCallback(() => {
    unlockAudio();
    unlockSpeech();
    if (phase === "listening") {
      listener.current?.stop();
      return;
    }
    if (phase === "thinking") return;
    stopSpeaking();
    setNotice(null);
    setInterim("");
    const l = listen({
      onInterim: setInterim,
      onFinal: (t) => {
        listener.current = null;
        void send(t);
      },
      onError: (code) => {
        listener.current = null;
        setPhase("idle");
        setInterim("");
        const message = describeRecognitionError(code);
        if (message) setNotice(message);
        if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") setTyping(true);
      },
    });
    if (!l) {
      setVoiceIn(false);
      setTyping(true);
      return;
    }
    listener.current = l;
    setPhase("listening");
  }, [phase, send]);

  useEffect(() => () => listener.current?.abort(), []);

  const selectMember = (id: string) => {
    setSpeakingAs(id);
    rememberSpeaker(id);
  };

  const onDemoResult = useCallback(
    (spoken: string | null) => {
      void refresh();
      if (spoken) {
        addLine("Clerk", spoken, true);
        say(spoken, true);
        window.setTimeout(
          () => document.querySelector(".transcript p:last-of-type")?.scrollIntoView({ block: "center" }),
          50,
        );
      }
    },
    [addLine, refresh, say],
  );

  const label = phase === "listening" ? "Send" : phase === "thinking" ? "Wait" : "Speak";

  return (
    <>
      <InkFilter />
      {state.demoMode && (
        <DemoControls clock={state.household.clock} onResult={onDemoResult} onError={setNotice} />
      )}
      <Hemicycle
        members={members}
        speakerId={state.speakerId}
        speakingAs={current?.id ?? null}
        bill={state.bill}
        onSelect={selectMember}
      />
      <OrderPaper bill={state.bill} animateStamp={animateStamp} />

      <div className="transcript" aria-live="polite">
        {lines.length === 0 && phase !== "listening" && (
          <p className="interim">The House will come to order. Tap Speak and talk to the Clerk.</p>
        )}
        {lines.map((l) => (
          <p key={l.id}>
            <span className="who">{l.who}:</span> {l.text}
          </p>
        ))}
        {phase === "listening" && <p className="interim">{interim || "Listening…"}</p>}
        {phase === "thinking" && <p className="interim">The Clerk is consulting the records…</p>}
        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}
      </div>

      <div className={`talk${typing ? " talk--typing" : ""}`}>
        <div className="talk__inner">
          <div className="talk__row">
            {typing && (
              <form
                className="typebox"
                onSubmit={(e) => {
                  e.preventDefault();
                  unlockAudio();
                  unlockSpeech();
                  const t = draft;
                  setDraft("");
                  void send(t);
                }}
              >
                <label className="sr-only" htmlFor="say">
                  Message to the Clerk
                </label>
                <input
                  id="say"
                  type="text"
                  value={draft}
                  maxLength={400}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Speak as ${current?.name ?? "a member"}`}
                  autoComplete="off"
                />
                <button className="btn btn--primary" type="submit" disabled={phase === "thinking" || !draft.trim()}>
                  <span className="sr-only">Send</span>
                  <SendIcon />
                </button>
              </form>
            )}
            {voiceIn && (
              <button
                type="button"
                className="talk__button"
                data-state={phase}
                onClick={toggleListening}
                disabled={phase === "thinking" || !current}
                aria-label={phase === "listening" ? "Send what you said" : `Speak as ${current?.name ?? "a member"}`}
              >
                <MicIcon />
                <span>{label}</span>
              </button>
            )}
          </div>
          <div className="talk__under">
            <span>
              Speaking as <strong>{current?.name ?? "nobody"}</strong>
            </span>
            {voiceIn ? (
              <button type="button" className="linkish" onClick={() => setTyping((t) => !t)}>
                {typing ? "Hide keyboard" : "Type"}
              </button>
            ) : null}
          </div>
          {!voiceIn && (
            <p className="fineprint">
              Voice input is not available in this browser, so type instead. The Clerk still speaks replies aloud.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
