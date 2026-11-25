"use client";

import { useEffect } from "react";
import { settings } from "@/lib/settings";
import { deviceSettingsSchema, sharedOf } from "@/lib/settings-sync";

/** so oft holt ein Gerät den Stand aus dem Konto (Änderungen vom Handy erreichen den Kiosk) */
export const SYNC_POLL_MS = 120_000;
/** eigene Änderungen gesammelt hochladen (mehrere Klicks hintereinander = ein Aufruf) */
const UPLOAD_DELAY_MS = 1500;

/**
 * Geräte-Einstellungen mit dem Konto abgleichen: beim Start und alle zwei Minuten (und wenn die Seite wieder sichtbar
 * wird) den Stand holen und übernehmen, wenn er jünger ist; eigene Änderungen kurz danach hochladen. Ohne Anmeldung
 * (401) oder ohne Netz bleibt alles lokal wie bisher.
 */
export function useSettingsSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    /** jüngster Stand, den das Konto kennt (eigener Upload oder gelesen) */
    let known = 0;
    let upload: ReturnType<typeof setTimeout> | undefined;

    const pull = async () => {
      try {
        const r = await fetch("/api/prefs", { cache: "no-store" });
        if (!r.ok || !alive) return;
        const d = deviceSettingsSchema.safeParse(((await r.json()) as { device?: unknown }).device);
        if (!d.success) return;
        known = Math.max(known, d.data.at);
        settings.getState().applyRemote(d.data.settings, d.data.at);
      } catch {
        /* offline: lokal weiter */
      }
    };
    const push = async () => {
      const s = settings.getState();
      if (s.changedAt <= known) return;
      const at = s.changedAt;
      try {
        const r = await fetch("/api/prefs", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ device: { settings: sharedOf(s), at } }),
        });
        if (r.ok) known = Math.max(known, at);
      } catch {
        /* nächster Versuch bei der nächsten Änderung oder dem nächsten Abgleich */
      }
    };

    // erst holen, dann eigene (jüngere) Änderungen hochladen
    void pull().then(push);
    const unsub = settings.subscribe((s, prev) => {
      if (s.changedAt === prev.changedAt || s.changedAt <= known) return;
      clearTimeout(upload);
      upload = setTimeout(() => void push(), UPLOAD_DELAY_MS);
    });
    const poll = setInterval(() => void pull().then(push), SYNC_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      unsub();
      clearInterval(poll);
      clearTimeout(upload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
