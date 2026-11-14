import { create } from "qrcode";
import { useMemo } from "react";

/** QR-Code als SVG (synchron erzeugt, ohne Canvas – auch in Screenshots stabil). */
export function QrCode({ text, size, label }: { text: string; size: string; label: string }) {
  const { n, path } = useMemo(() => {
    const m = create(text, { errorCorrectionLevel: "M" }).modules;
    let d = "";
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    return { n: m.size + 4, path: d };
  }, [text]);
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={n} height={n} fill="#fff" rx={1} />
      <path d={path} fill="#000" />
    </svg>
  );
}
