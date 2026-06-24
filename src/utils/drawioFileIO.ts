import { getExtensionContext } from '../context.js';
import type { DrawioClient } from '../drawio/DrawioClient.js';
import { getDrawioFileKind, type DrawioFileKind } from '../drawio/fileKind.js';
import { normalizeDrawioLoadXml } from '../drawio/templates.js';

type ReadFileResult = {
  content: string;
  isBinary?: boolean;
};

type ElectronApi = {
  readFileContent?: (filePath: string, options?: { binary?: boolean }) => Promise<ReadFileResult>;
  saveFile?: (content: string, filePath: string, lastKnownContent?: string) => Promise<unknown>;
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function readDrawioFile(
  absolutePath: string,
): Promise<{ kind: DrawioFileKind; content: string | Uint8Array }> {
  const kind = getDrawioFileKind(absolutePath);
  const electronAPI = (window as { electronAPI?: ElectronApi }).electronAPI;

  if (electronAPI?.readFileContent) {
    const result = await electronAPI.readFileContent(absolutePath, { binary: kind === 'png' });
    if (result.isBinary && kind === 'png') {
      return { kind, content: base64ToBytes(result.content) };
    }
    return { kind, content: result.content };
  }

  const text = await getExtensionContext().services.filesystem.readFile(absolutePath);
  return { kind, content: text };
}

async function writeTextFile(absolutePath: string, text: string): Promise<void> {
  const electronAPI = (window as { electronAPI?: ElectronApi }).electronAPI;
  if (electronAPI?.saveFile) {
    await electronAPI.saveFile(text, absolutePath);
    return;
  }
  await getExtensionContext().services.filesystem.writeFile(absolutePath, text);
}

async function writeBinaryFile(absolutePath: string, bytes: Uint8Array): Promise<void> {
  const electronAPI = (window as { electronAPI?: ElectronApi }).electronAPI;
  if (electronAPI?.invoke) {
    await electronAPI.invoke('extensions:write-binary', absolutePath, bytesToBase64(bytes));
    return;
  }
  throw new Error('Binary write is not available in this environment');
}

/** Write raw asset bytes using the correct encoding for svg/xml vs draw.io png. */
export async function writeDrawioBytes(
  absolutePath: string,
  bytes: Uint8Array,
  kind?: DrawioFileKind,
): Promise<void> {
  const fileKind = kind ?? getDrawioFileKind(absolutePath);
  if (fileKind === 'png') {
    await writeBinaryFile(absolutePath, bytes);
    return;
  }
  await writeTextFile(absolutePath, bytesToText(bytes));
}

export async function saveDrawioFile(
  absolutePath: string,
  kind: DrawioFileKind,
  client: DrawioClient,
): Promise<void> {
  if (kind === 'png') {
    const bytes = await client.exportAsPngWithEmbeddedXml();
    await writeBinaryFile(absolutePath, bytes);
    return;
  }

  if (kind === 'svg') {
    const bytes = await client.exportAsSvgWithEmbeddedXml();
    await writeTextFile(absolutePath, bytesToText(bytes));
    return;
  }

  const xml = await client.getXml();
  await writeTextFile(absolutePath, xml);
}

export async function applyDrawioContentToClient(
  client: DrawioClient,
  raw: string | Uint8Array,
  kind: DrawioFileKind,
): Promise<void> {
  if (kind === 'png') {
    const bytes = typeof raw === 'string' ? base64ToBytes(raw) : raw;
    await client.loadPngWithEmbeddedXml(bytes);
    return;
  }

  const xmlLike = typeof raw === 'string' ? raw : bytesToText(raw);
  const loadXml = normalizeDrawioLoadXml(xmlLike, kind);
  await client.loadXmlLike(loadXml);
}
