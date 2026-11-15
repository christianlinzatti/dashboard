"use client";

import { Component, type ReactNode } from "react";
import { report } from "@/lib/live/telemetry";

type Props = { fallback: ReactNode; children: ReactNode; onError?: (e: Error) => void; label?: string };

/**
 * Fängt Fehler in einem Teilbaum ab (z. B. 3D-Szene, einzelner Avatar), damit das Dashboard
 * weiterläuft. Zurücksetzen über einen neuen `key` (z. B. beim Songwechsel).
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error(`Fehler in ${this.props.label ?? "Komponente"}:`, error.message);
    report("fehler", this.props.label ?? "Komponente", error.message);
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
