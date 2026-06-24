import type { LexicalEditor } from 'lexical';
import { $getNodeByKey, $getSelection, $insertNodes, $isRangeSelection } from 'lexical';
import { getExtensionContext } from '../context.js';
import { $createDrawioNode, $isDrawioNode } from '../lexical/DrawioNode.js';
import { getDocumentPathFromElement } from '../utils/resolveDrawioAssetUrl.js';
import { createDrawioDiagramBesideDocument } from '../markdown/storeDrawioAsset.js';

export function performSlashDrawioInsert(editor: LexicalEditor): void {
  const documentPath = getDocumentPathFromElement(editor.getRootElement());
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return;
  }

  // Insert synchronously while the slash menu update is still active.
  // Restoring selection after async file I/O fails because the typeahead
  // menu removes the trigger text node (Lexical error #63).
  const drawioNode = $createDrawioNode({
    altText: 'diagram',
    src: './assets/diagram.drawio.svg',
  });
  $insertNodes([drawioNode]);
  const nodeKey = drawioNode.getKey();

  void (async () => {
    try {
      const created = await createDrawioDiagramBesideDocument('diagram', documentPath);
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDrawioNode(node)) {
          node.setSrc(created.relativePath);
          node.setAltText(created.altText);
        }
      });
    } catch (error) {
      console.error('[DrawioExtension] Slash insert failed:', error);
      getExtensionContext().services.ui.showError(
        error instanceof Error ? error.message : 'Failed to insert draw.io diagram',
      );
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        node?.remove();
      });
    }
  })();
}
