import type { Finding } from "@/lib/debug/diagnose";

const COLOR: Record<Finding["level"], string> = {
  ok: "text-emerald-300",
  info: "text-white/80",
  warnung: "text-amber-300",
  fehler: "text-red-300",
};

/** Kurzdiagnose als Liste (Debug-Panel, /debug) */
export function Findings({ items }: { items: Finding[] }) {
  return (
    <ul className="space-y-1 font-sans text-xs" data-testid="debug-findings">
      {items.map((f) => (
        <li key={f.label} className={COLOR[f.level]} data-level={f.level}>
          <span className="font-bold">{f.label}:</span> {f.value}
        </li>
      ))}
    </ul>
  );
}
