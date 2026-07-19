"use client";

// Thin client wrapper so the server-component layout can mount the assistant.

import { VectorIndicator } from "./vector-indicator";

export function VectorMount() {
  return <VectorIndicator />;
}
