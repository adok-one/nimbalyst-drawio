/**
 * The custom editor tab -- opening a `.drawio` file directly rather than through a page. It
 * owns one decision the rest of the extension does not: which draw.io export to run when the
 * host asks it to save, and in which encoding to hand the result back.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lifecycleHost,
  lifecycleOptions,
  resetLifecycle,
  setLifecycleResult,
} from './stubs/nimbalyst-runtime.js';
import type { EditorHost } from '../src/types/extension.js';

const instances: MockClient[] = [];
const applyDrawioContentToClient = vi.fn(async (..._args: unknown[]) => undefined);
/** Whether a new canvas reports itself ready on its own; one test needs one that does not. */
let autoReady = true;

class MockClient {
  getXml = vi.fn(async () => '<mxfile host="app"></mxfile>');
  exportAsSvgWithEmbeddedXml = vi.fn(async () => new TextEncoder().encode('<svg/>'));
  exportAsPngWithEmbeddedXml = vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

  constructor(public container: HTMLElement) {
    instances.push(this);
  }
  onReady(handler: () => void): () => void {
    if (autoReady) queueMicrotask(() => handler());
    return () => {};
  }
  onChange(): () => void {
    return () => {};
  }
  onSave(): () => void {
    return () => {};
  }
  destroy(): void {}
}

vi.mock('../src/drawio/DrawioClient.js', () => ({ DrawioClient: MockClient }));
vi.mock('../src/utils/drawioFileIO.js', () => ({
  applyDrawioContentToClient: (...args: unknown[]) => applyDrawioContentToClient(...args),
}));

const { DrawioEditor } = await import('../src/components/DrawioEditor.js');

let host: EditorHost & {
  saveContent: ReturnType<typeof vi.fn>;
  setDirty: ReturnType<typeof vi.fn>;
  loadContent: ReturnType<typeof vi.fn>;
  loadBinaryContent: ReturnType<typeof vi.fn>;
};
let fileChanged: (() => void) | null;

function makeHost(fileName: string): typeof host {
  return {
    filePath: `/ws/docs/assets/${fileName}`,
    fileName,
    theme: 'dark',
    isActive: true,
    readOnly: false,
    loadContent: vi.fn(async () => '<svg/>'),
    loadBinaryContent: vi.fn(async () => new Uint8Array([1, 2]).buffer),
    onFileChanged: (callback: () => void) => {
      fileChanged = callback;
      return () => {
        fileChanged = null;
      };
    },
    setDirty: vi.fn(),
    saveContent: vi.fn(async () => undefined),
    onSaveRequested: () => () => {},
    onThemeChanged: () => () => {},
  } as unknown as typeof host;
}

beforeEach(() => {
  instances.length = 0;
  autoReady = true;
  fileChanged = null;
  resetLifecycle();
  host = makeHost('flow.drawio.svg');
});

afterEach(() => {
  resetLifecycle();
  vi.restoreAllMocks();
});

describe('what it shows', () => {
  it('says it is loading while the host is still fetching', () => {
    setLifecycleResult({ isLoading: true });

    render(<DrawioEditor host={host} />);

    expect(screen.getByText(/loading diagram/i)).toBeDefined();
  });

  it('shows the reason the file would not open', () => {
    setLifecycleResult({ error: new Error('unreadable file') });

    render(<DrawioEditor host={host} />);

    expect(screen.getByText(/unreadable file/)).toBeDefined();
  });

  it('renders the canvas, carrying the host theme and read-only state', () => {
    setLifecycleResult({ theme: 'dark' });

    const { container } = render(<DrawioEditor host={host} />);

    const editor = container.querySelector('.drawio-editor')!;
    expect(editor.classList.contains('drawio-editor--dark')).toBe(true);
    expect(editor.getAttribute('data-readonly')).toBe('false');
    expect(container.querySelector('.drawio-editor__canvas')).not.toBeNull();
  });

  it('marks a read-only host', () => {
    render(<DrawioEditor host={{ ...host, readOnly: true }} />);

    expect(document.querySelector('.drawio-editor')!.getAttribute('data-readonly')).toBe('true');
  });
});

describe('the lifecycle contract', () => {
  it('asks for binary content only for a PNG', () => {
    render(<DrawioEditor host={makeHost('flow.drawio.svg')} />);
    expect(lifecycleOptions().binary).toBe(false);

    render(<DrawioEditor host={makeHost('flow.drawio.png')} />);
    expect(lifecycleOptions().binary).toBe(true);
  });

  it('hands content the host loaded to the canvas', async () => {
    render(<DrawioEditor host={host} />);

    lifecycleOptions().applyContent('<svg/>');

    await waitFor(() =>
      expect(applyDrawioContentToClient).toHaveBeenCalledWith(instances[0], '<svg/>', 'svg'),
    );
  });
});

describe('saving', () => {
  async function saveWith(fileName: string): Promise<MockClient> {
    render(<DrawioEditor host={makeHost(fileName)} />);
    await waitFor(() => expect(instances).toHaveLength(1));
    await lifecycleOptions().onSave!();
    return instances[0];
  }

  it('exports xmlsvg as text for a .drawio.svg', async () => {
    const client = await saveWith('flow.drawio.svg');

    expect(client.exportAsSvgWithEmbeddedXml).toHaveBeenCalled();
    expect(lifecycleHostSaved()).toBe('<svg/>');
  });

  it('exports xmlpng as bytes for a .drawio.png', async () => {
    render(<DrawioEditor host={makeHost('flow.drawio.png')} />);
    await waitFor(() => expect(instances).toHaveLength(1));

    const savingHost = saveHost();
    await lifecycleOptions().onSave!();

    expect(instances[0].exportAsPngWithEmbeddedXml).toHaveBeenCalled();
    expect(savingHost.saveContent.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer);
  });

  it('writes the canvas XML straight out for a .drawio', async () => {
    const client = await saveWith('flow.drawio');

    expect(client.getXml).toHaveBeenCalled();
    expect(client.exportAsSvgWithEmbeddedXml).not.toHaveBeenCalled();
    expect(lifecycleHostSaved()).toBe('<mxfile host="app"></mxfile>');
  });

  it('clears the dirty flag only after the write went through', async () => {
    await saveWith('flow.drawio.svg');

    const savingHost = saveHost();
    expect(savingHost.setDirty).toHaveBeenCalledWith(false);
    // Vitest has no `toHaveBeenCalledBefore`; the invocation counters answer the same question.
    expect(savingHost.saveContent.mock.invocationCallOrder[0]).toBeLessThan(
      savingHost.setDirty.mock.invocationCallOrder[0],
    );
  });

  it('leaves the file dirty when the export failed', async () => {
    render(<DrawioEditor host={makeHost('flow.drawio.svg')} />);
    await waitFor(() => expect(instances).toHaveLength(1));
    instances[0].exportAsSvgWithEmbeddedXml.mockRejectedValue(new Error('export failed'));

    const savingHost = saveHost();
    await expect(lifecycleOptions().onSave!()).rejects.toThrow('export failed');
    expect(savingHost.setDirty).not.toHaveBeenCalledWith(false);
  });
});

describe('when the canvas is not there yet', () => {
  it('saves nothing rather than throwing when there is no client', async () => {
    const bareHost = makeHost('flow.drawio.svg');
    // No container is mounted for the hook to build a client into.
    render(<DrawioEditor host={bareHost} />);
    instances.length = 0;

    await expect(lifecycleOptions().onSave!()).resolves.toBeUndefined();
  });
});

describe('a file changed underneath', () => {
  it('ignores an external change that arrives before the canvas is ready', async () => {
    autoReady = false;
    render(<DrawioEditor host={host} />);
    await waitFor(() => expect(fileChanged).not.toBeNull());

    // The canvas never reported ready, so there is nowhere to put new content and
    // re-reading the file would only be thrown away.
    fileChanged!();
    await Promise.resolve();

    expect(host.loadContent).not.toHaveBeenCalled();
  });

  it('reloads the canvas from the host', async () => {
    render(<DrawioEditor host={host} />);
    await waitFor(() => expect(instances).toHaveLength(1));
    await waitFor(() => expect(fileChanged).not.toBeNull());
    // The canvas reports ready on a microtask; the reload is skipped before that.
    await Promise.resolve();

    fileChanged!();

    await waitFor(() => expect(host.loadContent).toHaveBeenCalled());
  });

  it('reads binary for a PNG', async () => {
    const pngHost = makeHost('flow.drawio.png');
    render(<DrawioEditor host={pngHost} />);
    await waitFor(() => expect(fileChanged).not.toBeNull());
    await Promise.resolve();

    fileChanged!();

    await waitFor(() => expect(pngHost.loadBinaryContent).toHaveBeenCalled());
    expect(pngHost.loadContent).not.toHaveBeenCalled();
  });

  it('logs and carries on when the reload failed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    host.loadContent.mockRejectedValue(new Error('gone'));
    render(<DrawioEditor host={host} />);
    await waitFor(() => expect(fileChanged).not.toBeNull());
    await Promise.resolve();

    fileChanged!();

    await waitFor(() => expect(error).toHaveBeenCalled());
  });
});

/** The host object the component most recently rendered with, as the stub recorded it. */
function saveHost(): typeof host {
  return lifecycleHost() as typeof host;
}

function lifecycleHostSaved(): unknown {
  return saveHost().saveContent.mock.calls[0][0];
}
