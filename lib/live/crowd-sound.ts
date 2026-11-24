/**
 * Publikumsgeräusche aus dem Browser (WebAudio, ohne Audiodateien): Applaus am Songende (viele einzelne Klatscher
 * aus gefiltertem Rauschen, darunter ein Jubel-Rauschen und ein paar Pfiffe) und rhythmisches Zugabe-Klatschen.
 * Leise gemischt – Spotify bleibt die Hauptsache. Die Zeitpläne sind rein (testbar), das Abspielen dünn darüber.
 */

/** Gesamtlautstärke (0..1) */
export const CROWD_VOLUME = 0.22;

export type Clap = { at: number; gain: number; freq: number };

/** Applaus: Klatscher-Dichte schwillt an und klingt aus; deterministisch aus `seed` */
export function applauseSchedule(durationS: number, seed = 1): Clap[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const out: Clap[] = [];
  for (let t = 0; t < durationS;) {
    const u = t / durationS;
    const density = 18 + 60 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.6); // Klatscher pro Sekunde
    t += (0.5 + rnd()) / density;
    if (t >= durationS) break;
    out.push({ at: t, gain: (0.35 + 0.65 * rnd()) * (1 - Math.max(0, u - 0.7) / 0.3), freq: 1100 + rnd() * 1600 });
  }
  return out;
}

/** Zugabe-Klatschen: alle im Takt (zwei Schläge pro Sekunde), etwas unscharf, wird lauter */
export function encoreSchedule(durationS: number, seed = 7): Clap[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const out: Clap[] = [];
  for (let beat = 0; beat * 0.5 < durationS; beat++)
    for (let k = 0; k < 14; k++)
      out.push({
        at: beat * 0.5 + rnd() * 0.04,
        gain: (0.3 + 0.5 * rnd()) * Math.min(1, 0.4 + beat / 12),
        freq: 1000 + rnd() * 1400,
      });
  return out;
}

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

function playClaps(claps: Clap[], volume: number) {
  const a = audio();
  if (!a || !noise) return;
  const master = a.createGain();
  master.gain.value = volume;
  master.connect(a.destination);
  const t0 = a.currentTime + 0.05;
  for (const c of claps) {
    const src = a.createBufferSource();
    src.buffer = noise;
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = c.freq;
    bp.Q.value = 1.2;
    const g = a.createGain();
    const at = t0 + c.at;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(c.gain, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
    src.connect(bp).connect(g).connect(master);
    src.start(at, Math.random() * 0.8, 0.08);
  }
  return { a, master, t0 };
}

/** Applaus mit Jubel und ein paar Pfiffen (Dauer in Sekunden) */
export function playApplause(durationS = 6, volume = CROWD_VOLUME) {
  const r = playClaps(applauseSchedule(durationS, Math.floor(Math.random() * 1e6) + 1), volume);
  if (!r || !noise) return;
  const { a, master, t0 } = r;
  // Jubel: breites Rauschen, schwillt an und ab
  const roar = a.createBufferSource();
  roar.buffer = noise;
  roar.loop = true;
  const lp = a.createBiquadFilter();
  lp.type = "bandpass";
  lp.frequency.value = 900;
  lp.Q.value = 0.4;
  const rg = a.createGain();
  rg.gain.setValueAtTime(0, t0);
  rg.gain.linearRampToValueAtTime(0.35, t0 + durationS * 0.25);
  rg.gain.linearRampToValueAtTime(0, t0 + durationS);
  roar.connect(lp).connect(rg).connect(master);
  roar.start(t0);
  roar.stop(t0 + durationS + 0.1);
  // zwei, drei Pfiffe
  for (let i = 0; i < 3; i++) {
    const at = t0 + 0.6 + Math.random() * durationS * 0.6;
    const o = a.createOscillator();
    o.frequency.setValueAtTime(2400 + Math.random() * 600, at);
    o.frequency.linearRampToValueAtTime(3200 + Math.random() * 500, at + 0.25);
    const g = a.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.05, at + 0.03);
    g.gain.linearRampToValueAtTime(0, at + 0.45);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.5);
  }
}

/** Rhythmisches Klatschen („Zugabe!“) zwischen den Songs */
export function playEncoreClapping(durationS = 5, volume = CROWD_VOLUME) {
  playClaps(encoreSchedule(durationS), volume);
}
