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
