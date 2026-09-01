/**
 * The inline Edit dialog: the full draw.io canvas over the page, for a diagram embedded in
 * markdown. The parts worth testing are the ones a person loses work to -- Save reporting
 * failure instead of closing, and Escape asking before throwing away an unsaved change.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readDrawioFile = vi.fn();
const saveDrawioFile = vi.fn();
const applyDrawioContentToClient = vi.fn(async (..._args: unknown[]) => undefined);
const instances: MockClient[] = [];

class MockClient {
  private readyHandlers = new Set<() => void>();
  private changeHandlers = new Set<() => void>();

  constructor(public container: HTMLElement) {
    instances.push(this);
  }
  onReady(handler: () => void): () => void {
    this.readyHandlers.add(handler);
    // The real canvas is ready a tick later; matching that keeps the queueing path live.
    queueMicrotask(() => handler());
    return () => this.readyHandlers.delete(handler);
  }
  onChange(handler: () => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }
  onSave(): () => void {
    return () => {};
  }
  destroy(): void {}

  emitChange(): void {
    for (const handler of this.changeHandlers) handler();
  }
}

vi.mock('../src/drawio/DrawioClient.js', () => ({ DrawioClient: MockClient }));
vi.mock('../src/utils/drawioFileIO.js', () => ({
  readDrawioFile: (...args: unknown[]) => readDrawioFile(...args),
  saveDrawioFile: (...args: unknown[]) => saveDrawioFile(...args),
  applyDrawioContentToClient: (...args: unknown[]) => applyDrawioContentToClient(...args),
}));

const { DrawioEditOverlay } = await import('../src/components/DrawioEditOverlay.js');

const PATH = '/ws/docs/assets/flow.drawio.svg';
let onClose: ReturnType<typeof vi.fn>;
let onSaved: ReturnType<typeof vi.fn>;

function open(absolutePath = PATH) {
  return render(<DrawioEditOverlay absolutePath={absolutePath} onClose={onClose} onSaved={onSaved} />);
}

async function openAndLoad(absolutePath = PATH) {
  const view = open(absolutePath);
  await waitFor(() => expect(screen.queryByText(/loading diagram/i)).toBeNull());
  return view;
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
}

beforeEach(() => {
  instances.length = 0;
  onClose = vi.fn();
  onSaved = vi.fn();
  readDrawioFile.mockResolvedValue({ kind: 'svg', content: '<svg/>' });
  saveDrawioFile.mockResolvedValue(undefined);
  applyDrawioContentToClient.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('opening', () => {
  it('is a modal dialog, named after the file', async () => {
    await openAndLoad();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Edit flow.drawio.svg');
    expect(screen.getByText('flow.drawio.svg')).toBeDefined();
  });

  it('renders into the body, so the editor cannot clip it', async () => {
    const { container } = await openAndLoad();

    expect(container.querySelector('.drawio-overlay')).toBeNull();
    expect(document.body.querySelector('.drawio-overlay')).not.toBeNull();
  });

  it('says it is loading, then loads the file into the canvas', async () => {
    open();

    expect(screen.getByText(/loading diagram/i)).toBeDefined();

    await waitFor(() => expect(screen.queryByText(/loading diagram/i)).toBeNull());
    expect(readDrawioFile).toHaveBeenCalledWith(PATH);
    await waitFor(() =>
      expect(applyDrawioContentToClient).toHaveBeenCalledWith(instances[0], '<svg/>', 'svg'),
    );
  });

  it('takes the file kind from the path, not from the caller', async () => {
    readDrawioFile.mockResolvedValue({ kind: 'png', content: new Uint8Array([1]) });

    await openAndLoad('/ws/docs/assets/flow.drawio.png');

    await waitFor(() =>
      expect(applyDrawioContentToClient).toHaveBeenCalledWith(instances[0], expect.anything(), 'png'),
    );
  });

  it('drops a load that finished after it was closed', async () => {
    let release: (value: { kind: string; content: string }) => void = () => {};
    readDrawioFile.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const { unmount } = open();
    unmount();
    release({ kind: 'svg', content: '<svg/>' });
    await Promise.resolve();

    expect(applyDrawioContentToClient).not.toHaveBeenCalled();
  });

  it('shows why it could not open the file', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    readDrawioFile.mockRejectedValue(new Error('ENOENT: no such file'));

    open();

    await waitFor(() => expect(screen.getByText('ENOENT: no such file')).toBeDefined());
  });

  it('will not offer Save for a diagram that never loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    readDrawioFile.mockRejectedValue(new Error('ENOENT'));

    open();

    await waitFor(() => expect(screen.getByText('ENOENT')).toBeDefined());
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('saving', () => {
  it('writes the file, tells the widget, and closes', async () => {
    await openAndLoad();

    screen.getByText('Save').click();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saveDrawioFile).toHaveBeenCalledWith(PATH, 'svg', instances[0]);
    expect(onSaved).toHaveBeenCalled();
  });

  /** Closing on a failed save is how an edit disappears with nothing written and nothing said. */
  it('stays open and says why when the write failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    saveDrawioFile.mockRejectedValue(new Error('read-only file system'));
    await openAndLoad();

    screen.getByText('Save').click();

    await waitFor(() => expect(screen.getByText('read-only file system')).toBeDefined());
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('does not start a second write while one is in flight', async () => {
    let release: () => void = () => {};
    saveDrawioFile.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    await openAndLoad();

    screen.getByText('Save').click();
    await waitFor(() => expect(screen.getByText(/saving/i)).toBeDefined());
    screen.getByText(/saving/i).click();

    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saveDrawioFile).toHaveBeenCalledTimes(1);
  });
});

describe('closing', () => {
  it('closes on Cancel when nothing was changed', async () => {
    await openAndLoad();

    screen.getByText('Cancel').click();

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    await openAndLoad();

    press('Escape');

    expect(onClose).toHaveBeenCalled();
  });

  it('ignores other keys', async () => {
    await openAndLoad();

    press('Enter');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before discarding an edit, and stays open if the answer is no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openAndLoad();
    instances[0].emitChange();

    press('Escape');

    expect(confirm).toHaveBeenCalledWith('Discard unsaved diagram changes?');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the answer is yes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openAndLoad();
    instances[0].emitChange();

    press('Escape');

    expect(onClose).toHaveBeenCalled();
  });

  it('stops listening for Escape once it is gone', async () => {
    const { unmount } = await openAndLoad();

    unmount();
    press('Escape');

    expect(onClose).not.toHaveBeenCalled();
  });
});
