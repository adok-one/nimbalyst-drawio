declare module '@nimbalyst/runtime' {
  export interface EditorHost {
    readonly filePath: string;
    readonly fileName: string;
    readonly theme: string;
    readonly isActive: boolean;
    readonly readOnly?: boolean;
    loadContent(): Promise<string>;
    loadBinaryContent(): Promise<ArrayBuffer>;
    onFileChanged(callback: (newContent: string) => void): () => void;
    setDirty(isDirty: boolean): void;
    saveContent(content: string | ArrayBuffer): Promise<void>;
    onSaveRequested(callback: () => void): () => void;
    onThemeChanged(callback: (theme: string) => void): () => void;
  }

  export interface UseEditorLifecycleOptions<T> {
    applyContent: (content: T) => void;
    getCurrentContent?: () => T;
    parse?: (raw: string) => T;
    serialize?: (content: T) => string;
    binary?: boolean;
    onLoaded?: () => void;
    onExternalChange?: (content: T) => void;
    onSave?: () => void | Promise<void>;
  }

  export interface UseEditorLifecycleResult {
    isLoading: boolean;
    error: Error | null;
    theme: string;
    markDirty: () => void;
    isDirty: boolean;
  }

  export function useEditorLifecycle<T = string>(
    host: EditorHost,
    options: UseEditorLifecycleOptions<T>,
  ): UseEditorLifecycleResult;
}
