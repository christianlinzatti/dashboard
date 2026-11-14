import type { SongStatic } from "../schema";
import { abendrot } from "./abendrot";
import { instrumental } from "./instrumental";
import { neonlicht } from "./neonlicht";

/** Demo-/Test-Kontexte, aufrufbar über /?demo=<name>&t=<ms> */
export const fixtures: Record<string, SongStatic> = {
  neonlicht,
  abendrot,
  instrumental,
};
