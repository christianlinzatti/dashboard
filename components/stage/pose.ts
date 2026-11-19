import { Quaternion, Vector3, type Object3D } from "three";

/**
 * Einfache Pose-Korrekturen über die Animation gelegt (nach mixer.update): Arme greifen zu einem Punkt (zwei-
 * gliedrig, Ellbogen nach außen-unten), der Kopf nickt. Achsen-unabhängig: gedreht wird in Weltrichtungen und in
 * den lokalen Raum jedes Knochens umgerechnet – die Avatare haben unterschiedliche Knochenachsen.
 */
const A = new Vector3();
const B = new Vector3();
const T = new Vector3();
const Q = new Quaternion();
const QP = new Quaternion();
const QL = new Quaternion();

/** Knochen so drehen, dass er (Richtung Knochen → Kind) auf den Weltpunkt `target` zeigt */
export function aimAt(bone: Object3D, child: Object3D, target: Vector3) {
  bone.getWorldPosition(A);
  child.getWorldPosition(B);
  const cur = B.sub(A).normalize();
  const want = T.copy(target).sub(A).normalize();
  Q.setFromUnitVectors(cur, want);
  bone.parent!.getWorldQuaternion(QP);
  // Weltdrehung in den Elternraum: local' = P⁻¹ · Q · P · local
  QL.copy(QP).invert().multiply(Q).multiply(QP);
  bone.quaternion.premultiply(QL);
  bone.updateMatrixWorld(true);
}

export type Arm = { upper: Object3D; fore: Object3D; hand: Object3D };

export function findArms(model: Object3D): Arm[] {
  return (["Left", "Right"] as const)
    .map((s) => ({
      upper: model.getObjectByName(`${s}Arm`),
      fore: model.getObjectByName(`${s}ForeArm`),
      hand: model.getObjectByName(`${s}Hand`),
    }))
    .filter((a): a is Arm => !!a.upper && !!a.fore && !!a.hand);
}

const S = new Vector3();
const E = new Vector3();
const H = new Vector3();

/**
 * Hand zu einem Punkt (im Raum von `space`, z. B. der Avatar-Gruppe) führen: Oberarm zeigt auf einen Ellbogenpunkt
 * zwischen Schulter und Ziel (etwas nach außen und unten), Unterarm auf das Ziel.
 */
export function reach(space: Object3D, arm: Arm, targetLocal: Vector3) {
  arm.upper.getWorldPosition(S);
  space.localToWorld(H.copy(targetLocal));
  const side = Math.sign(space.worldToLocal(E.copy(S)).x) || 1;
  // Ellbogen: auf halbem Weg, nach außen und unten gedrückt
  E.copy(targetLocal);
  space.worldToLocal(T.copy(S));
  E.lerp(T, 0.5);
  E.x += side * 0.12;
  E.y -= 0.14;
  space.localToWorld(E);
  aimAt(arm.upper, arm.fore, E);
  aimAt(arm.fore, arm.hand, H);
}

/** Seite (links -1 / rechts +1) eines Arms im Raum von `space` */
export function sideOf(space: Object3D, arm: Arm) {
  arm.upper.getWorldPosition(S);
  return Math.sign(space.worldToLocal(S).x) || 1;
}
