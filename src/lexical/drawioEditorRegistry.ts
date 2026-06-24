import type { LexicalEditor } from 'lexical';

const editors = new Set<LexicalEditor>();
let lastFocusedEditor: LexicalEditor | undefined;

export function registerDrawioEditor(editor: LexicalEditor): () => void {
  editors.add(editor);
  return () => {
    editors.delete(editor);
    if (lastFocusedEditor === editor) {
      lastFocusedEditor = undefined;
    }
  };
}

export function setFocusedDrawioEditor(editor: LexicalEditor): void {
  lastFocusedEditor = editor;
}

export function getFocusedDrawioEditor(): LexicalEditor | undefined {
  for (const editor of editors) {
    const root = editor.getRootElement();
    if (root?.contains(document.activeElement)) {
      return editor;
    }
  }

  if (lastFocusedEditor && editors.has(lastFocusedEditor)) {
    return lastFocusedEditor;
  }

  return editors.values().next().value;
}
