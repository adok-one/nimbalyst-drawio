import { DrawioClient } from './DrawioClient.js';
import type { DrawioFileKind } from './fileKind.js';
import { normalizeDrawioLoadXml } from './templates.js';
import { readDrawioFile } from '../utils/drawioFileIO.js';

const PREVIEW_TIMEOUT_MS = 30_000;

let previewContainer: HTMLDivElement | null = null;
let previewClient: DrawioClient | null = null;
let queue: Promise<void> = Promise.resolve();

function getPreviewContainer(): HTMLDivElement {
  if (!previewContainer) {
    previewContainer = document.createElement('div');
    previewContainer.setAttribute('aria-hidden', 'true');
    previewContainer.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0;';
    document.body.appendChild(previewContainer);
  }
  return previewContainer;
}

function getPreviewClient(): DrawioClient {
  if (!previewClient) {
    previewClient = new DrawioClient(getPreviewContainer());
  }
  return previewClient;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Draw.io preview timed out'));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function waitForClientReady(client: DrawioClient): Promise<void> {
  return new Promise((resolve) => {
    client.onReady(() => resolve());
  });
}

async function exportXmlPreview(absolutePath: string): Promise<Blob | null> {
  const client = getPreviewClient();
  await waitForClientReady(client);

  const { kind, content } = await readDrawioFile(absolutePath);
  const xmlLike = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
  const loadXml = normalizeDrawioLoadXml(xmlLike, kind);

  await withTimeout(client.loadXmlLike(loadXml), PREVIEW_TIMEOUT_MS);
  const bytes = await withTimeout(client.exportAsSvgWithEmbeddedXml(), PREVIEW_TIMEOUT_MS);
  return new Blob([bytes], { type: 'image/svg+xml' });
}

function enqueuePreview(run: () => Promise<Blob | null>): Promise<Blob | null> {
  const job = queue.then(() => run()).catch((error) => {
    console.warn('[DrawioPreview] Export failed:', error);
    return null;
  });
  queue = job.then(() => undefined);
  return job;
}

/** Export an SVG preview blob for plain `.drawio` XML assets. Returns null on failure. */
export async function exportDrawioPreviewBlob(
  absolutePath: string,
  kind: DrawioFileKind,
): Promise<Blob | null> {
  if (kind !== 'xml') {
    return null;
  }
  return enqueuePreview(() => exportXmlPreview(absolutePath));
}

export function destroyDrawioPreviewService(): void {
  previewClient?.destroy();
  previewClient = null;
  previewContainer?.remove();
  previewContainer = null;
  queue = Promise.resolve();
}
