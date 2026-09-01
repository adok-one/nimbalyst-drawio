/**
 * What the slash command creates: a new, empty, VALID diagram file beside the document.
 * "Valid" is the whole point -- v0.4.0 shipped a starter template whose payload made the
 * draw.io canvas throw a zlib error, and the file this builds is the answer to that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearExtensionContext } from '../src/context.js';
import { EMPTY_MXFILE_XML, extractMxfileFromDrawioSvg } from '../src/drawio/templates.js';
import { createDrawioDiagramBesideDocument } from '../src/markdown/storeDrawioAsset.js';

type TestWindow = { __workspacePath?: string; __currentDocumentPath?: string; electronAPI?: unknown };

let created: Array<{ path: string; content: string }>;

beforeEach(() => {
  created = [];
  const w = window as unknown as TestWindow;
  w.__workspacePath = '/ws';
  w.electronAPI = {
    invoke: vi.fn(async (channel: string, path: string, content: string) => {
      if (channel === 'create-document') created.push({ path, content });
      return { success: true };
    }),
  };
});

afterEach(() => {
  const w = window as unknown as TestWindow;
  delete w.__workspacePath;
  delete w.__currentDocumentPath;
  delete w.electronAPI;
  clearExtensionContext();
  vi.useRealTimers();
});

describe('createDrawioDiagramBesideDocument', () => {
  it('refuses when no document is open', async () => {
    await expect(createDrawioDiagramBesideDocument()).rejects.toThrow(/open a markdown document/i);
  });

  it('writes a diagram the draw.io canvas can actually open', async () => {
    await createDrawioDiagramBesideDocument('diagram', '/ws/docs/notes.md');

    expect(created).toHaveLength(1);
    expect(extractMxfileFromDrawioSvg(created[0].content)).toBe(EMPTY_MXFILE_XML);
  });

  it('returns a link for the markdown and an absolute path for the editor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:34:56.000Z'));

    const result = await createDrawioDiagramBesideDocument('diagram', '/ws/docs/notes.md');

    expect(result.relativePath).toBe('./assets/diagram-20260901123456.drawio.svg');
    expect(result.absolutePath).toBe('/ws/docs/assets/diagram-20260901123456.drawio.svg');
    expect(result.altText).toBe('diagram-20260901123456');
  });

  /** Two diagrams inserted in the same second would collide; a stamped name is the guard. */
  it('stamps the name so a second insert does not overwrite the first', async () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-09-01T12:34:56.000Z'));
    const first = await createDrawioDiagramBesideDocument('diagram', '/ws/docs/notes.md');
    vi.setSystemTime(new Date('2026-09-01T12:34:57.000Z'));
    const second = await createDrawioDiagramBesideDocument('diagram', '/ws/docs/notes.md');

    expect(first.absolutePath).not.toBe(second.absolutePath);
  });

  it('turns a title into something safe to put on a filesystem', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));

    const result = await createDrawioDiagramBesideDocument('My Diagram: v2/final!', '/ws/notes2.md');

    expect(result.altText).toBe('My-Diagram-v2-final-20260901000000');
    expect(result.relativePath).toMatch(/^\.\/assets\/[\w.-]+\.drawio\.svg$/);
  });

  it('falls back to "diagram" when the title survives sanitising as nothing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));

    const result = await createDrawioDiagramBesideDocument('!!!', '/ws/docs/notes.md');

    expect(result.altText).toBe('diagram-20260901000000');
  });

  it('uses the focused document when no path is passed', async () => {
    (window as unknown as TestWindow).__currentDocumentPath = '/ws/docs/notes.md';

    const result = await createDrawioDiagramBesideDocument();

    expect(result.absolutePath.startsWith('/ws/docs/assets/')).toBe(true);
  });
});
