"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

/** Markiert die Szene als fertig gerendert (für Playwright-Screenshots). */
export function ReadySignal() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    let raf = requestAnimationFrame(() => {
      invalidate();
      raf = requestAnimationFrame(() => document.body.setAttribute("data-stage-ready", "true"));
    });
    return () => {
      cancelAnimationFrame(raf);
      document.body.removeAttribute("data-stage-ready");
    };
  }, [invalidate]);
  return null;
}
