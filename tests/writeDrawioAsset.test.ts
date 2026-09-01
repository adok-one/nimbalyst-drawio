/**
 * Where a diagram lands on disk. Two paths are computed for the same file and they are NOT
 * the same string: `create-document` wants it workspace-relative, the binary channel and the
 * filesystem service want it absolute. Getting either wrong writes the diagram somewhere the
 * markdown link does not point.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearExtensionContext, setExtensionContext } from '../src/context.js';
import {
  assetsDirAbsolutePath,
  assetsRelativePath,
  writeDrawioAssetToDocument,
} from '../src/markdown/writeDrawioAsset.js';
import type { ExtensionContext } from '../src/types/extension.js';

type TestWindow = { __workspacePath?: string; __currentDocumentPath?: string; electronAPI?: unknown };

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function useFilesystem() {
  const filesystem = {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => false),
  };
  setExtensionContext({ services: { filesystem } } as unknown as ExtensionContext);
  return filesystem;
}

beforeEach(() => {
  (window as unknown as TestWindow).__workspacePath = '/ws';
});

afterEach(() => {
  const w = window as unknown as TestWindow;
  delete w.__workspacePath;
  delete w.__currentDocumentPath;
  delete w.electronAPI;
  clearExtensionContext();
});

describe('path building', () => {
  it('puts the asset in an assets/ folder beside the document, workspace-relative', () => {
    expect(assetsRelativePath('/ws/docs/notes.md', 'a.drawio.svg')).toBe('docs/assets/a.drawio.svg');
  });

  it('and absolute, for the channels that need that', () => {
    expect(assetsDirAbsolutePath('/ws/docs/notes.md')).toBe('/ws/docs/assets');
  });

  it('handles a document one level down', () => {
    expect(assetsRelativePath('/ws/a/b/notes.md', 'a.drawio.svg')).toBe('a/b/assets/a.drawio.svg');
    expect(assetsDirAbsolutePath('/ws/a/b/notes.md')).toBe('/ws/a/b/assets');
  });

  /**
   * A document at the top of the workspace: its folder IS the workspace, which
   * `toWorkspaceRelative` used to leave absolute -- and `create-document`, which resolves
   * what it is given against the workspace, then wrote the diagram to `<ws>/<ws>/assets/`.
   * The markdown link said `./assets/f` and the widget could not read it back. Fixed
   * 2026-09-01; these are the two paths that were wrong.
   */
  it('makes a root-level document relative, not absolute', () => {
    expect(assetsRelativePath('/ws/notes.md', 'a.drawio.svg')).toBe('assets/a.drawio.svg');
  });

  it('does not double the workspace in a root-level absolute path', () => {
    expect(assetsDirAbsolutePath('/ws/notes.md')).toBe('/ws/assets');
  });

  it('handles a trailing slash on the workspace the same way', () => {
    (window as unknown as TestWindow).__workspacePath = '/ws/';
    expect(assetsRelativePath('/ws/notes.md', 'a.drawio.svg')).toBe('assets/a.drawio.svg');
    expect(assetsDirAbsolutePath('/ws/notes.md')).toBe('/ws/assets');
  });
});

describe('writeDrawioAssetToDocument', () => {
  it('refuses when there is no document to write beside', async () => {
    await expect(
      writeDrawioAssetToDocument({ fileName: 'a.drawio.svg', bytes: bytes('<svg/>') }),
    ).rejects.toThrow(/open a markdown document/i);
  });

  it('falls back to the focused document when none is passed', async () => {
    (window as unknown as TestWindow).__currentDocumentPath = '/ws/docs/notes.md';
    const invoke = vi.fn(async () => ({ success: true }));

    const result = await writeDrawioAssetToDocument({
      fileName: 'a.drawio.svg',
      bytes: bytes('<svg/>'),
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith('create-document', 'docs/assets/a.drawio.svg', '<svg/>', true);
    expect(result.absolutePath).toBe('/ws/docs/assets/a.drawio.svg');
  });

  it('returns a link relative to the document, which is what goes in the markdown', async () => {
    const invoke = vi.fn(async () => ({ success: true }));

    const result = await writeDrawioAssetToDocument({
      documentPath: '/ws/docs/notes.md',
      fileName: 'a.drawio.svg',
      bytes: bytes('<svg/>'),
      invoke,
    });

    expect(result).toEqual({
      fileName: 'a.drawio.svg',
      relativePath: './assets/a.drawio.svg',
      absolutePath: '/ws/docs/assets/a.drawio.svg',
    });
  });

  /** The whole of the root-level defect, through the function that was writing the file. */
  it('writes beside a document at the top of the workspace, not a level under it', async () => {
    const invoke = vi.fn(async () => ({ success: true }));

    const result = await writeDrawioAssetToDocument({
      documentPath: '/ws/notes.md',
      fileName: 'a.drawio.svg',
      bytes: bytes('<svg/>'),
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith('create-document', 'assets/a.drawio.svg', '<svg/>', true);
    expect(result.absolutePath).toBe('/ws/assets/a.drawio.svg');
    expect(result.relativePath).toBe('./assets/a.drawio.svg');
  });

  it('sends a root-level PNG to the right absolute path too', async () => {
    const invoke = vi.fn(async () => undefined);
    (window as unknown as TestWindow).electronAPI = { invoke };

    await writeDrawioAssetToDocument({
      documentPath: '/ws/notes.md',
      fileName: 'a.drawio.png',
      bytes: bytes('PNG'),
    });

    expect(invoke).toHaveBeenCalledWith('extensions:write-binary', '/ws/assets/a.drawio.png', expect.any(String));
  });

  it('renames by content before deciding where to write', async () => {
    const invoke = vi.fn(async () => ({ success: true }));

    const result = await writeDrawioAssetToDocument({
      documentPath: '/ws/docs/notes.md',
      fileName: 'diagram.svg',
      bytes: bytes('<svg content="&lt;mxfile"/>'),
      invoke,
    });

    expect(result.fileName).toBe('diagram.drawio.svg');
    expect(invoke).toHaveBeenCalledWith('create-document', 'docs/assets/diagram.drawio.svg', expect.any(String), true);
  });

  it('sends a PNG down the binary channel instead of create-document', async () => {
    const invoke = vi.fn(async () => undefined);
    (window as unknown as TestWindow).electronAPI = { invoke };

    const result = await writeDrawioAssetToDocument({
      documentPath: '/ws/docs/notes.md',
      fileName: 'a.drawio.png',
      bytes: bytes('PNG'),
    });

    expect(invoke).toHaveBeenCalledWith('extensions:write-binary', '/ws/docs/assets/a.drawio.png', expect.any(String));
    expect(invoke).not.toHaveBeenCalledWith('create-document', expect.anything(), expect.anything(), expect.anything());
    expect(result.relativePath).toBe('./assets/a.drawio.png');
  });

  it('falls back to the extension filesystem when create-document reports failure', async () => {
    const filesystem = useFilesystem();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invoke = vi.fn(async () => ({ success: false, error: 'read-only workspace' }));

    const result = await writeDrawioAssetToDocument({
      documentPath: '/ws/docs/notes.md',
      fileName: 'a.drawio.svg',
      bytes: bytes('<svg/>'),
      invoke,
    });

    expect(filesystem.writeFile).toHaveBeenCalledWith('/ws/docs/assets/a.drawio.svg', '<svg/>');
    expect(result.absolutePath).toBe('/ws/docs/assets/a.drawio.svg');
    expect(warn).toHaveBeenCalled();
  });

  it('falls back when there is no electron channel at all', async () => {
    const filesystem = useFilesystem();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await writeDrawioAssetToDocument({
      documentPath: '/ws/docs/notes.md',
      fileName: 'a.drawio.svg',
      bytes: bytes('<svg/>'),
    });

    expect(filesystem.writeFile).toHaveBeenCalledWith('/ws/docs/assets/a.drawio.svg', '<svg/>');
  });

  /**
   * Both writers failing has to reach the caller: the slash command removes the node it
   * inserted and shows the error, and it can only do that if this rejects.
   */
  it('propagates a failure when neither writer works', async () => {
    const filesystem = useFilesystem();
    filesystem.writeFile.mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      writeDrawioAssetToDocument({
        documentPath: '/ws/docs/notes.md',
        fileName: 'a.drawio.svg',
        bytes: bytes('<svg/>'),
      }),
    ).rejects.toThrow(/disk full/);
  });
});
