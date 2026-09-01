/**
 * The host's upload pipeline does not tell the extension what the dropped file was called,
 * so the name is stashed on the way past and picked up on the other side. Module-level
 * state with a time limit -- which is exactly the kind of thing that works until two drops
 * happen close together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeUploadFileName,
  peekUploadFileName,
  rememberDroppedFiles,
  rememberUploadFileName,
} from '../src/markdown/pendingUploadName.js';

/** The module keeps its state across imports; every test starts from nothing. */
function drain(): void {
  for (let i = 0; i < 3; i++) consumeUploadFileName();
}

beforeEach(drain);
afterEach(() => {
  vi.useRealTimers();
  drain();
});

describe('rememberUploadFileName', () => {
  it('hands the name back once and then forgets it', () => {
    rememberUploadFileName('a.drawio.svg');
    expect(consumeUploadFileName()).toBe('a.drawio.svg');
    expect(consumeUploadFileName()).toBeUndefined();
  });

  it('peeking does not consume', () => {
    rememberUploadFileName('a.drawio.svg');
    expect(peekUploadFileName()).toBe('a.drawio.svg');
    expect(peekUploadFileName()).toBe('a.drawio.svg');
    expect(consumeUploadFileName()).toBe('a.drawio.svg');
  });

  it('trims, and ignores a name that is only whitespace', () => {
    rememberUploadFileName('  a.drawio  ');
    expect(consumeUploadFileName()).toBe('a.drawio');

    rememberUploadFileName('   ');
    expect(consumeUploadFileName()).toBeUndefined();
  });

  it('the newest name wins -- a second drop replaces a first that was never read', () => {
    rememberUploadFileName('first.drawio');
    rememberUploadFileName('second.drawio');
    expect(consumeUploadFileName()).toBe('second.drawio');
  });
});

describe('the ten-second limit', () => {
  it('drops a name nobody came back for', () => {
    vi.useFakeTimers();
    rememberUploadFileName('stale.drawio');

    vi.advanceTimersByTime(10_001);

    expect(peekUploadFileName()).toBeUndefined();
    expect(consumeUploadFileName()).toBeUndefined();
  });

  it('expires on consume as well as on peek -- the real caller only ever consumes', () => {
    vi.useFakeTimers();
    rememberUploadFileName('stale.drawio');

    vi.advanceTimersByTime(10_001);

    expect(consumeUploadFileName()).toBeUndefined();
  });

  it('keeps one that is still within it', () => {
    vi.useFakeTimers();
    rememberUploadFileName('fresh.drawio');

    vi.advanceTimersByTime(9_000);

    expect(consumeUploadFileName()).toBe('fresh.drawio');
  });
});

describe('rememberDroppedFiles', () => {
  const file = (name: string) => new File(['x'], name);

  it('remembers the first file of a drop', () => {
    rememberDroppedFiles([file('a.drawio.svg'), file('b.drawio.svg')]);
    expect(peekUploadFileName()).toBe('a.drawio.svg');
  });

  /**
   * Characterisation of a real asymmetry: a drop writes the name into BOTH stores, and
   * consuming clears only the pending one, so the same name comes back a second time. The
   * caller that reads it twice gets a diagram named after the previous drop -- which is
   * survivable only because the second read then clears it.
   */
  it('a dropped name survives one extra consume', () => {
    rememberDroppedFiles([file('a.drawio.svg')]);

    expect(consumeUploadFileName()).toBe('a.drawio.svg');
    expect(consumeUploadFileName()).toBe('a.drawio.svg');
    expect(consumeUploadFileName()).toBeUndefined();
  });

  it('an empty drop leaves whatever was there', () => {
    rememberUploadFileName('typed.drawio');
    rememberDroppedFiles([]);
    expect(consumeUploadFileName()).toBe('typed.drawio');
  });
});
