/**
 * Drop and paste. Two things have to be right: the file really is a diagram (an ordinary PNG
 * adopted here would later be saved as a draw.io PNG and lose whatever it was), and the name
 * does not overwrite a diagram already in assets/.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearExtensionContext, setExtensionContext } from '../src/context.js';
import {
  storeDrawioAssetNextToDocument,
  uploadDrawioImagePreserveName,
} from '../src/markdown/drawioUpload.js';
import { peekUploadFileName } from '../src/markdown/pendingUploadName.js';
import type { ExtensionContext } from '../src/types/extension.js';

type TestWindow = { __workspacePath?: string; __currentDocumentPath?: string; electronAPI?: unknown };

const DRAWIO_SVG = '<svg content="&lt;mxfile host=&quot;app&quot;&gt;&lt;/mxfile&gt;"/>';

let taken: Set<string>;
let fileExists: ReturnType<typeof vi.fn>;

function useWorkspace() {
  taken = new Set();
  fileExists = vi.fn(async (path: string) => taken.has(path));
  setExtensionContext({
    services: {
      filesystem: { readFile: vi.fn(), writeFile: vi.fn(), fileExists },
    },
  } as unknown as ExtensionContext);

  const w = window as unknown as TestWindow;
  w.__workspacePath = '/ws';
  w.electronAPI = { invoke: vi.fn(async () => ({ success: true })) };
}

function fileOf(name: string, content: string | Uint8Array, type = ''): File {
  return new File([content as BlobPart], name, { type });
}

beforeEach(useWorkspace);

afterEach(() => {
  const w = window as unknown as TestWindow;
  delete w.__workspacePath;
  delete w.__currentDocumentPath;
  delete w.electronAPI;
  clearExtensionContext();
});

describe('storeDrawioAssetNextToDocument', () => {
  it('refuses when no document is open', async () => {
    await expect(storeDrawioAssetNextToDocument(fileOf('a.drawio.svg', DRAWIO_SVG))).rejects.toThrow(
      /open a markdown document/i,
    );
  });

  it('stores a file whose name already says draw.io', async () => {
    const result = await storeDrawioAssetNextToDocument(
      fileOf('a.drawio.svg', DRAWIO_SVG),
      '/ws/docs/notes.md',
    );

    expect(result).toEqual({
      fileName: 'a.drawio.svg',
      relativePath: './assets/a.drawio.svg',
      absolutePath: '/ws/docs/assets/a.drawio.svg',
    });
  });

  it('adopts a plain .svg whose bytes are a diagram, under a draw.io name', async () => {
    const result = await storeDrawioAssetNextToDocument(fileOf('a.svg', DRAWIO_SVG), '/ws/docs/notes.md');

    expect(result.fileName).toBe('a.drawio.svg');
  });

  it('turns away a file that is not a diagram, and says which one', async () => {
    await expect(
      storeDrawioAssetNextToDocument(fileOf('holiday.png', 'not a png'), '/ws/docs/notes.md'),
    ).rejects.toThrow(/holiday\.png/);
  });

  it('remembers the dropped name for the upload pipeline that follows', async () => {
    await storeDrawioAssetNextToDocument(fileOf('a.drawio.svg', DRAWIO_SVG), '/ws/docs/notes.md');

    expect(peekUploadFileName()).toBe('a.drawio.svg');
  });

  describe('not overwriting what is already there', () => {
    it('keeps the name when nothing is in the way', async () => {
      const result = await storeDrawioAssetNextToDocument(
        fileOf('a.drawio.svg', DRAWIO_SVG),
        '/ws/docs/notes.md',
      );

      expect(result.fileName).toBe('a.drawio.svg');
      expect(fileExists).toHaveBeenCalledWith('/ws/docs/assets/a.drawio.svg');
    });

    it('numbers around an existing file, keeping the compound extension', async () => {
      taken.add('/ws/docs/assets/a.drawio.svg');

      const result = await storeDrawioAssetNextToDocument(
        fileOf('a.drawio.svg', DRAWIO_SVG),
        '/ws/docs/notes.md',
      );

      expect(result.fileName).toBe('a-2.drawio.svg');
    });

    it('keeps counting past a run of them', async () => {
      taken.add('/ws/docs/assets/a.drawio.svg');
      taken.add('/ws/docs/assets/a-2.drawio.svg');
      taken.add('/ws/docs/assets/a-3.drawio.svg');

      const result = await storeDrawioAssetNextToDocument(
        fileOf('a.drawio.svg', DRAWIO_SVG),
        '/ws/docs/notes.md',
      );

      expect(result.fileName).toBe('a-4.drawio.svg');
    });

    it('numbers a .drawio the same way', async () => {
      taken.add('/ws/docs/assets/a.drawio');

      const result = await storeDrawioAssetNextToDocument(
        fileOf('a.drawio', '<mxfile host="app"></mxfile>'),
        '/ws/docs/notes.md',
      );

      expect(result.fileName).toBe('a-2.drawio');
    });

    /**
     * The search gives up after fifty tries and returns the last candidate, which then
     * overwrites. Fifty same-named diagrams in one folder is not a case worth more code,
     * but it is a case worth knowing about.
     */
    it('gives up after fifty and reuses the last candidate', async () => {
      taken.add('/ws/docs/assets/a.drawio.svg');
      for (let i = 2; i <= 51; i++) taken.add(`/ws/docs/assets/a-${i}.drawio.svg`);

      const result = await storeDrawioAssetNextToDocument(
        fileOf('a.drawio.svg', DRAWIO_SVG),
        '/ws/docs/notes.md',
      );

      expect(result.fileName).toBe('a-51.drawio.svg');
    });
  });
});

describe('uploadDrawioImagePreserveName', () => {
  it('reports the stored asset in the shape the editor inserts', async () => {
    const result = await uploadDrawioImagePreserveName(
      fileOf('flow.drawio.svg', DRAWIO_SVG),
      '/ws/docs/notes.md',
    );

    expect(result).toEqual({
      kind: 'image',
      src: './assets/flow.drawio.svg',
      altText: 'flow',
    });
  });

  it('labels a numbered file after the name the person dropped, not the one on disk', async () => {
    taken.add('/ws/docs/assets/flow.drawio.svg');

    const result = await uploadDrawioImagePreserveName(
      fileOf('flow.drawio.svg', DRAWIO_SVG),
      '/ws/docs/notes.md',
    );

    expect(result.src).toBe('./assets/flow-2.drawio.svg');
    expect(result.altText).toBe('flow');
  });
});
