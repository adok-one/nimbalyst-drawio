export interface ExtensionFileSystemService {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  findFiles(pattern: string): Promise<string[]>;
}

export interface ExtensionUIService {
  showInfo(message: string): void;
  showWarning(message: string): void;
  showError(message: string): void;
}

export interface ExtensionContext {
  manifest: { id: string; name: string; version: string };
  extensionPath: string;
  services: {
    filesystem: ExtensionFileSystemService;
    ui: ExtensionUIService;
  };
}

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

export interface EditorHostProps {
  host: EditorHost;
}
