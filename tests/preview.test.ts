/**
 * Previewing a plain `.drawio` file means rendering it, and the only renderer available is
 * the draw.io canvas itself -- an iframe pointed at embed.diagrams.net. A document with
 * twenty diagrams must not open twenty of those, so this module is a singleton behind a
 * queue, and that is what is tested here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const instances: MockClient[] = [];
let exportImpl: () => Promise<Uint8Array>;

class MockClient {
  destroyed = false;
  loaded: string[] = [];

  constructor(public container: HTMLElement) {
    instances.push(this);
  }

  onReady(handler: () => void): () => void {
    handler();
    return () => {};
  }

  async loadXmlLike(xml: string): Promise<void> {
    this.loaded.push(xml);
  }

  exportAsSvgWithEmbeddedXml(): Promise<Uint8Array> {
    return exportImpl();
  }

  destroy(): void {
    this.destroyed = true;
  }
}

vi.mock('../src/drawio/DrawioClient.js', () => ({ DrawioClient: MockClient }));
vi.mock('../src/utils/drawioFileIO.js', () => ({
  readDrawioFile: vi.fn(async (path: string) => ({
    kind: 'xml' as const,
    content: `<mxfile host="app"><diagram id="${path}"><mxGraphModel/></diagram></mxfile>`,
  })),
}));

const { exportDrawioPreviewBlob, destroyDrawioPreviewService } = await import('../src/drawio/preview.js');

function containers(): Element[] {
  return [...document.body.querySelectorAll('div[aria-hidden="true"]')];
}

beforeEach(() => {
  instances.length = 0;
  exportImpl = async () => new TextEncoder().encode('<svg/>');
});

afterEach(() => {
  destroyDrawioPreviewService();
  document.body.innerHTML = '';
});

describe('what it declines to do', () => {
  it.each(['svg', 'png'] as const)('returns null for %s without opening an iframe', async (kind) => {
    await expect(exportDrawioPreviewBlob('/ws/a.drawio.' + kind, kind)).resolves.toBeNull();

    expect(instances).toHaveLength(0);
    expect(containers()).toHaveLength(0);
  });
});

describe('the shared canvas', () => {
  it('renders a .drawio into an SVG blob', async () => {
    const blob = await exportDrawioPreviewBlob('/ws/a.drawio', 'xml');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe('image/svg+xml');
    expect(await blob!.text()).toBe('<svg/>');
  });

  /** The point of the module: one iframe for the whole document, however many widgets. */
  it('opens exactly one canvas however many previews are asked for', async () => {
    await exportDrawioPreviewBlob('/ws/a.drawio', 'xml');
    await exportDrawioPreviewBlob('/ws/b.drawio', 'xml');
    await exportDrawioPreviewBlob('/ws/c.drawio', 'xml');

    expect(instances).toHaveLength(1);
    expect(containers()).toHaveLength(1);
  });

  it('keeps that canvas out of the page flow and out of the accessibility tree', async () => {
    await exportDrawioPreviewBlob('/ws/a.drawio', 'xml');

    const container = containers()[0] as HTMLElement;
    expect(container.getAttribute('aria-hidden')).toBe('true');
    expect(container.style.position).toBe('fixed');
    expect(container.style.pointerEvents).toBe('none');
    expect(parseInt(container.style.left, 10)).toBeLessThan(-1000);
  });

  it('loads each file it was asked about', async () => {
    await exportDrawioPreviewBlob('/ws/a.drawio', 'xml');
    await exportDrawioPreviewBlob('/ws/b.drawio', 'xml');

    expect(instances[0].loaded).toHaveLength(2);
    expect(instances[0].loaded[0]).toContain('/ws/a.drawio');
    expect(instances[0].loaded[1]).toContain('/ws/b.drawio');
  });
});

describe('the queue', () => {
  /**
   * One canvas can only hold one diagram at a time. Two overlapping exports would export the
   * same picture twice -- so requests are serialised, and this is the test that says so.
   */
  it('never runs two exports at once', async () => {
    let running = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    exportImpl = () =>
      new Promise<Uint8Array>((resolve) => {
        running++;
        peak = Math.max(peak, running);
        release.push(() => {
          running--;
          resolve(new TextEncoder().encode('<svg/>'));
        });
      });

    const first = exportDrawioPreviewBlob('/ws/a.drawio', 'xml');
    const second = exportDrawioPreviewBlob('/ws/b.drawio', 'xml');

    // The first job reaches its export after a read and a ready-wait; the second must not
    // have reached its own while the first is still in flight.
    await vi.waitFor(() => expect(release).toHaveLength(1));
    release[0]();
    await first;

    await vi.waitFor(() => expect(release).toHaveLength(2));
    release[1]();
    await second;

    expect(peak).toBe(1);
  });

  it('turns a failed export into a null the widget can show a placeholder for', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    exportImpl = async () => {
      throw new Error('Draw.io preview timed out');
    };

    await expect(exportDrawioPreviewBlob('/ws/a.drawio', 'xml')).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('keeps working after one preview failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    exportImpl = async () => {
      throw new Error('boom');
    };
    await exportDrawioPreviewBlob('/ws/bad.drawio', 'xml');

    exportImpl = async () => new TextEncoder().encode('<svg/>');
    const blob = await exportDrawioPreviewBlob('/ws/good.drawio', 'xml');

    expect(blob).toBeInstanceOf(Blob);
  });
});

describe('destroyDrawioPreviewService', () => {
  it('takes the canvas and its container away', async () => {
    await exportDrawioPreviewBlob('/ws/a.drawio', 'xml');

    destroyDrawioPreviewService();

    expect(instances[0].destroyed).toBe(true);
    expect(containers()).toHaveLength(0);
  });

  it('builds a fresh one next time rather than reusing a destroyed canvas', async () => {
    await exportDrawioPreviewBlob('/ws/a.drawio', 'xml');
    destroyDrawioPreviewService();

    await exportDrawioPreviewBlob('/ws/a.drawio', 'xml');

    expect(instances).toHaveLength(2);
    expect(instances[1].destroyed).toBe(false);
  });

  it('is safe to call when nothing was ever previewed', () => {
    expect(() => destroyDrawioPreviewService()).not.toThrow();
  });
});
