/**
 * Turning `./assets/a.drawio.svg` in a markdown file into something the host will actually
 * serve. Two globals decide the answer -- `window.__currentDocumentPath` and
 * `window.__workspacePath` -- and in a multi-editor window the first of them is wrong for
 * every tab but the focused one, which is why the DOM walk exists.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  getDocumentPathFromElement,
  getDocumentPathFromWindow,
  nimAssetUrl,
  resolveDrawioAbsolutePath,
  resolveDrawioAssetUrl,
  resolveDrawioPreviewUrl,
  withCacheBust,
} from '../src/utils/resolveDrawioAssetUrl.js';

type TestWindow = Window & { __currentDocumentPath?: string; __workspacePath?: string };

function setGlobals(documentPath?: string, workspacePath?: string): void {
  (window as TestWindow).__currentDocumentPath = documentPath;
  (window as TestWindow).__workspacePath = workspacePath;
}

function decodeNimAsset(url: string): string {
  const encoded = url.replace('nim-asset://local/', '').split('?')[0];
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

afterEach(() => {
  setGlobals(undefined, undefined);
  document.body.innerHTML = '';
});

describe('nimAssetUrl', () => {
  it('encodes the absolute path as base64url with no padding', () => {
    const url = nimAssetUrl('/ws/docs/assets/a.drawio.svg');
    expect(url.startsWith('nim-asset://local/')).toBe(true);
    // The alphabet is the point: a plain-base64 `+`, `/` or `=` in the authority-less part
    // of a custom-scheme URL is what makes it stop being one path segment.
    expect(url.slice('nim-asset://local/'.length)).not.toMatch(/[+/=]/);
    expect(decodeNimAsset(url)).toBe('/ws/docs/assets/a.drawio.svg');
  });

  it('survives non-ASCII in a path -- the encoder goes through UTF-8, not charCode', () => {
    expect(decodeNimAsset(nimAssetUrl('/ws/документы/схема.drawio.svg'))).toBe(
      '/ws/документы/схема.drawio.svg',
    );
  });

  it('returns an empty string rather than a URL for nothing', () => {
    expect(nimAssetUrl('')).toBe('');
  });
});

describe('withCacheBust', () => {
  it('picks the right separator for a URL that already has a query', () => {
    expect(withCacheBust('nim-asset://local/abc', 7)).toBe('nim-asset://local/abc?v=7');
    expect(withCacheBust('http://x/a?b=1', 7)).toBe('http://x/a?b=1&v=7');
  });

  it('leaves an empty URL empty', () => {
    expect(withCacheBust('', 7)).toBe('');
  });
});

describe('resolveDrawioAssetUrl', () => {
  it.each(['https://x/a.svg', 'http://x/a.svg', 'data:image/svg+xml;base64,AA', 'blob:http://x/1', 'nim-asset://local/AA', 'collab-asset://x'])(
    'passes %s through untouched',
    (src) => {
      setGlobals('/ws/docs/a.md', '/ws');
      expect(resolveDrawioAssetUrl(src)).toBe(src);
    },
  );

  it('resolves a relative asset against the document, then the workspace', () => {
    setGlobals('/ws/docs/a.md', '/ws');
    expect(decodeNimAsset(resolveDrawioAssetUrl('./assets/a.drawio.svg'))).toBe(
      '/ws/docs/assets/a.drawio.svg',
    );
  });

  it('takes an explicit document path over the window global', () => {
    setGlobals('/ws/other/b.md', '/ws');
    expect(decodeNimAsset(resolveDrawioAssetUrl('./assets/a.drawio.svg', '/ws/docs/a.md'))).toBe(
      '/ws/docs/assets/a.drawio.svg',
    );
  });

  it('leaves the src alone when no document is open', () => {
    setGlobals(undefined, '/ws');
    expect(resolveDrawioAssetUrl('./assets/a.drawio.svg')).toBe('./assets/a.drawio.svg');
  });

  it('handles a workspace-absolute document path with no workspace global', () => {
    setGlobals('/ws/docs/a.md', undefined);
    expect(decodeNimAsset(resolveDrawioAssetUrl('./assets/a.drawio.svg'))).toBe(
      '/ws/docs/assets/a.drawio.svg',
    );
  });

  it('returns an empty string for an empty src', () => {
    expect(resolveDrawioAssetUrl('')).toBe('');
  });
});

describe('resolveDrawioPreviewUrl', () => {
  it('appends a cache-buster only when one is asked for', () => {
    setGlobals('/ws/docs/a.md', '/ws');
    expect(resolveDrawioPreviewUrl('./assets/a.drawio.svg')).not.toContain('?v=');
    expect(resolveDrawioPreviewUrl('./assets/a.drawio.svg', undefined, 42)).toContain('?v=42');
  });
});

describe('resolveDrawioAbsolutePath', () => {
  it('returns an already-absolute path unchanged, POSIX or Windows', () => {
    expect(resolveDrawioAbsolutePath('/ws/a.drawio')).toBe('/ws/a.drawio');
    expect(resolveDrawioAbsolutePath('C:\\ws\\a.drawio')).toBe('C:/ws/a.drawio');
  });

  it('resolves relative to the document', () => {
    setGlobals(undefined, '/ws');
    expect(resolveDrawioAbsolutePath('./assets/a.drawio', '/ws/docs/a.md')).toBe(
      '/ws/docs/assets/a.drawio',
    );
  });

  it('falls back to the workspace when there is no document', () => {
    setGlobals(undefined, '/ws');
    expect(resolveDrawioAbsolutePath('assets/a.drawio')).toBe('/ws/assets/a.drawio');
  });

  it('returns the bare relative path when there is neither', () => {
    setGlobals(undefined, undefined);
    expect(resolveDrawioAbsolutePath('assets/a.drawio')).toBe('assets/a.drawio');
  });
});

describe('getDocumentPathFromElement', () => {
  /**
   * The whole reason this function exists instead of reading the global: with two documents
   * open, `__currentDocumentPath` names one of them, and a widget in the other one would
   * resolve its assets against the wrong folder.
   */
  it('takes the nearest data-file-path ancestor, not the focused document', () => {
    setGlobals('/ws/focused.md', '/ws');
    document.body.innerHTML =
      '<div data-file-path="/ws/other.md"><div id="shell"><span id="widget"></span></div></div>';
    const widget = document.getElementById('widget');

    expect(getDocumentPathFromElement(widget)).toBe('/ws/other.md');
  });

  it('stops at the closest one when editors are nested', () => {
    document.body.innerHTML =
      '<div data-file-path="/ws/outer.md"><div data-file-path="/ws/inner.md"><i id="w"></i></div></div>';

    expect(getDocumentPathFromElement(document.getElementById('w'))).toBe('/ws/inner.md');
  });

  it('falls back to the window global when nothing up the tree says', () => {
    setGlobals('/ws/focused.md', '/ws');
    document.body.innerHTML = '<div><span id="w"></span></div>';

    expect(getDocumentPathFromElement(document.getElementById('w'))).toBe('/ws/focused.md');
    expect(getDocumentPathFromElement(null)).toBe('/ws/focused.md');
    expect(getDocumentPathFromWindow()).toBe('/ws/focused.md');
  });

  it('reports nothing when there is nothing to report', () => {
    expect(getDocumentPathFromElement(null)).toBeUndefined();
  });
});
