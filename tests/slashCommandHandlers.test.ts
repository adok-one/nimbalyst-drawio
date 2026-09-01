/**
 * The manifest names `insertDrawioDiagram` as its slash-command handler, and the host calls
 * it with nothing: no editor, no document, no selection. Finding the editor is this module's
 * whole job, and saying so when it cannot is the other half.
 */
import { createEditor, type LexicalEditor } from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const performSlashDrawioInsert = vi.fn();
vi.mock('../src/markdown/performSlashDrawioInsert.js', () => ({
  performSlashDrawioInsert: (...args: unknown[]) => performSlashDrawioInsert(...args),
}));

const { clearExtensionContext, setExtensionContext } = await import('../src/context.js');
const { registerDrawioEditor } = await import('../src/lexical/drawioEditorRegistry.js');
const { slashCommandHandlers } = await import('../src/markdown/slashCommandHandlers.js');
type ExtensionContext = import('../src/types/extension.js').ExtensionContext;

let showError: ReturnType<typeof vi.fn>;
const cleanups: Array<() => void> = [];

function mountEditor(): LexicalEditor {
  const editor = createEditor({ namespace: 'test', onError: (e) => { throw e; } });
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.appendChild(root);
  editor.setRootElement(root);
  cleanups.push(registerDrawioEditor(editor));
  return editor;
}

beforeEach(() => {
  showError = vi.fn();
  setExtensionContext({ services: { ui: { showError } } } as unknown as ExtensionContext);
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  clearExtensionContext();
  document.body.innerHTML = '';
});

describe('insertDrawioDiagram', () => {
  it('is exported under the name the manifest points at', () => {
    expect(typeof slashCommandHandlers.insertDrawioDiagram).toBe('function');
  });

  it('runs the insert against the editor it found', () => {
    const editor = mountEditor();

    slashCommandHandlers.insertDrawioDiagram();

    expect(performSlashDrawioInsert).toHaveBeenCalledWith(editor);
  });

  it('tells the person rather than doing nothing when there is no editor', () => {
    slashCommandHandlers.insertDrawioDiagram();

    expect(performSlashDrawioInsert).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('No active editor found');
  });
});
