import { BeatTracker, type BeatState } from "./beat-tracker";
import { DropDetector, EnergyMeter } from "./dynamics";
import { bandPowers, clamp01, smooth, spectralFlux, toDb } from "./features";

export type MicFrame = {
  /** Audio-Zeit (s) */
  t: number;
  dt: number;
  bands: number[];
  energy: number;
  longEnergy: number;
  vocal: number;
  beat: boolean;
  drop: boolean;
  beatState: BeatState;
};

export type MicHandle = { stop(): void; resume(): Promise<void>; context: AudioContext };

const FFT = 2048;
const FRAME_MS = 10; // 100 Analysen pro Sekunde

/**
 * Startet die Mikrofon-Analyse (nur im Browser). Audio wird ausschließlich lokal ausgewertet,
 * nichts wird aufgezeichnet oder übertragen.
 */
export async function startMic(onFrame: (f: MicFrame) => void): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // Browser-Filter würden Musik verfälschen
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const ctx = new AudioContext({ latencyHint: "interactive" });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const db = new Float32Array(analyser.frequencyBinCount);
  const prev = new Float32Array(analyser.frequencyBinCount).fill(-100);
  const tracker = new BeatTracker(1000 / FRAME_MS);
  const meter = new EnergyMeter();
  const drops = new DropDetector();
  const bandMax = new Array(6).fill(1e-10) as number[];
  let fluxMean = 1;
  let vocal = 0;
  let lastT = ctx.currentTime;

  const timer = setInterval(() => {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime;
    const dt = Math.max(t - lastT, 0.001);
    lastT = t;
    analyser.getFloatFrequencyData(db);

    const flux = spectralFlux(db, prev, ctx.sampleRate, FFT);
    fluxMean = smooth(fluxMean, flux, dt, 3);
    const beat = tracker.push(flux / Math.max(fluxMean, 1e-6), t);

    const powers = bandPowers(db, ctx.sampleRate, FFT);
    const total = powers.reduce((a, b) => a + b, 0);
    const { energy, longEnergy } = meter.push(toDb(total), dt);
    // Bänder relativ zu ihrem eigenen (langsam fallenden) Maximum
    const bands = powers.map((p, i) => {
      bandMax[i] = Math.max(p, bandMax[i]! * Math.exp(-dt / 10));
      return clamp01(Math.sqrt(p / bandMax[i]!));
    });
    const bassRatio = (powers[0]! + powers[1]!) / Math.max(total, 1e-14);
    // Stimme: Mitten-Anteil (500–2000 Hz) bei ausreichender Energie
    const midRatio = (powers[2]! * 0.5 + powers[3]!) / Math.max(total, 1e-14);
    vocal = smooth(vocal, clamp01((midRatio - 0.05) * 6) * clamp01(energy * 1.5), dt, 0.08);
    const drop = drops.push(energy, longEnergy, bassRatio, t, dt);

    onFrame({ t, dt, bands, energy, longEnergy, vocal, beat, drop, beatState: tracker.state(t) });
  }, FRAME_MS);

  return {
    context: ctx,
    resume: () => ctx.resume(),
    stop() {
      clearInterval(timer);
      stream.getTracks().forEach((tr) => tr.stop());
      void ctx.close();
    },
  };
}
