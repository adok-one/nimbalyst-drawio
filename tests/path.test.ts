/**
 * A four-line path module, and every asset this extension writes goes through it. It is
 * POSIX-only on purpose (the host speaks forward slashes even on Windows), so the tests
 * feed it backslashes too.
 */
import { describe, expect, it } from 'vitest';
import { dirname, join } from '../src/utils/path.js';

describe('dirname', () => {
  it('returns the directory of a nested path', () => {
    expect(dirname('docs/notes/a.md')).toBe('docs/notes');
    expect(dirname('/ws/docs/a.md')).toBe('/ws/docs');
  });

  it('normalises Windows separators', () => {
    expect(dirname('docs\\notes\\a.md')).toBe('docs/notes');
  });

  it('returns "." for a bare filename', () => {
    expect(dirname('a.md')).toBe('.');
  });

  /**
   * Characterisation: a file at the filesystem root reports "." rather than "/", because
   * the guard is `index <= 0` and the only separator is at index 0. Nothing here opens
   * documents at the root, so it has never mattered -- but it is not what the name promises.
   */
  it('returns "." for a file directly at the root', () => {
    expect(dirname('/a.md')).toBe('.');
  });
});

describe('join', () => {
  it('joins parts with a single separator', () => {
    expect(join('docs', 'assets', 'a.drawio.svg')).toBe('docs/assets/a.drawio.svg');
  });

  it('does not double up separators the caller already wrote', () => {
    expect(join('docs/', '/assets/', '/a.svg')).toBe('docs/assets/a.svg');
  });

  it('keeps a leading slash on the first part only', () => {
    expect(join('/ws', 'docs', 'a.md')).toBe('/ws/docs/a.md');
    expect(join('docs', '/ws')).toBe('docs/ws');
  });

  it('drops empty parts instead of leaving a bare separator', () => {
    expect(join('', 'assets', '', 'a.svg')).toBe('assets/a.svg');
    expect(join()).toBe('');
  });

  it('normalises Windows separators', () => {
    expect(join('C:\\ws', 'docs\\assets', 'a.svg')).toBe('C:/ws/docs/assets/a.svg');
  });
});
