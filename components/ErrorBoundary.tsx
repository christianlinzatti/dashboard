"use client";

import { Component, type ReactNode } from "react";
import { report } from "@/lib/live/telemetry";

type Props = {
  fallback: ReactNode;
  children: ReactNode;
  onError?: (e: Error) => void;
  label?: string;
  /** Ändert sich dieser Wert nach einem Fehler, wird es neu versucht – ohne den Teilbaum vorher neu aufzubauen */
  resetKey?: string;
};

/**
 * Fängt Fehler in einem Teilbaum ab (z. B. 3D-Szene, einzelner Avatar), damit das Dashboard
 * weiterläuft. Zurücksetzen über einen neuen `key` (baut alles neu auf) oder `resetKey` (nur nach einem Fehler).
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
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
