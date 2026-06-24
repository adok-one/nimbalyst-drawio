import type { ExtensionContext } from './types/extension.js';

let extensionContext: ExtensionContext | undefined;

export function setExtensionContext(context: ExtensionContext): void {
  extensionContext = context;
}

export function getExtensionContext(): ExtensionContext {
  if (!extensionContext) {
    throw new Error('Draw.io extension is not activated');
  }
  return extensionContext;
}

export function clearExtensionContext(): void {
  extensionContext = undefined;
}
