"use client";

import { useState } from "react";
import type { ShaderMaterialParameters } from "three";

/** gleiche Schlüssel, gleiche Werte (Shader-Texte als Zeichenkette, Uniforms als dasselbe Objekt) */
export function sameParams(a: ShaderMaterialParameters, b: ShaderMaterialParameters) {
  const ka = Object.keys(a) as Array<keyof ShaderMaterialParameters>;
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/**
 * Stabile `args` für `<shaderMaterial args={…} />`. React Three Fiber vergleicht jedes Element von `args` mit `!==` –
 * ein Objekt-Literal im JSX ist bei jedem Rendern neu, und R3F baut das Material dann neu: neues Programm, neu
 * übersetzte Shader, mitten in der Show (beim Drop sichtbar als Ruckler). Dieser Hook liefert dasselbe Array, solange
 * Shader-Text und Uniforms gleich sind.
 */
export function useShaderArgs(params: ShaderMaterialParameters): [ShaderMaterialParameters] {
  const [state, setState] = useState(() => ({ params, args: [params] as [ShaderMaterialParameters] }));
  if (sameParams(state.params, params)) return state.args;
  // abgeleiteter Zustand aus dem vorigen Rendern (von React so vorgesehen): sofort mit dem neuen Stand weiter
  const next = { params, args: [params] as [ShaderMaterialParameters] };
  setState(next);
  return next.args;
}
