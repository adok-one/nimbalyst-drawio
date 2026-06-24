import { getExtensionContext } from '../context.js';
import { getFocusedDrawioEditor } from '../lexical/drawioEditorRegistry.js';
import { performSlashDrawioInsert } from './performSlashDrawioInsert.js';

export const slashCommandHandlers = {
  insertDrawioDiagram: () => {
    const editor = getFocusedDrawioEditor();
    if (!editor) {
      getExtensionContext().services.ui.showError('No active editor found');
      return;
    }
    performSlashDrawioInsert(editor);
  },
};
