/**
 * FBX-Dateien „With Skin“ bringen Texturen mit. Der FBXLoader lädt sie über ein <img>-Element,
 * das es in Node nicht gibt („document is not defined“). Für die Umwandlung zählt nur das Skelett –
 * daher ein minimaler Ersatz, der Bilder annimmt, aber nie lädt.
 */
type FakeImage = { src: string; crossOrigin?: string; style: object; addEventListener(): void; removeEventListener(): void };

export function installImageStub(): () => void {
  const g = globalThis as { document?: unknown };
  if (g.document) return () => undefined;
  const image = (): FakeImage => ({ src: "", style: {}, addEventListener() {}, removeEventListener() {} });
  g.document = { createElementNS: image, createElement: image };
  return () => void delete g.document;
}
