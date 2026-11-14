/** Energiestufen: 0 = ruhig, 1 = mittel, 2 = hoch, 3 = Höhepunkt. */
export type Energy = 0 | 1 | 2 | 3;

export const ENERGY_CLIPS: Record<Energy, string[]> = {
  0: [
    "Dance_FluidArc",
    "Dance_SideGlide",
    "Dance_JazzRebound",
    "Dance_HeelToe",
    "Dance_LiquidWave",
    "Dance_Waltz",
    "Dance_JazzSwing",
  ],
  1: [
    "Dance_Groove",
    "Dance_House",
    "Dance_Disco",
    "Dance_CrossStep",
    "Dance_PivotStep",
    "Dance_DiagonalStep",
    "Dance_HeelToe",
    "Dance_LatinSway",
  ],
  2: [
    "Dance_Techno",
    "Dance_Shuffle",
    "Dance_HipHop",
    "Dance_FrontmanDrive",
    "Dance_RobotGroove",
    "Dance_Robot",
    "Dance_FestivalBounce",
    "Dance_AfroPulse",
  ],
  3: [
    "Dance_FestivalBounce",
    "Dance_Shuffle",
    "Dance_TurnPhrase",
    "Dance_PowerHit",
    "Dance_Stomp",
    "Dance_RockDrive",
    "Dance_Techno",
  ],
};

/** Genre-Stichwort → Clips, die doppelt so oft gewählt werden. */
const GENRE_BIAS: Array<[RegExp, string[]]> = [
  [/rock|metal|punk|grunge/i, ["Dance_FrontmanDrive", "Dance_RockDrive", "Dance_Stomp", "Dance_PowerHit"]],
  [/latin|reggaeton|salsa|samba|bachata|afro/i, ["Dance_LatinSway", "Dance_AfroPulse", "Dance_HeelToe"]],
  [/jazz|soul|blues|swing|funk/i, ["Dance_JazzRebound", "Dance_JazzSwing", "Dance_Disco", "Dance_Waltz"]],
  [
    /techno|house|edm|electro|trance|drum|bass/i,
    ["Dance_Techno", "Dance_Robot", "Dance_RobotGroove", "Dance_Shuffle", "Dance_House"],
  ],
  [/hip ?hop|rap|trap|r&b/i, ["Dance_HipHop", "Dance_PopLock", "Dance_RobotGroove"]],
  [/disco|funk|dance|pop|schlager/i, ["Dance_Disco", "Dance_Groove", "Dance_FestivalBounce"]],
];

export function genreBias(genres: string[]): Set<string> {
  const out = new Set<string>();
  for (const g of genres) for (const [re, clips] of GENRE_BIAS) if (re.test(g)) clips.forEach((c) => out.add(c));
  return out;
}

export const IDLE_CLIP = "Idle_Breathe";
export const WAVE_CLIP = "Gesture_Wave";
