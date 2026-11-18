"use client";

import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import {
  AnimationMixer,
  Box3,
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type AnimationAction,
  type Group,
  type Material,
  type MeshStandardMaterial,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { avatarById } from "@/lib/avatars/catalog";
import { materialRole, outfitById } from "@/lib/avatars/outfits";
import { IDLE_CLIP } from "@/lib/dance/clips";
import { fallbackFor } from "@/lib/dance/mixamo";
import { loadedMixamo } from "@/lib/dance/mixamo-loader";
import { bowAngleAt, layersAt, type Layer } from "@/lib/dance/evaluate";
import { CLOSED, lipsyncTracks, mouthAt } from "@/lib/dance/lipsync";
import type { Choreography } from "@/lib/dance/plan";
import type { CastMember, SongStatic } from "@/lib/song-context/schema";
import { ErrorBoundary } from "../ErrorBoundary";
import { TARGET_HEIGHT, type Frame } from "./types";
import type { Vec2 } from "@/lib/dance/formations";
import { Guitar } from "./Band";
import { addMicrophone, dressUp } from "./Accessories";
import { lookFor, lookSeed } from "@/lib/avatars/looks";

/** Bandmitglied: fester Platz hinten, eine Animation im Songtakt, ggf. Instrument in der Hand */
export type BandPart = { clip: string; position: Vec2; lift?: number; guitar?: boolean };

type AvatarProps = {
  member: CastMember;
  song: SongStatic;
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  band?: BandPart;
};

/** Mund zum Singen (in Knochen-Einheiten des Modells: Kopf ≈ 0,13 breit) */
const MOUTH_GEOMETRY = new CircleGeometry(0.026, 24);
const MOUTH_MATERIAL = new MeshBasicMaterial({ color: "#3a0d18" });

/** Comic-Mund formen: runder Mund schmaler, breiter flacher; das gemalte Lächeln weicht dem offenen Mund. */
function shapeMouth(mouth: Mesh, smile: Object3D, open: number, round: number) {
  mouth.visible = open > 0;
  mouth.scale.set(1 - 0.4 * round, Math.max(0.12, open), 1);
  smile.scale.setScalar(open > 0 ? 0.001 : 1);
}

const AXIS = new Vector3();
const Q_ROOT = new Quaternion();
const Q_PARENT = new Quaternion();
const Q_BEND = new Quaternion();

/**
 * Oberkörper nach vorn beugen: Drehung um die Links-rechts-Achse des Modells, in den lokalen Raum jedes
 * Rückenglieds umgerechnet (die Knochen haben eigene Achsen). Positiv = Kopf Richtung Publikum (+z).
 */
function bendForward(root: Object3D, bones: Object3D[], angle: number) {
  root.updateMatrixWorld(true);
  root.getWorldQuaternion(Q_ROOT);
  for (const b of bones) {
    b.parent!.getWorldQuaternion(Q_PARENT);
    AXIS.set(1, 0, 0).applyQuaternion(Q_ROOT).applyQuaternion(Q_PARENT.invert());
    b.quaternion.premultiply(Q_BEND.setFromAxisAngle(AXIS, angle / bones.length));
    b.updateMatrixWorld(true);
  }
}

/** Ein Avatar; scheitert das Laden (z. B. Netzwerk), fehlt nur dieser Tänzer – die Bühne läuft weiter. */
export function Avatar(props: AvatarProps) {
  const info = avatarById.get(props.member.avatarId);
  if (!info) return null;
  return (
    <ErrorBoundary fallback={null} label={`Avatar ${info.id}`}>
      <AvatarModel url={info.url} {...props} />
    </ErrorBoundary>
  );
}

function AvatarModel({ url, member, song, choreo, frameRef, band }: AvatarProps & { url: string }) {
  const { scene, animations } = useGLTF(url);
  const group = useRef<Group>(null);
  const ledsTouched = useRef(false);

  // Look (Zubehör, Statur): Künstler immer gleich, Crew je Song anders; Sänger halten ein Mikrofon
  const isBand = !!band;
  const look = useMemo(
    () => lookFor(lookSeed({ avatarId: member.avatarId, artistId: member.artistId }, song.trackKey, isBand)),
    [member.avatarId, member.artistId, song.trackKey, isBand],
  );
  const sings = !isBand && !!member.artistId;
  const { root, mixer, leds, dyed, spine, smile, mouth, extras } = useMemo(() => {
    const model = cloneSkinned(scene) as Group;
    // Outfit: Anzug, Rüstung und Leuchtstreifen umfärben (Materialien sind zwischen Kopien geteilt → erst kopieren)
    const outfit = member.outfit ? outfitById.get(member.outfit) : undefined;
    const dyed: Material[] = [];
    if (outfit || member.trim) {
      model.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const recolor = (m: Material) => {
          const role = materialRole(m.name);
          const color = role === "trim" ? member.trim : role && outfit ? outfit[role] : undefined;
          if (!color || !("color" in m)) return m;
          const copy = m.clone() as MeshStandardMaterial;
          copy.color.set(color);
          // Leuchtstreifen leuchten in ihrer Farbe (Stärke wie im Original)
          if (role === "trim" && copy.emissive) copy.emissive.set(color);
          dyed.push(copy);
          return copy;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolor) : recolor(mesh.material);
      });
    }
    model.updateMatrixWorld(true); // Bone-Matrizen aktualisieren, sonst ist die Skinned-Bounding-Box falsch
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    // Statur aus dem Look: etwas größer oder kleiner als die Normalgröße
    const scale = (TARGET_HEIGHT / Math.max(size.y, 0.001)) * look.height;
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    // LED-Gesicht: Balken (Stimme) und Augen (Beat)
    const leds = {
      // LED-Gesicht (5 Balken) oder Visier (3 Pegel) – beide zeigen den Gesang als Balken
      bars: [
        ...[0, 1, 2, 3, 4].map((i) => model.getObjectByName(`FaceLedBar${i}`)),
        ...[0, 1, 2].map((i) => model.getObjectByName(`FaceMeter${i}`)),
      ].filter((b): b is Object3D => !!b),
      eyes: ["FaceLedEyeLeft", "FaceLedEyeRight"].map((n) => model.getObjectByName(n)).filter((b): b is Object3D => !!b),
    };
    // Comic-Gesicht: gemaltes Lächeln; zum Singen kommt ein Mund dazu (dunkle Ellipse am Lächeln-Knochen)
    const smile = model.getObjectByName("FaceSmile") ?? undefined;
    let mouth: Mesh | undefined;
    if (smile?.parent) {
      // am Kopf auf Höhe des Lächelns (nicht am Lächeln selbst – das wird beim Singen ausgeblendet)
      mouth = new Mesh(MOUTH_GEOMETRY, MOUTH_MATERIAL);
      mouth.position.copy(smile.position).add(new Vector3(0, -0.004, 0.006));
      mouth.visible = false;
      smile.parent.add(mouth);
    }
    // Rücken für die Verbeugung (zwei Glieder teilen sich die Beugung)
    const spine = ["Spine", "Chest"].map((n) => model.getObjectByName(n)).filter((b): b is Object3D => !!b);
    // Zubehör nach dem Look (Hut, Kopfhörer, Brille) und das Mikrofon für Sänger – in der Grundhaltung angepasst
    const outfitColors = outfit ? [outfit.suit, outfit.armor] : [];
    const palette = [member.trim, ...outfitColors, "#1d1d24", "#e9e3d6", song.album.palette.accent].filter(
      (c): c is string => !!c,
    );
    const extras = dressUp(model, look, {
      color: palette[Math.floor(look.tint * palette.length)] ?? "#1d1d24",
      accent: member.trim ?? song.album.palette.accent,
      comic: !!smile,
    });
    if (sings) addMicrophone(model, extras);
    return { root: model, mixer: new AnimationMixer(model), leds, dyed, spine, smile, mouth, extras };
  }, [scene, member.outfit, member.trim, look, sings, song.album.palette.accent]);
  useEffect(
    () => () => {
      extras.geometries.forEach((g) => g.dispose());
      extras.materials.forEach((m) => m.dispose());
    },
    [extras],
  );
  // Lippensynchron: Mundbewegung dieses Avatars aus den Lyrics (Feature-Songs: der jeweilige Sänger)
  const lipTrack = useMemo(() => {
    const byArtist = new Map(song.cast.filter((c) => c.artistId).map((c) => [c.artistId!, c.avatarId]));
    return lipsyncTracks(song, (a) => (a ? byArtist.get(a) : undefined)).get(member.avatarId);
  }, [song, member.avatarId]);
  useEffect(() => () => dyed.forEach((m) => m.dispose()), [dyed]);
  const clipSet = useMemo(() => new Set(animations.map((a) => a.name)), [animations]);

  const actions = useRef(new Map<string, AnimationAction>());
  useEffect(() => {
    const map = actions.current;
    return () => {
      mixer.stopAllAction();
      map.clear();
    };
  }, [mixer]);

  const action = (name: string): AnimationAction | undefined => {
    let a = actions.current.get(name);
    if (!a) {
      // eingebaut, sonst geladener Mixamo-Clip; fehlt er (noch), tanzt der Avatar den Ersatz-Clip
      const clip = animations.find((c) => c.name === name) ?? loadedMixamo(name);
      if (!clip) {
        const fb = fallbackFor(name);
        return fb ? action(fb) : undefined;
      }
      a = mixer.clipAction(clip);
      a.play();
      actions.current.set(name, a);
    }
    return a;
  };

  // Clip-Ebenen aus dem Plan setzen (zustandslos: gleiche Songzeit → gleiche Pose)
  useFrame(() => {
    const f = frameRef.current;
    const layers: Layer[] = !f.playing
      ? [{ clip: IDLE_CLIP, time: performance.now() / 1000, weight: 1 }]
      : band
        ? // Band: spielt durchgehend im Songtakt (Clips sind auf 120 BPM normiert)
          [{ clip: band.clip, time: Math.max(0, (f.t / 1000) * choreo.timeScale), weight: 1 }]
        : layersAt(choreo, member.avatarId, f.t, { anchorMs: f.anchorMs, dropMs: f.dropMs, clipsOf: () => clipSet });
    for (const a of actions.current.values()) a.setEffectiveWeight(0);
    for (const l of layers) {
      const a = action(l.clip) ?? action(IDLE_CLIP);
      if (!a) continue;
      const d = a.getClip().duration || 1;
      a.enabled = true;
      a.setEffectiveWeight(l.weight);
      a.time = l.time % d;
    }
    mixer.update(0);

    // Lippensynchron (nach der Animation): Silben aus den Lyrics, mit Mikrofon zusätzlich nach der Lautstärke
    const lip = f.playing && !band ? mouthAt(lipTrack, f.t) : CLOSED;
    let open = lip.open;
    if (f.micActive) {
      const focusVocal = !f.focus || f.focus === member.avatarId ? f.vocal : f.vocal * 0.3;
      // gemessener Gesang: Silben werden lauter/leiser; ohne Silbe (z. B. Ad-libs) öffnet die Stimme allein
      open = lip.open > 0 ? lip.open * (0.5 + Math.min(focusVocal * 1.5, 1) * 0.5) : focusVocal * 0.6;
    }
    const singing = open > 0.04;
    if (singing || ledsTouched.current) {
      // Balken: Mitte am höchsten bei „a“, flacher und breiter bei „e/i“
      const mid = (leds.bars.length - 1) / 2;
      leds.bars.forEach((b, i) => {
        const centre = 1 - Math.abs(i - mid) / Math.max(mid, 1);
        b.scale.setScalar(singing ? 0.35 + open * (0.75 + 0.6 * centre * (0.4 + 0.6 * lip.round)) : 1);
      });
    }
    leds.eyes.forEach((e) => e.scale.setScalar(f.micActive ? 1 + f.pulse * 0.35 : 1));
    ledsTouched.current = singing;
    if (mouth && smile) shapeMouth(mouth, smile, singing ? open : 0, lip.round);

    if (band) {
      // Band steht fest hinten (dreht sich nicht mit der Drehbühne)
      group.current?.position.set(band.position[0], band.lift ?? 0, band.position[1]);
      return;
    }
    // Verbeugung am Songende: Oberkörper nach vorn beugen (über die Grundhaltung gelegt)
    const bow = f.playing ? bowAngleAt(choreo, f.t) : 0;
    if (bow > 0.001) bendForward(root, spine, bow);

    const p = f.positions[member.avatarId];
    if (group.current && p) {
      group.current.position.set(p[0], 0, p[1]);
      // Drehbühne: Tänzer drehen sich mit; beim Auftritt schauen sie in Gehrichtung
      group.current.rotation.y = f.stageAngle + (f.headings[member.avatarId] ?? 0);
    }
  });

  const artist = song.track.isFeature ? song.artists.find((a) => a.spotifyId === member.artistId) : undefined;

  return (
    <group ref={group}>
      <primitive object={root} />
      {band?.guitar && <Guitar />}
      {artist && (
        <Html position={[0, TARGET_HEIGHT + 0.05, 0]} center zIndexRange={[10, 0]} pointerEvents="none">
          <span
            className="whitespace-nowrap rounded-full px-3 py-1 text-[clamp(11px,1.8vmin,18px)] font-bold text-black shadow"
            style={{ background: artist.color }}
            data-testid="name-tag"
          >
            {artist.name}
            {song.user?.artists[artist.spotifyId]?.following && <span className="ml-1">★</span>}
          </span>
        </Html>
      )}
    </group>
  );
}
