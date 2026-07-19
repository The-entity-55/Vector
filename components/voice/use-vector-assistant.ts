"use client";

// The "Vector" hands-free voice assistant engine.
//
// Split of responsibilities:
//   - Web Speech API (SpeechRecognition): continuous, local, free background
//     listening for the wake word "vector" and transcription of the command.
//   - Convex actions (voice.reply / voice.speak): the brain (DeepSeek chat) +
//     the voice (Deepgram Aura TTS). API keys live only on the Convex
//     deployment, never in the browser.
//
// Passive listening costs nothing until "vector" is heard; only then do we make
// the backend calls. Chromium-only (SpeechRecognition); other browsers stay
// in the "unsupported" state and the assistant simply never arms.

import { useAction } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";

// Wake word the user says to activate the assistant.
const WAKE_WORD = "vector";

// Spoken phrases that end the hands-free conversation and return to passive
// wake-word listening. Matched as a substring of the finalized command.
const STOP_PHRASES = [
  "stop listening",
  "stop conversation",
  "goodbye vector",
  "bye vector",
  "that's all",
  "thats all",
  "stop vector",
];

// Silence (ms) after the last speech result before the command is finalized.
const SILENCE_MS = 1500;

export type VectorState =
  | "unsupported"
  | "listening"
  | "activated"
  | "thinking"
  | "speaking"
  | "error";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Minimal shape of the SpeechRecognition instance we rely on. The DOM lib types
// exist in Chromium but we access the constructor defensively off `window`.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVectorAssistant() {
  const requestReply = useAction(api.voice.reply);
  const requestSpeech = useAction(api.voice.speak);

  // Router + current org slug let Vector navigate the app when it returns a
  // navigation directive. Kept in refs so the async finalize callback reads the
  // latest values without being re-created on every route change. The refs are
  // synced in an effect (never mutated during render).
  const router = useRouter();
  const params = useParams<{ orgSlug: string }>();
  const routerRef = useRef(router);
  const orgSlugRef = useRef(params.orgSlug);
  useEffect(() => {
    routerRef.current = router;
    orgSlugRef.current = params.orgSlug;
  }, [router, params.orgSlug]);

  const [state, setState] = useState<VectorState>("listening");

  // A ref mirror of `state` so async callbacks read the latest value without
  // being re-created on every transition.
  const stateRef = useRef<VectorState>("listening");
  const setPhase = useCallback((next: VectorState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandRef = useRef<string>("");
  const historyRef = useRef<ChatMessage[]>([]);
  const armedRef = useRef<boolean>(false);
  const shouldListenRef = useRef<boolean>(false);
  // True from the moment the wake word is heard until the user stops the
  // session. While conversing, follow-ups are accepted with no wake word — this
  // is the hands-free mode.
  const conversingRef = useRef<boolean>(false);
  const unsupportedToastShownRef = useRef<boolean>(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Release the object URL backing the last spoken audio, if any.
  const revokeAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // Safely (re)start recognition; Chrome throws if start() is called while
  // already running, so we swallow that.
  const safeStart = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.start();
    } catch {
      // already started — ignore
    }
  }, []);

  // Resume mic capture after a reply. While a conversation is active we return
  // to the "activated" state so the next utterance is taken as a command with no
  // wake word. Otherwise we fall back to passive wake-word listening.
  const resumeListening = useCallback(() => {
    if (!shouldListenRef.current) return;
    setPhase(conversingRef.current ? "activated" : "listening");
    safeStart();
  }, [safeStart, setPhase]);

  // End the hands-free session and return to passive wake-word listening.
  const stopConversation = useCallback(() => {
    conversingRef.current = false;
    commandRef.current = "";
    historyRef.current = [];
    clearSilenceTimer();
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
    revokeAudioUrl();
    console.log("[vector] conversation stopped — back to wake-word listening");
    if (shouldListenRef.current) {
      setPhase("listening");
      safeStart();
    } else {
      setPhase("listening");
    }
  }, [clearSilenceTimer, revokeAudioUrl, safeStart, setPhase]);

  // Finalize the buffered command: send to the LLM, speak the reply, then resume.
  const finalizeCommand = useCallback(async () => {
    clearSilenceTimer();
    const command = commandRef.current.trim();
    commandRef.current = "";

    // Nothing meaningful captured yet — keep the session open and keep listening.
    if (!command) {
      resumeListening();
      return;
    }

    // Spoken stop request — end the hands-free session.
    const lowerCommand = command.toLowerCase();
    if (STOP_PHRASES.some((phrase) => lowerCommand.includes(phrase))) {
      console.log("[vector] stop phrase heard — ending conversation");
      stopConversation();
      return;
    }

    // Pause recognition so the assistant doesn't hear itself speak.
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    setPhase("thinking");
    try {
      const history = historyRef.current;
      const replyResult = await requestReply({ prompt: command, history });

      if (!replyResult.ok) {
        toast.error(replyResult.error);
        resumeListening();
        return;
      }
      const reply = replyResult.text.trim();

      // Vector asked to navigate: push the route now (relative path is scoped to
      // the current org). Speaking the confirmation continues below.
      if (replyResult.navigate) {
        const slug = orgSlugRef.current;
        if (slug) {
          const target = `/${slug}${replyResult.navigate.path}`;
          console.log("[vector] navigating to", target);
          routerRef.current.push(target);
        }
      }

      historyRef.current = [
        ...history,
        { role: "user", content: command },
        { role: "assistant", content: reply },
      ];

      setPhase("speaking");
      const speechResult = await requestSpeech({ text: reply });
      if (!speechResult.ok) {
        toast.error(speechResult.error);
        resumeListening();
        return;
      }

      revokeAudioUrl();
      const blob = new Blob([speechResult.audio], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      const resume = () => {
        audioRef.current = null;
        revokeAudioUrl();
        resumeListening();
      };
      audio.onended = resume;
      audio.onerror = resume;
      await audio.play();
    } catch (err) {
      console.error("[vector] assistant error", err);
      toast.error("Voice assistant hit an error.");
      resumeListening();
    }
  }, [
    clearSilenceTimer,
    requestReply,
    requestSpeech,
    resumeListening,
    revokeAudioUrl,
    setPhase,
    stopConversation,
  ]);

  // Handle a recognition result: detect the wake word, then buffer the command.
  const handleResult = useCallback(
    (event: SpeechRecognitionResultEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const alt = event.results[i]?.[0];
        if (alt?.transcript) transcript += alt.transcript;
      }
      const lower = transcript.toLowerCase();
      if (transcript.trim()) {
        console.log("[vector] heard:", JSON.stringify(lower));
      }

      // Not yet activated: wait for the wake word.
      if (stateRef.current === "listening") {
        const idx = lower.indexOf(WAKE_WORD);
        if (idx === -1) return;

        // Activate and capture anything already spoken after the wake word.
        // Enter hands-free conversation mode: from now until the user stops it,
        // follow-ups are accepted without repeating the wake word.
        console.log("[vector] wake word detected — conversation started");
        conversingRef.current = true;
        setPhase("activated");
        const after = transcript.slice(idx + WAKE_WORD.length);
        commandRef.current = after.replace(/^[\s,.:;-]+/, "");

        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(finalizeCommand, SILENCE_MS);
        return;
      }

      // Already activated: keep buffering and reset the silence timer. The wake
      // word is optional here — strip it only if the user happens to repeat it.
      if (stateRef.current === "activated") {
        const idx = lower.lastIndexOf(WAKE_WORD);
        const text = idx === -1 ? transcript : transcript.slice(idx + WAKE_WORD.length);
        commandRef.current = text.replace(/^[\s,.:;-]+/, "");
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(finalizeCommand, SILENCE_MS);
      }
    },
    [clearSilenceTimer, finalizeCommand, setPhase],
  );

  // Arm the assistant. Deferred until a user gesture so the browser permits
  // mic capture (autoplay/mic policies block on-load capture).
  const arm = useCallback(() => {
    if (armedRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    armedRef.current = true;
    shouldListenRef.current = true;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = handleResult;
    rec.onerror = (e) => {
      const err = e?.error;
      // "no-speech"/"aborted" are routine background events; ignore them.
      if (err === "no-speech" || err === "aborted") return;
      console.warn("[vector] recognition error:", err);
      if (err === "not-allowed" || err === "service-not-allowed") {
        shouldListenRef.current = false;
        toast.error(
          "Microphone blocked. Allow mic access for this site, then reload.",
        );
      } else if (err === "audio-capture") {
        toast.error("No microphone found.");
      }
    };
    rec.onend = () => {
      // Chrome stops periodically; auto-restart while we should be listening
      // and not mid-response.
      if (
        shouldListenRef.current &&
        (stateRef.current === "listening" || stateRef.current === "activated")
      ) {
        safeStart();
      }
    };
    recognitionRef.current = rec;
    setPhase("listening");
    console.log("[vector] armed — listening for the wake word");
    safeStart();
  }, [handleResult, safeStart, setPhase]);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      stateRef.current = "unsupported";
      // Feature detection of a platform API (SpeechRecognition) that isn't
      // available during SSR, so it must run in an effect after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("unsupported");
      if (!unsupportedToastShownRef.current) {
        unsupportedToastShownRef.current = true;
        toast("Hands-free voice needs Chrome or Edge.");
      }
      return;
    }

    // Try to arm immediately — Chrome's SpeechRecognition.start() surfaces the
    // mic-permission prompt on its own and usually works without a prior
    // gesture. If the browser blocks it, the gesture listeners below arm on the
    // first click/keypress as a fallback.
    arm();
    const onGesture = () => arm();
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      shouldListenRef.current = false;
      clearSilenceTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      // Reset the arm guard so a remount (e.g. React Strict Mode's
      // mount→unmount→remount in dev) can recreate recognition. Without this,
      // arm() would early-return on remount and the assistant would silently
      // never listen.
      armedRef.current = false;
      conversingRef.current = false;
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        try {
          audio.pause();
        } catch {
          // ignore
        }
        audioRef.current = null;
      }
      revokeAudioUrl();
    };
  }, [arm, clearSilenceTimer, revokeAudioUrl]);

  return { state, stopConversation };
}
