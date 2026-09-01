/**
 * Stands in for `@nimbalyst/runtime`, which is a peer of the host and is deliberately not a
 * dependency of this package (`vite.config.ts` externalises it; CLAUDE.md forbids adding it).
 * There is therefore nothing on disk to import, and the alias in `vitest.config.ts` points
 * at this file instead.
 *
 * It is a recorder, not a reimplementation: `useEditorLifecycle` hands the options it was
 * given to the test and returns whatever the test asked it to return. What is under test is
 * the extension's half of that contract -- which export it runs for each file kind, what it
 * passes to `host.saveContent`, and what it renders while loading or after a failure.
 */
import type { EditorHost } from '../../src/types/extension.js';

/**
 * The two option/result shapes are declared in `src/types/nimbalyst-runtime.d.ts` as part of
 * an ambient `declare module`, which this alias replaces -- so they are restated here rather
 * than imported from a module that, at type level, is now this file.
 */
type AnyOptions = {
  applyContent: (content: unknown) => void;
  binary?: boolean;
  onSave?: () => void | Promise<void>;
  onLoaded?: () => void;
  onExternalChange?: (content: unknown) => void;
};

type UseEditorLifecycleResult = {
  isLoading: boolean;
  error: Error | null;
  theme: string;
  markDirty: () => void;
  isDirty: boolean;
};

let lastOptions: AnyOptions | null = null;
let lastHost: EditorHost | null = null;
let result: UseEditorLifecycleResult = {
  isLoading: false,
  error: null,
  theme: 'light',
  markDirty: () => {},
  isDirty: false,
};

export function useEditorLifecycle(host: EditorHost, options: AnyOptions): UseEditorLifecycleResult {
  lastHost = host;
  lastOptions = options;
  return result;
}

/** What the component passed in on its most recent render. */
export function lifecycleOptions(): AnyOptions {
  if (!lastOptions) throw new Error('useEditorLifecycle has not been called');
  return lastOptions;
}

export function lifecycleHost(): EditorHost {
  if (!lastHost) throw new Error('useEditorLifecycle has not been called');
  return lastHost;
}

export function setLifecycleResult(next: Partial<UseEditorLifecycleResult>): void {
  result = { ...result, ...next };
}

export function resetLifecycle(): void {
  lastOptions = null;
  lastHost = null;
  result = { isLoading: false, error: null, theme: 'light', markDirty: () => {}, isDirty: false };
}
