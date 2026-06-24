import { getExtensionContext } from '../context.js';
import { getDrawioFileKind, resolvePreservedDrawioFileName } from '../drawio/fileKind.js';
import { writeDrawioBytes } from '../utils/drawioFileIO.js';
import { dirname, join } from '../utils/path.js';
import { getDocumentPathFromWindow } from '../utils/resolveDrawioAssetUrl.js';

type ElectronInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

function getWorkspacePath(): string | undefined {
  return (window as { __workspacePath?: string }).__workspacePath;
}

function toWorkspaceRelative(absoluteOrRelative: string): string {
  const workspacePath = getWorkspacePath();
  const path = absoluteOrRelative.replace(/\\/g, '/');
  if (!workspacePath) {
    return path.replace(/^\.\//, '');
  }
  const ws = workspacePath.replace(/\\/g, '/').replace(/\/$/, '');
  if (path.startsWith(`${ws}/`)) {
    return path.slice(ws.length + 1);
  }
  return path.replace(/^\.\//, '');
}

export function assetsRelativePath(documentPath: string, fileName: string): string {
  const docDir = toWorkspaceRelative(dirname(documentPath));
  return join(docDir, 'assets', fileName).replace(/\\/g, '/');
}

export function assetsDirAbsolutePath(documentPath: string): string {
  const workspacePath = getWorkspacePath();
  const relative = join(toWorkspaceRelative(dirname(documentPath)), 'assets').replace(/\\/g, '/');
  if (!workspacePath) {
    return relative;
  }
  return join(workspacePath, relative).replace(/\\/g, '/');
}

async function writeViaCreateDocument(
  invoke: ElectronInvoke | undefined,
  workspaceRelative: string,
  text: string,
): Promise<void> {
  if (!invoke) {
    throw new Error('Electron invoke unavailable');
  }
  const result = (await invoke('create-document', workspaceRelative, text, true)) as {
    success?: boolean;
    error?: string;
  };
  if (result && result.success === false) {
    throw new Error(result.error ?? 'create-document failed');
  }
}

async function writeViaExtensionFilesystem(absolutePath: string, text: string): Promise<void> {
  await getExtensionContext().services.filesystem.writeFile(absolutePath, text);
}

export async function writeDrawioAssetToDocument(options: {
  documentPath?: string;
  fileName: string;
  bytes: Uint8Array;
  invoke?: ElectronInvoke;
}): Promise<{ relativePath: string; absolutePath: string; fileName: string }> {
  const documentPath = options.documentPath ?? getDocumentPathFromWindow();
  if (!documentPath) {
    throw new Error('Open a markdown document before inserting a draw.io diagram');
  }

  const fileName = resolvePreservedDrawioFileName(options.fileName, options.bytes);
  const kind = getDrawioFileKind(fileName);
  const workspaceRelative = assetsRelativePath(documentPath, fileName);
  const absolutePath = join(assetsDirAbsolutePath(documentPath), fileName).replace(/\\/g, '/');
  const invoke = options.invoke ?? (window as { electronAPI?: { invoke: ElectronInvoke } }).electronAPI?.invoke;

  if (kind === 'png') {
    await writeDrawioBytes(absolutePath, options.bytes, kind);
    return {
      fileName,
      relativePath: `./assets/${fileName}`,
      absolutePath,
    };
  }

  const text = new TextDecoder('utf-8').decode(options.bytes);

  try {
    await writeViaCreateDocument(invoke, workspaceRelative, text);
  } catch (createError) {
    console.warn('[DrawioExtension] create-document failed, trying extension filesystem:', createError);
    await writeViaExtensionFilesystem(absolutePath, text);
  }

  return {
    fileName,
    relativePath: `./assets/${fileName}`,
    absolutePath,
  };
}
