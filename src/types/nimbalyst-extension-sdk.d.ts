declare module 'lexical' {
  export type LexicalCommand<T> = { type?: string; __payload?: T };
  export function createCommand<T>(type?: string): LexicalCommand<T>;
  export function defineExtension(config: unknown): unknown;
  export const COMMAND_PRIORITY_EDITOR: number;
}

declare module '@lexical/utils' {
  export function mergeRegister(...disposables: Array<() => void>): () => void;
  export function addClassNamesToElement(element: HTMLElement, ...classNames: string[]): void;
  export function $dfs(startNode?: unknown): Iterable<{ node: import('lexical').LexicalNode }>;
}

declare module '@lexical/markdown' {
  export type TextMatchTransformer = {
    dependencies: unknown[];
    export: (node: unknown) => string | null;
    importRegExp: RegExp;
    regExp: RegExp;
    replace: (textNode: unknown, match: RegExpMatchArray) => void;
    trigger: string;
    type: 'text-match';
  };
}

declare module '@lexical/react/LexicalComposerContext' {
  export function useLexicalComposerContext(): [unknown];
}
