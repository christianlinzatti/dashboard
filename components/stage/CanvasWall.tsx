"use client";

import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { SRGBColorSpace, VideoTexture, type ShaderMaterial, type Texture } from "three";
import type { LightFrame } from "@/lib/stage/lights";
import { canvasLayout, CANVAS_VISIBILITY, WALL_H, WALL_W } from "@/lib/stage/canvas-wall";
import { TRUSS_Z } from "./layout";
import { useReleaseTexture } from "./release-texture";

export type WallCanvas = { url: string; kind: "video" | "image" | "gif" };

/**
 * Spotify Canvas auf der LED-Wand: das Loop-Video (meist hochkant) in voller Höhe in der Mitte, dahinter dasselbe Bild
 * abgedunkelt über die ganze Wand – wie ein Konzert-Screen. Die Helligkeit folgt den Lichtszenen.
 * Das Medium kommt über die eigene Domain (/api/canvas/video bzw. /demo), sonst dürfte WebGL es nicht lesen.
 */
export function CanvasWall({ canvas, lightsRef }: { canvas: WallCanvas; lightsRef: React.RefObject<LightFrame | null> }) {
  return canvas.kind === "video" ? (
    <VideoWall url={canvas.url} lightsRef={lightsRef} />
  ) : (
    <ImageWall url={canvas.url} lightsRef={lightsRef} />
  );
}

function ImageWall({ url, lightsRef }: { url: string; lightsRef: React.RefObject<LightFrame | null> }) {
  // lädt per Suspense mit – Screenshots warten auf das Bild
  const tex = useTexture(url, (t) => {
    t.colorSpace = SRGBColorSpace;
  });
  useReleaseTexture(tex, url);
  const img = tex.image as { width?: number; height?: number } | undefined;
  return <Panels tex={tex} aspect={img?.width && img.height ? img.width / img.height : 9 / 16} lightsRef={lightsRef} />;
}

function VideoWall({ url, lightsRef }: { url: string; lightsRef: React.RefObject<LightFrame | null> }) {
  const [state, setState] = useState<{ tex: VideoTexture; aspect: number } | null>(null);

  // Video und Textur im Effekt anlegen und wieder freigeben (auch beim doppelten Mount im Entwicklungsmodus)
  useEffect(() => {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    const tex = new VideoTexture(video);
    tex.colorSpace = SRGBColorSpace;
    const onMeta = () =>
      setState({ tex, aspect: video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 9 / 16 });
    video.addEventListener("loadedmetadata", onMeta);
    void video.play().catch(() => undefined); // stumm: Autoplay ist erlaubt
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.pause();
      video.removeAttribute("src");
      video.load(); // Puffer freigeben (Pi)
      tex.dispose();
      setState(null);
    };
  }, [url]);

  return state ? <Panels tex={state.tex} aspect={state.aspect} lightsRef={lightsRef} /> : null;
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAGMENT = /* glsl */ `
  uniform sampler2D uTex; uniform float uOpacity; uniform float uDim; uniform float uSoft;
  uniform vec2 uRepeat; uniform vec2 uOffset;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uTex, vUv * uRepeat + uOffset).rgb * uDim;
    // Ränder weich ausblenden (die Füllung stärker als das Hauptbild)
    float edge = smoothstep(0.0, uSoft, vUv.x) * smoothstep(1.0, 1.0 - uSoft, vUv.x)
      * smoothstep(0.0, uSoft, vUv.y) * smoothstep(1.0, 1.0 - uSoft, vUv.y);
    gl_FragColor = vec4(c, uOpacity * edge);
  }
`;

function Panels({ tex, aspect, lightsRef }: { tex: Texture; aspect: number; lightsRef: React.RefObject<LightFrame | null> }) {
  const layout = useMemo(() => canvasLayout(aspect), [aspect]);
  const main = useRef<ShaderMaterial>(null);
  const fill = useRef<ShaderMaterial>(null);
  const opacity = useRef(-1);

  useFrame(() => {
    const f = lightsRef.current;
    if (!f) return;
    const target = CANVAS_VISIBILITY[f.scene] * (0.85 + 0.15 * f.signal.pulse);
    // erstes Bild gleich in voller Helligkeit (die Wand wechselt ohnehin mit dem Song), danach weich nachführen
    opacity.current = opacity.current < 0 ? target : opacity.current + (target - opacity.current) * 0.08;
    if (main.current) main.current.uniforms.uOpacity!.value = opacity.current;
    if (fill.current) fill.current.uniforms.uOpacity!.value = opacity.current;
  });

  // je Textur und Seitenverhältnis einmal: neue Objekte in `args` hießen bei jedem Rendern ein neues Material
  // (neue Shader, Deckkraft wieder 0)
  const [fillArgs, mainArgs] = useMemo(() => {
    const uniforms = (repeat: [number, number], offset: [number, number], dim: number, soft: number) => ({
      uTex: { value: tex },
      uOpacity: { value: 0 },
      uDim: { value: dim },
      uSoft: { value: soft },
      uRepeat: { value: repeat },
      uOffset: { value: offset },
    });
    const args = (u: ReturnType<typeof uniforms>) => [{ uniforms: u, vertexShader: VERTEX, fragmentShader: FRAGMENT }] as const;
    return [
      layout.fill ? args(uniforms(layout.fill.repeat, layout.fill.offset, 0.28, 0.12)) : undefined,
      args(uniforms(layout.main.repeat, layout.main.offset, 0.92, layout.fill ? 0.03 : 0.1)),
    ];
  }, [tex, layout]);

  return (
    <group position={[0, 2.3, TRUSS_Z - 0.47]}>
      {layout.fill && (
        <mesh>
          <planeGeometry args={[WALL_W, WALL_H]} />
          <shaderMaterial
            key={`f${tex.uuid}${aspect}`}
            ref={fill}
            transparent
            depthWrite={false}
            toneMapped={false}
            args={fillArgs}
          />
        </mesh>
      )}
      <mesh position-z={0.01}>
        <planeGeometry args={[layout.main.width, layout.main.height]} />
        <shaderMaterial
          key={`m${tex.uuid}${aspect}`}
          ref={main}
          transparent
          depthWrite={false}
          toneMapped={false}
          args={mainArgs}
        />
      </mesh>
    </group>
  );
}
