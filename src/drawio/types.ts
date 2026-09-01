export type DrawioAction =
  | { action: 'load'; xml: string; autosave?: number }
  | { action: 'merge'; xml: string }
  | { action: 'configure'; config: DrawioConfig }
  | { action: 'export'; format: 'xml' | 'xmlpng' | 'xmlsvg' };

export type DrawioEvent =
  | { event: 'init' }
  | { event: 'configure' }
  | { event: 'autosave'; xml: string }
  | { event: 'save'; xml: string }
  | { event: 'export'; xml?: string; data?: string }
  | { event: 'merge'; error?: string };

export interface DrawioConfig {
  defaultFonts?: string[];
}

export interface DrawioDocumentChange {
  oldXml: string | undefined;
  newXml: string;
}

/**
 * Bytes backed by a plain `ArrayBuffer`.
 *
 * Since TypeScript 5.7 a bare `Uint8Array` may be backed by a `SharedArrayBuffer` instead,
 * and `Blob`, `URL.createObjectURL` and the host's binary IPC channel all reject one. Every
 * byte array this extension produces comes from `new Uint8Array(n)` or `TextEncoder`, so it
 * is an ArrayBuffer-backed one -- and saying so is what lets it reach a `Blob` without a
 * cast that would also silence a real mistake.
 */
export type DrawioBytes = Uint8Array<ArrayBuffer>;
