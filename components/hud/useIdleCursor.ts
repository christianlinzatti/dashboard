"use client";

import { useEffect, useRef } from "react";

/** so lange nach der letzten Mausbewegung bleibt der Zeiger sichtbar */
export const CURSOR_IDLE_MS = 3000;

/**
 * Mauszeiger auf dem Kiosk: erscheint, sobald die Maus bewegt wird (Song liken, Künstlern folgen, Steuerleiste), und
 * verschwindet nach kurzer Ruhe wieder – wie bei einem Videoplayer. Ohne Maus (Touchscreen) bleibt er aus dem Bild.
 * Schaltet nur eine Klasse am Element, kein Neuzeichnen von React.
 */
export function useIdleCursor<T extends HTMLElement>(ms = CURSOR_IDLE_MS) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => el.classList.add("cursor-none");
    const show = (e: PointerEvent) => {
      // Berührungen zeigen keinen Zeiger
      if (e.pointerType === "touch") return;
      el.classList.remove("cursor-none");
      clearTimeout(timer);
      timer = setTimeout(hide, ms);
    };
    hide();
    el.addEventListener("pointermove", show);
    el.addEventListener("pointerdown", show);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("pointermove", show);
      el.removeEventListener("pointerdown", show);
    };
  }, [ms]);
  return ref;
}
