import {
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  createCommand,
  defineExtension,
} from 'lexical';
import { mergeRegister, $dfs } from '@lexical/utils';
import { isDrawioAssetPath, isDrawioUploadFile, shouldPreserveDrawioFilename } from '../drawio/fileKind.js';
import { getExtensionContext } from '../context.js';
import { rememberDroppedFiles } from '../markdown/pendingUploadName.js';
import { getDocumentPathFromElement } from '../utils/resolveDrawioAssetUrl.js';
import { performSlashDrawioInsert } from '../markdown/performSlashDrawioInsert.js';
import { uploadDrawioImagePreserveName, type UploadedDrawioImage } from '../markdown/drawioUpload.js';
import { INSERT_DRAWIO_COMMAND } from './DrawioCommands.js';
import { $createDrawioNode } from './DrawioNode.js';
import { DrawioNode } from './DrawioNode.js';
import {
  registerDrawioEditor,
  setFocusedDrawioEditor,
} from './drawioEditorRegistry.js';
import { $migrateDrawioImageNodes } from './migrateDrawioImageNodes.js';

const DRAWIO_SLASH_COMMAND = createCommand<void>('drawio.insert');

function $hasDrawioImageNodesToMigrate(): boolean {
  for (const { node } of $dfs($getRoot())) {
    if (
      node.getType() === 'image' &&
      typeof (node as { getSrc?: () => string }).getSrc === 'function' &&
      isDrawioAssetPath((node as { getSrc: () => string }).getSrc())
    ) {
      return true;
    }
  }
  return false;
}

function mightBeDrawioUpload(files: FileList | File[]): boolean {
  return Array.from(files).some((file) => {
    const lower = file.name.toLowerCase();
    return (
      shouldPreserveDrawioFilename(file) ||
      file.type === 'image/svg+xml' ||
      file.type === 'image/png' ||
      file.type === 'application/xml' ||
      file.type === 'text/xml' ||
      file.type === 'application/vnd.jgraph.mxfile' ||
      lower.endsWith('.svg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.drawio') ||
      lower.endsWith('.dio') ||
      lower.endsWith('.xml')
    );
  });
}

async function collectDrawioFiles(files: FileList | File[]): Promise<File[]> {
  const matches: File[] = [];
  for (const file of Array.from(files)) {
    if (await isDrawioUploadFile(file)) {
      matches.push(file);
    }
  }
  return matches;
}

export const DrawioLexicalExtension = defineExtension({
  name: 'com.altusnova.drawio/lexical',
  nodes: [DrawioNode],
  register: (editor) => {
    const onFocusIn = () => {
      setFocusedDrawioEditor(editor);
    };

    const insertDrawioAssetNode = (asset: UploadedDrawioImage) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }
        $insertNodes([
          $createDrawioNode({
            altText: asset.altText,
            src: asset.src,
          }),
        ]);
      });
    };

    const handleDrawioFileEvent = (
      event: DragEvent | ClipboardEvent,
      files: FileList,
      source: string,
    ) => {
      rememberDroppedFiles(files);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const documentPath = getDocumentPathFromElement(editor.getRootElement());

      void (async () => {
        try {
          const drawioFiles = await collectDrawioFiles(files);
          for (const file of drawioFiles) {
            const asset = await uploadDrawioImagePreserveName(file, documentPath);
            insertDrawioAssetNode(asset);
          }
        } catch (error) {
          console.error(`[DrawioLexicalExtension] ${source} failed:`, error);
          getExtensionContext().services.ui.showError(
            error instanceof Error ? error.message : 'Failed to store draw.io diagram',
          );
        }
      })();
    };

    const onDrop = (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0 || !mightBeDrawioUpload(files)) {
        return;
      }
      handleDrawioFileEvent(event, files, 'Drop');
    };

    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (!files || files.length === 0 || !mightBeDrawioUpload(files)) {
        return;
      }
      handleDrawioFileEvent(event, files, 'Paste');
    };

    return mergeRegister(
      registerDrawioEditor(editor),
      editor.registerRootListener((rootElement, prevElement) => {
        prevElement?.removeEventListener('focusin', onFocusIn, true);
        rootElement?.addEventListener('focusin', onFocusIn, true);
      }),
      () => {
        const root = editor.getRootElement();
        root?.removeEventListener('focusin', onFocusIn, true);
      },
      editor.registerUpdateListener(({ tags }) => {
        if (tags.has('drawio-image-migration')) {
          return;
        }
        const needsMigration = editor.getEditorState().read(() => $hasDrawioImageNodesToMigrate());
        if (!needsMigration) {
          return;
        }
        editor.update(
          () => {
            $migrateDrawioImageNodes();
          },
          { tag: 'drawio-image-migration' },
        );
      }),
      editor.registerCommand(
        INSERT_DRAWIO_COMMAND,
        (payload) => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $insertNodes([
              $createDrawioNode({
                altText: payload?.altText ?? 'diagram',
                src: payload?.src ?? './assets/diagram.drawio.svg',
              }),
            ]);
          }
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        DRAWIO_SLASH_COMMAND,
        () => {
          performSlashDrawioInsert(editor);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerRootListener((rootElement, prevElement) => {
        prevElement?.removeEventListener('drop', onDrop, true);
        prevElement?.removeEventListener('paste', onPaste, true);
        rootElement?.addEventListener('drop', onDrop, true);
        rootElement?.addEventListener('paste', onPaste, true);
      }),
      () => {
        const root = editor.getRootElement();
        root?.removeEventListener('drop', onDrop, true);
        root?.removeEventListener('paste', onPaste, true);
      },
    );
  },
});
