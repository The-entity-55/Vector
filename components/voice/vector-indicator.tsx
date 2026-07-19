"use client";

// The passive status indicator for the "Vector" voice assistant. While a
// hands-free conversation is active it becomes a "tap to stop" button.

import { Loader2, Mic, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVectorAssistant, type VectorState } from "./use-vector-assistant";

const CONFIG: Record<
  Exclude<VectorState, "unsupported">,
  { label: string; dot: string; pulse: boolean; icon: React.ReactNode }
> = {
  listening: {
    label: "Say “vector”",
    dot: "bg-muted-foreground/60",
    pulse: false,
    icon: <Mic className="size-3.5" aria-hidden />,
  },
  activated: {
    label: "Listening…",
    dot: "bg-blue-500",
    pulse: true,
    icon: <Mic className="size-3.5" aria-hidden />,
  },
  thinking: {
    label: "Thinking…",
    dot: "bg-amber-500",
    pulse: true,
    icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />,
  },
  speaking: {
    label: "Speaking…",
    dot: "bg-emerald-500",
    pulse: true,
    icon: <Volume2 className="size-3.5" aria-hidden />,
  },
  error: {
    label: "Say “vector”",
    dot: "bg-muted-foreground/60",
    pulse: false,
    icon: <Mic className="size-3.5" aria-hidden />,
  },
};

export function VectorIndicator() {
  const { state, stopConversation } = useVectorAssistant();

  if (state === "unsupported") return null;

  // Any state other than passive wake-word listening means a hands-free
  // conversation is active and can be stopped.
  const conversing = state !== "listening";

  const content = (
    <>
      <span className="relative flex size-2.5 items-center justify-center">
        {CONFIG[state].pulse && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-75",
              CONFIG[state].dot,
            )}
          />
        )}
        <span
          className={cn("inline-flex size-2 rounded-full", CONFIG[state].dot)}
        />
      </span>
      {CONFIG[state].icon}
      <span>{CONFIG[state].label}</span>
      {conversing && (
        <>
          <span className="mx-0.5 h-3 w-px bg-border" aria-hidden />
          <X className="size-3.5" aria-hidden />
          <span>Stop</span>
        </>
      )}
    </>
  );

  const baseClasses = cn(
    "fixed bottom-4 right-4 z-50 select-none",
    "flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5",
    "text-xs text-muted-foreground shadow-sm backdrop-blur",
  );

  if (conversing) {
    return (
      <button
        type="button"
        onClick={stopConversation}
        aria-label="Stop the voice assistant"
        className={cn(
          baseClasses,
          "cursor-pointer transition-colors hover:bg-background hover:text-foreground",
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div aria-live="polite" className={cn(baseClasses, "pointer-events-none")}>
      {content}
    </div>
  );
}
