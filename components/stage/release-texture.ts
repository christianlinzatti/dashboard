"use client";

import { useTexture } from "@react-three/drei";
import { useEffect } from "react";
import type { Texture } from "three";

/**
 * Gibt eine per `useTexture` geladene Textur wieder frei, wenn die Komponente verschwindet (Wandfoto wechselt, neuer
 * Song): Grafikspeicher und Lade-Cache. Die Bühne behält ihren Grafikkontext über den ganzen Abend – ohne das
 * sammelten sich alle Fotos des Abends im Grafikspeicher (auf dem Pi endet das im Kontextverlust).
 */
export function useReleaseTexture(tex: Texture, url: string) {
  useEffect(
    () => () => {
      tex.dispose();
      useTexture.clear(url);
    },
    [tex, url],
  );
}
