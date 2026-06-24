import type { ExtensionContext } from './types/extension.js';
import { DrawioEditor } from './components/DrawioEditor.js';
import { clearExtensionContext, setExtensionContext } from './context.js';
import { DrawioLexicalExtension, DRAWIO_IMAGE_TRANSFORMER } from './lexical/index.js';
import { slashCommandHandlers } from './markdown/slashCommandHandlers.js';
import './styles.css';

export async function activate(context: ExtensionContext): Promise<void> {
  setExtensionContext(context);
}

export function deactivate(): void {
  clearExtensionContext();
}

export const components = {
  DrawioEditor,
};

export const lexicalExtensions = {
  DrawioLexicalExtension,
};

export const transformers = {
  DRAWIO_IMAGE_TRANSFORMER,
};

export { slashCommandHandlers };
