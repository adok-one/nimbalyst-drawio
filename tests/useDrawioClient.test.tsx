/**
 * The iframe's lifecycle, shared by the custom editor and the inline overlay. Two properties
 * matter and neither is visible from the outside: content asked for before the canvas is
 * ready must not be dropped, and a re-render must not build a second iframe -- which is what
 * would happen if the callbacks were dependencies instead of refs.
 */
import { render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawioFileKind } from '../src/drawio/fileKind.js';

const instances: MockClient[] = [];
const applyDrawioContentToClient = vi.fn(async (..._args: unknown[]) => undefined);

class MockClient {
  destroyed = false;
  private readyHandlers = new Set<() => void>();
  private changeHandlers = new Set<() => void>();
  private saveHandlers = new Set<() => void>();

  constructor(public container: HTMLElement) {
    instances.push(this);
  }

  onReady(handler: () => void): () => void {
    this.readyHandlers.add(handler);
    return () => this.readyHandlers.delete(handler);
  }
  onChange(handler: () => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }
  onSave(handler: () => void): () => void {
    this.saveHandlers.add(handler);
    return () => this.saveHandlers.delete(handler);
  }
  destroy(): void {
    this.destroyed = true;
  }

  becomeReady(): void {
    for (const handler of this.readyHandlers) handler();
  }
  emitChange(): void {
    for (const handler of this.changeHandlers) handler();
  }
  emitSave(): void {
    for (const handler of this.saveHandlers) handler();
  }
}

vi.mock('../src/drawio/DrawioClient.js', () => ({ DrawioClient: MockClient }));
vi.mock('../src/utils/drawioFileIO.js', () => ({
  applyDrawioContentToClient: (...args: unknown[]) => applyDrawioContentToClient(...args),
}));

const { useDrawioClient } = await import('../src/components/useDrawioClient.js');

type Api = ReturnType<typeof useDrawioClient>;
let api: Api;

function Harness({
  fileKind = 'svg' as DrawioFileKind,
  onChange,
  onSave,
  onApplyError,
}: {
  fileKind?: DrawioFileKind;
  onChange?: () => void;
  onSave?: () => void;
  onApplyError?: (error: unknown) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  api = useDrawioClient({ containerRef, fileKind, onChange, onSave, onApplyError });
  return <div ref={containerRef} data-testid="canvas" />;
}

beforeEach(() => {
  instances.length = 0;
  applyDrawioContentToClient.mockClear();
  applyDrawioContentToClient.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the canvas', () => {
  it('is built once, into the container it was given', () => {
    const { getByTestId } = render(<Harness />);

    expect(instances).toHaveLength(1);
    expect(instances[0].container).toBe(getByTestId('canvas'));
  });

  it('is torn down on unmount', () => {
    const { unmount } = render(<Harness />);

    unmount();

    expect(instances[0].destroyed).toBe(true);
  });

  /** Callbacks are held in refs precisely so a parent re-render cannot rebuild the iframe. */
  it('is not rebuilt when only the callbacks change identity', () => {
    const { rerender } = render(<Harness onChange={() => {}} />);

    rerender(<Harness onChange={() => {}} />);
    rerender(<Harness onChange={() => {}} />);

    expect(instances).toHaveLength(1);
  });

  it('is rebuilt when the file kind changes, because the load protocol differs', () => {
    const { rerender } = render(<Harness fileKind="svg" />);

    rerender(<Harness fileKind="png" />);

    expect(instances).toHaveLength(2);
    expect(instances[0].destroyed).toBe(true);
  });
});

describe('applying content', () => {
  it('holds content asked for before the canvas is ready', async () => {
    render(<Harness />);

    await api.applyContent('<mxfile host="app"></mxfile>');
    expect(applyDrawioContentToClient).not.toHaveBeenCalled();

    instances[0].becomeReady();

    await waitFor(() =>
      expect(applyDrawioContentToClient).toHaveBeenCalledWith(
        instances[0],
        '<mxfile host="app"></mxfile>',
        'svg',
      ),
    );
  });

  it('applies straight away once it is ready', async () => {
    render(<Harness />);
    instances[0].becomeReady();

    await api.applyContent('<mxfile host="app"></mxfile>');

    expect(applyDrawioContentToClient).toHaveBeenCalledTimes(1);
  });

  it('keeps only the newest pending content -- an older load is stale by then', async () => {
    render(<Harness />);

    await api.applyContent('first');
    await api.applyContent('second');
    instances[0].becomeReady();

    await waitFor(() => expect(applyDrawioContentToClient).toHaveBeenCalledTimes(1));
    expect(applyDrawioContentToClient).toHaveBeenCalledWith(instances[0], 'second', 'svg');
  });

  it('reports a queued load that failed instead of leaving a blank canvas', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onApplyError = vi.fn();
    applyDrawioContentToClient.mockRejectedValueOnce(new Error('bad diagram'));

    render(<Harness onApplyError={onApplyError} />);
    await api.applyContent('broken');
    instances[0].becomeReady();

    await waitFor(() => expect(onApplyError).toHaveBeenCalledWith(expect.any(Error)));
    expect(error).toHaveBeenCalled();
  });

  it('says whether the canvas is ready', () => {
    render(<Harness />);

    expect(api.isReady()).toBe(false);
    instances[0].becomeReady();
    expect(api.isReady()).toBe(true);
  });

  it('hands the client out for the caller to export from', () => {
    render(<Harness />);
    expect(api.getClient()).toBe(instances[0]);
  });

  it('hands out nothing after unmount', () => {
    const { unmount } = render(<Harness />);
    unmount();
    expect(api.getClient()).toBeNull();
  });
});

describe('forwarding events', () => {
  it('passes change and save through to the current callbacks', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<Harness onChange={onChange} onSave={onSave} />);

    instances[0].emitChange();
    instances[0].emitSave();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls the newest callback, not the one from the render that built the canvas', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness onChange={first} />);

    rerender(<Harness onChange={second} />);
    instances[0].emitChange();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
