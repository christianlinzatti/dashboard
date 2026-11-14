import type { SongStatic } from "../schema";
import { abendrot } from "./abendrot";
import { instrumental } from "./instrumental";
import { neonlicht } from "./neonlicht";

/** Fester „heute“-Stand für Demos (Countdowns bleiben in Screenshots gleich). */
export const DEMO_TODAY = "2026-11-14";

/** Demo-/Test-Kontexte, aufrufbar über /?demo=<name>&t=<ms> */
export const fixtures: Record<string, SongStatic> = {
  neonlicht,
  abendrot,
  instrumental,
};
