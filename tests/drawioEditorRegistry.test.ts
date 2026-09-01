/**
 * A slash command arrives from the host with no editor attached, so the extension has to
 * work out which one the person is typing in. With several documents open that guess is the
 * difference between the diagram landing in this page or in another one.
 */
import { createEditor, type LexicalEditor } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getFocusedDrawioEditor,
  registerDrawioEditor,
  setFocusedDrawioEditor,
} from '../src/lexical/drawioEditorRegistry.js';

const cleanups: Array<() => void> = [];

/**
 * An editor attached to a real element in the document. The element is focused directly
 * rather than through a child: `setRootElement` hands the element's contents to Lexical,
 * which reconciles away anything put there first.
 */
function mountEditor(): { editor: LexicalEditor; root: HTMLElement; focus: () => void } {
  const editor = createEditor({ namespace: 'test', onError: (e) => { throw e; } });
  const root = document.createElement('div');
  root.contentEditable = 'true';
  root.tabIndex = -1;
  document.body.appendChild(root);
  editor.setRootElement(root);
  cleanups.push(registerDrawioEditor(editor));
  return { editor, root, focus: () => root.focus() };
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  document.body.innerHTML = '';
});

describe('getFocusedDrawioEditor', () => {
  it('reports nothing when no editor is registered', () => {
    expect(getFocusedDrawioEditor()).toBeUndefined();
  });

  it('prefers the editor that actually contains the focus', () => {
    const first = mountEditor();
    const second = mountEditor();

    second.focus();

    expect(getFocusedDrawioEditor()).toBe(second.editor);
    expect(getFocusedDrawioEditor()).not.toBe(first.editor);
  });

  it('falls back to the last one told it was focused', () => {
    const first = mountEditor();
    const second = mountEditor();

    setFocusedDrawioEditor(second.editor);
    (document.activeElement as HTMLElement | null)?.blur();

    expect(getFocusedDrawioEditor()).toBe(second.editor);
    expect(first.editor).toBeDefined();
  });

  it('falls back to any registered editor when nothing is focused', () => {
    const only = mountEditor();
    expect(getFocusedDrawioEditor()).toBe(only.editor);
  });

  /**
   * Unregistering has to clear the remembered one as well, or a closed tab keeps being the
   * answer and the insert goes to an editor that is no longer on screen.
   */
  it('forgets an editor that unregistered, even if it was the focused one', () => {
    const first = mountEditor();
    const second = mountEditor();
    setFocusedDrawioEditor(second.editor);

    cleanups.pop()!(); // unregister `second`

    expect(getFocusedDrawioEditor()).toBe(first.editor);
  });

  it('reports nothing again once the last editor unregisters', () => {
    mountEditor();
    cleanups.pop()!();
    expect(getFocusedDrawioEditor()).toBeUndefined();
  });

  it('does not return a stale editor whose root was never focused', () => {
    const first = mountEditor();
    setFocusedDrawioEditor(first.editor);
    cleanups.pop()!();

    const second = mountEditor();
    expect(getFocusedDrawioEditor()).toBe(second.editor);
  });
});
