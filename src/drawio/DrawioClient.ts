import type { DrawioAction, DrawioBytes, DrawioConfig, DrawioDocumentChange, DrawioEvent } from './types.js';

const DRAWIO_ORIGIN = 'https://embed.diagrams.net';

export class DrawioClient {
  private readonly iframe: HTMLIFrameElement;
  private readonly onChangeHandlers = new Set<(change: DrawioDocumentChange) => void>();
  private readonly onSaveHandlers = new Set<() => void>();
  private readonly onReadyHandlers = new Set<() => void>();

  private currentXml: string | undefined;
  private isMerging = false;
  private isReady = false;
  /**
   * A load asked for before the canvas announced itself, kept with the settlers of the
   * promise the caller is holding. Until 2026-09-01 this was the XML alone: the queued load
   * resolved its caller straight away and was replayed as `void this.loadXmlLike(xml)`, so a
   * failure reached nobody -- not a handler, not the caller, only an unhandled rejection in
   * the console.
   */
  private pendingLoad:
    | { xml: string; resolve: () => void; reject: (error: unknown) => void }
    | undefined;
  private actionId = 0;
  private responseHandlers = new Map<string, { resolve: (event: DrawioEvent) => void; reject: () => void }>();

  constructor(container: HTMLElement) {
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('frameborder', '0');
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    this.iframe.style.border = '0';
    this.iframe.src = `${DRAWIO_ORIGIN}/?embed=1&ui=atlas&spin=1&modified=unsavedChanges&proto=json&saveAndExit=0`;
    container.appendChild(this.iframe);

    this.handleMessage = this.handleMessage.bind(this);
    window.addEventListener('message', this.handleMessage);
  }

  onChange(handler: (change: DrawioDocumentChange) => void): () => void {
    this.onChangeHandlers.add(handler);
    return () => this.onChangeHandlers.delete(handler);
  }

  onSave(handler: () => void): () => void {
    this.onSaveHandlers.add(handler);
    return () => this.onSaveHandlers.delete(handler);
  }

  onReady(handler: () => void): () => void {
    this.onReadyHandlers.add(handler);
    if (this.isReady) {
      handler();
    }
    return () => this.onReadyHandlers.delete(handler);
  }

  async loadXmlLike(xmlLike: string): Promise<void> {
    this.currentXml = undefined;
    if (!this.isReady) {
      return new Promise<void>((resolve, reject) => {
        // A second load before the canvas is up replaces the first. The caller of the
        // superseded one is resolved rather than rejected: its content was not loaded, but
        // that is because something newer took its place, which is not a failure to report.
        this.pendingLoad?.resolve();
        this.pendingLoad = { xml: xmlLike, resolve, reject };
      });
    }
    this.sendAction({ action: 'load', xml: xmlLike, autosave: 1 });
    await this.getXml();
  }

  async loadPngWithEmbeddedXml(bytes: Uint8Array): Promise<void> {
    const base64 = bytesToBase64(bytes);
    await this.loadXmlLike(`data:image/png;base64,${base64}`);
  }

  async mergeXmlLike(xmlLike: string): Promise<void> {
    this.isMerging = true;
    try {
      const response = await this.sendActionWaitForResponse({ action: 'merge', xml: xmlLike });
      if ('error' in response && response.error) {
        throw new Error(response.error);
      }
    } finally {
      this.isMerging = false;
    }
  }

  async exportAsSvgWithEmbeddedXml(): Promise<DrawioBytes> {
    const response = await this.sendActionWaitForResponse({ action: 'export', format: 'xmlsvg' });
    if (response.event !== 'export' || !response.data) {
      throw new Error('Failed to export draw.io SVG');
    }
    return decodeDataUrl(response.data);
  }

  async exportAsPngWithEmbeddedXml(): Promise<DrawioBytes> {
    const response = await this.sendActionWaitForResponse({ action: 'export', format: 'xmlpng' });
    if (response.event !== 'export' || !response.data) {
      throw new Error('Failed to export draw.io PNG');
    }
    return decodeDataUrl(response.data);
  }

  async getXml(): Promise<string> {
    if (!this.currentXml) {
      const response = await this.sendActionWaitForResponse({ action: 'export', format: 'xml' });
      if (response.event !== 'export' || !response.xml) {
        throw new Error('Failed to read draw.io XML');
      }
      if (!this.currentXml) {
        this.currentXml = response.xml;
      }
    }
    return this.currentXml;
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.iframe.remove();
    for (const handler of this.responseHandlers.values()) {
      handler.reject();
    }
    this.responseHandlers.clear();
    // A load still waiting for a canvas that is now gone will never happen, and the caller
    // would otherwise wait for it forever.
    const pending = this.pendingLoad;
    this.pendingLoad = undefined;
    pending?.reject(new Error('Draw.io canvas was closed before the diagram loaded'));
  }

  private sendAction(action: DrawioAction): void {
    this.postToIframe(JSON.stringify(action));
  }

  private sendActionWaitForResponse(action: DrawioAction): Promise<DrawioEvent> {
    return new Promise((resolve, reject) => {
      const actionId = String(this.actionId++);
      this.responseHandlers.set(actionId, { resolve, reject });
      this.postToIframe(JSON.stringify({ ...action, actionId }));
    });
  }

  private postToIframe(payload: string): void {
    this.iframe.contentWindow?.postMessage(payload, DRAWIO_ORIGIN);
  }

  private handleMessage(event: MessageEvent): void {
    if (event.origin !== DRAWIO_ORIGIN) {
      return;
    }
    if (typeof event.data !== 'string') {
      return;
    }

    let parsed: DrawioEvent & { message?: { actionId?: string } };
    try {
      parsed = JSON.parse(event.data) as DrawioEvent & { message?: { actionId?: string } };
    } catch {
      return;
    }

    const actionId = parsed.message?.actionId;
    if (actionId && this.responseHandlers.has(actionId)) {
      const handler = this.responseHandlers.get(actionId)!;
      this.responseHandlers.delete(actionId);
      handler.resolve(parsed);
      return;
    }

    if (parsed.event === 'configure') {
      const config: DrawioConfig = { defaultFonts: ['Helvetica', 'Verdana'] };
      this.sendAction({ action: 'configure', config });
      return;
    }

    if (parsed.event === 'init') {
      this.isReady = true;
      for (const handler of this.onReadyHandlers) {
        handler();
      }
      if (this.pendingLoad !== undefined) {
        const pending = this.pendingLoad;
        this.pendingLoad = undefined;
        // Settles the promise the caller has been holding since before the canvas was up.
        this.loadXmlLike(pending.xml).then(pending.resolve, pending.reject);
      }
      return;
    }

    if (parsed.event === 'autosave') {
      const oldXml = this.currentXml;
      if (oldXml !== parsed.xml) {
        this.currentXml = parsed.xml;
        if (!this.isMerging) {
          for (const handler of this.onChangeHandlers) {
            handler({ oldXml, newXml: parsed.xml });
          }
        }
      }
      return;
    }

    if (parsed.event === 'save') {
      const oldXml = this.currentXml;
      this.currentXml = parsed.xml;
      if (oldXml !== parsed.xml) {
        for (const handler of this.onChangeHandlers) {
          handler({ oldXml, newXml: parsed.xml });
        }
      } else {
        for (const handler of this.onSaveHandlers) {
          handler();
        }
      }
      return;
    }

    if (parsed.event === 'export') {
      const handlers = [...this.responseHandlers.values()];
      this.responseHandlers.clear();
      if (handlers.length === 1) {
        handlers[0].resolve(parsed);
      } else {
        for (const handler of handlers) {
          handler.reject();
        }
      }
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeDataUrl(dataUrl: string): DrawioBytes {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    throw new Error('Invalid data URL from draw.io export');
  }
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
