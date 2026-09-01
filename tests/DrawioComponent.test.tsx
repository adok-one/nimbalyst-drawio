/**
 * The widget in the page. Its job is to show a picture of a file that is not itself a
 * picture, from three formats with three different answers, and to hand back every blob URL
 * it creates -- a document full of diagrams that never revokes them leaks the whole lot.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readDrawioFile = vi.fn();
const exportDrawioPreviewBlob = vi.fn();
const overlayProps = vi.fn();

vi.mock('../src/utils/drawioFileIO.js', () => ({
  readDrawioFile: (...args: unknown[]) => readDrawioFile(...args),
}));
vi.mock('../src/drawio/preview.js', () => ({
  exportDrawioPreviewBlob: (...args: unknown[]) => exportDrawioPreviewBlob(...args),
}));
vi.mock('../src/components/DrawioEditOverlay.js', () => ({
  DrawioEditOverlay: (props: Record<string, unknown>) => {
    overlayProps(props);
    return <div data-testid="overlay">{String(props.absolutePath)}</div>;
  },
}));

const { DrawioComponent } = await import('../src/lexical/DrawioComponent.js');

type TestWindow = { __workspacePath?: string; __currentDocumentPath?: string };

let created: string[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  let counter = 0;
  // jsdom has neither of these.
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:mock/${counter++}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });

  const w = window as unknown as TestWindow;
  w.__workspacePath = '/ws';
  w.__currentDocumentPath = '/ws/docs/notes.md';

  readDrawioFile.mockResolvedValue({ kind: 'svg', content: '<svg/>' });
  exportDrawioPreviewBlob.mockResolvedValue(null);
});

afterEach(() => {
  const w = window as unknown as TestWindow;
  delete w.__workspacePath;
  delete w.__currentDocumentPath;
});

function preview(): HTMLImageElement | null {
  return document.querySelector('img.drawio-preview');
}

describe('showing the diagram', () => {
  it('reads the file itself and shows it as a blob, not through the asset URL', async () => {
    render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />);

    await waitFor(() => expect(preview()).not.toBeNull());
    expect(readDrawioFile).toHaveBeenCalledWith('/ws/docs/assets/a.drawio.svg');
    expect(preview()!.getAttribute('src')).toBe(created[0]);
    expect(preview()!.getAttribute('alt')).toBe('flow');
  });

  it('shows a PNG the same way', async () => {
    readDrawioFile.mockResolvedValue({ kind: 'png', content: new Uint8Array([0x89, 0x50]) });

    render(<DrawioComponent src="./assets/a.drawio.png" altText="flow" />);

    await waitFor(() => expect(preview()).not.toBeNull());
  });

  it('renders plain XML through the exported preview', async () => {
    readDrawioFile.mockResolvedValue({ kind: 'xml', content: '<mxfile host="app"></mxfile>' });
    exportDrawioPreviewBlob.mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }));

    render(<DrawioComponent src="./assets/a.drawio" altText="flow" />);

    await waitFor(() => expect(preview()).not.toBeNull());
    expect(exportDrawioPreviewBlob).toHaveBeenCalledWith('/ws/docs/assets/a.drawio', 'xml');
  });

  /**
   * The export needs the draw.io canvas, which needs the network. Offline, that fails -- and
   * the widget has to say so rather than show a broken image, because Edit still works.
   */
  it('falls back to a placeholder when the XML preview cannot be exported', async () => {
    readDrawioFile.mockResolvedValue({ kind: 'xml', content: '<mxfile host="app"></mxfile>' });
    exportDrawioPreviewBlob.mockResolvedValue(null);

    render(<DrawioComponent src="./assets/a.drawio" altText="flow" />);

    await waitFor(() => expect(screen.getByText(/preview unavailable/i)).toBeDefined());
    expect(preview()).toBeNull();
  });

  it('falls back to the asset URL when the file cannot be read at all', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    readDrawioFile.mockRejectedValue(new Error('ENOENT'));

    render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />);

    await waitFor(() => expect(preview()).not.toBeNull());
    expect(preview()!.getAttribute('src')).toMatch(/^nim-asset:\/\/local\/.+\?v=\d+$/);
  });

  it('shows the placeholder for an unreadable .drawio rather than a broken image', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    readDrawioFile.mockRejectedValue(new Error('ENOENT'));

    render(<DrawioComponent src="./assets/a.drawio" altText="flow" />);

    await waitFor(() => expect(screen.getByText(/preview unavailable/i)).toBeDefined());
  });

  it('names the file in the header', async () => {
    render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />);

    await waitFor(() => expect(screen.getByText('a.drawio.svg')).toBeDefined());
    expect(screen.getByText('Draw.io Diagram')).toBeDefined();
  });
});

describe('blob URLs', () => {
  it('revokes the one it made when the widget goes away', async () => {
    const { unmount } = render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />);
    await waitFor(() => expect(created).toHaveLength(1));

    unmount();

    expect(revoked).toContain(created[0]);
  });

  it('revokes the old one before making a new one on Redraw', async () => {
    render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />);
    await waitFor(() => expect(created).toHaveLength(1));

    screen.getByText('Redraw').click();

    await waitFor(() => expect(created).toHaveLength(2));
    expect(revoked).toContain(created[0]);
  });
});

describe('editing', () => {
  it('opens the overlay on the file the widget points at', async () => {
    render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />);
    await waitFor(() => expect(preview()).not.toBeNull());

    screen.getByText('Edit').click();

    await waitFor(() => expect(screen.getByTestId('overlay')).toBeDefined());
    expect(overlayProps).toHaveBeenCalledWith(
      expect.objectContaining({ absolutePath: '/ws/docs/assets/a.drawio.svg' }),
    );
  });

  it('resolves the file against the document the widget is in, not the focused one', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-file-path', '/ws/other/elsewhere.md');
    document.body.appendChild(host);

    render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />, { container: host });

    await waitFor(() => expect(readDrawioFile).toHaveBeenCalledWith('/ws/other/assets/a.drawio.svg'));
  });

  it('closes the overlay again', async () => {
    render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />);
    await waitFor(() => expect(preview()).not.toBeNull());
    screen.getByText('Edit').click();
    await waitFor(() => expect(screen.getByTestId('overlay')).toBeDefined());

    const { onClose } = overlayProps.mock.calls.at(-1)![0] as { onClose: () => void };
    onClose();

    await waitFor(() => expect(screen.queryByTestId('overlay')).toBeNull());
  });

  it('re-reads the file after the overlay saved it', async () => {
    render(<DrawioComponent src="./assets/a.drawio.svg" altText="flow" />);
    await waitFor(() => expect(preview()).not.toBeNull());
    screen.getByText('Edit').click();
    await waitFor(() => expect(screen.getByTestId('overlay')).toBeDefined());

    const before = readDrawioFile.mock.calls.length;
    const { onSaved } = overlayProps.mock.calls.at(-1)![0] as { onSaved: () => void };
    onSaved();

    await waitFor(() => expect(readDrawioFile.mock.calls.length).toBeGreaterThan(before));
  });
});
