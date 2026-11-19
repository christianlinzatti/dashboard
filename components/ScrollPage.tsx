/**
 * Seiten fürs Handy (Einstellungen, Fernbedienung): eigene Scroll-Fläche. Das Dashboard sperrt Scrollen, Mauszeiger
 * und Markieren global (Kiosk) – hier wird wieder gescrollt und getippt wie auf einer normalen Webseite.
 */
export function ScrollPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-y-auto overscroll-contain [cursor:auto] select-text" data-testid="scroll-page">
      {children}
    </div>
  );
}
