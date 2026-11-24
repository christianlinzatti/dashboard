"use client";

import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { countdown, formatConcertDate, todayLocal } from "@/lib/concerts/display";
import { reminderStore, upcomingReminders } from "@/lib/concerts/reminders";

/**
 * Startbildschirm: eine Zeile mit dem nächsten gemerkten Konzert im Umkreis („Demnächst live: Wanda · Sa, 19. Dez. ·
 * Wiener Stadthalle · in 25 Tagen“), dazu wie viele weitere. Eine Zeile, damit Rückblick und Liste weiter passen.
 */
export function ConcertReminder() {
  const list = useStore(reminderStore, (s) => s.list);
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const t = todayLocal();
    reminderStore.getState().hydrate(t);
    const id = setTimeout(() => setToday(t), 0);
    return () => clearTimeout(id);
  }, []);
  if (!today) return null;
  const upcoming = upcomingReminders(list, today);
  const next = upcoming[0];
  if (!next) return null;
  return (
    <p
      className="max-w-[92vw] rounded-full bg-white/10 px-[2vmin] py-[0.8vmin] text-[clamp(12px,2vmin,20px)]"
      data-testid="concert-reminder"
    >
      <span className="font-semibold text-[#ff9de6]">Demnächst live:</span> {next.artistName} ·{" "}
      {formatConcertDate(next.date, today)} · {next.venue || next.city}
      {next.venue && next.city ? `, ${next.city}` : ""} · {countdown(next.date, today)}
      {next.soldOut ? " · ausverkauft" : ""}
      {upcoming.length > 1 && <span className="text-white/60"> · +{upcoming.length - 1} weitere</span>}
    </p>
  );
}
