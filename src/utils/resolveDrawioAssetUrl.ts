import { join } from './path.js';

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function nimAssetUrl(absoluteFilePath: string): string {
  if (!absoluteFilePath) {
    return '';
  }
  return `nim-asset://local/${toBase64Url(absoluteFilePath)}`;
}

export function withCacheBust(url: string, bust = Date.now()): string {
  if (!url) {
    return '';
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${bust}`;
}

export function resolveDrawioPreviewUrl(
  src: string,
  documentPath?: string,
  cacheBust?: number,
): string {
  const base = resolveDrawioAssetUrl(src, documentPath);
  return cacheBust === undefined ? base : withCacheBust(base, cacheBust);
}

export function getDocumentPathFromWindow(): string | undefined {
  return (window as { __currentDocumentPath?: string }).__currentDocumentPath;
}

/** Walk up from the widget to the editor shell — same as Nimbalyst ImageComponent. */
export function getDocumentPathFromElement(element: HTMLElement | null): string | undefined {
  let current = element;
  while (current) {
    const filePath = current.getAttribute('data-file-path');
    if (filePath) {
      return filePath;
    }
    current = current.parentElement;
  }
  return getDocumentPathFromWindow();
}

export function resolveDrawioAssetUrl(
  src: string,
  documentPath?: string,
): string {
  if (!src) {
    return '';
  }
  if (src.match(/^(https?|data|blob|nim-asset|collab-asset):/)) {
    return src;
  }

  const docPath = documentPath ?? getDocumentPathFromWindow();
  if (!docPath) {
    return src;
  }

  const lastSep = Math.max(docPath.lastIndexOf('/'), docPath.lastIndexOf('\\'));
  const documentDir = lastSep >= 0 ? docPath.slice(0, lastSep) : '';
  const normalizedSrc = src.replace(/^\.\//, '');
  const absolutePath = toWorkspaceAbsolutePath(join(documentDir, normalizedSrc));
  return nimAssetUrl(absolutePath);
}

function getWorkspacePath(): string | undefined {
  return (window as { __workspacePath?: string }).__workspacePath;
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

function toWorkspaceAbsolutePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (isAbsolutePath(normalized)) {
    return normalized;
  }
  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    return normalized;
  }
  const ws = workspacePath.replace(/\\/g, '/').replace(/\/$/, '');
  return join(ws, normalized).replace(/\\/g, '/');
}

export function resolveDrawioAbsolutePath(src: string, documentPath?: string): string {
  if (isAbsolutePath(src)) {
    return src.replace(/\\/g, '/');
  }

  const docPath = documentPath ?? getDocumentPathFromWindow();
  const normalizedSrc = src.replace(/^\.\//, '');

  if (docPath) {
    const lastSep = Math.max(docPath.lastIndexOf('/'), docPath.lastIndexOf('\\'));
    const documentDir = lastSep >= 0 ? docPath.slice(0, lastSep) : '';
    return toWorkspaceAbsolutePath(join(documentDir, normalizedSrc));
  }

  return toWorkspaceAbsolutePath(normalizedSrc);
}
