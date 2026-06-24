import { getExtensionContext } from '../context.js';
import {
  isDrawioUploadFile,
  resolvePreservedDrawioFileName,
  shouldPreserveDrawioFilename,
  stripDrawioExtension,
} from '../drawio/fileKind.js';
import { getDocumentPathFromWindow } from '../utils/resolveDrawioAssetUrl.js';
import { rememberDroppedFiles, rememberUploadFileName } from './pendingUploadName.js';
import { assetsDirAbsolutePath, writeDrawioAssetToDocument } from './writeDrawioAsset.js';

async function pickAvailableFileName(assetsDirAbs: string, desiredName: string): Promise<string> {
  const fs = getExtensionContext().services.filesystem;
  const extMatch = desiredName.match(/(\.drawio\.(?:svg|png)|\.drawio|\.dio)$/i);
  const ext = extMatch?.[1] ?? '.drawio.svg';
  const stem = desiredName.slice(0, desiredName.length - ext.length) || 'diagram';

  let candidate = desiredName;
  for (let i = 0; i < 50; i++) {
    const exists = await fs.fileExists(`${assetsDirAbs}/${candidate}`);
    if (!exists) {
      return candidate;
    }
    candidate = `${stem}-${i + 2}${ext}`;
  }
  return candidate;
}

export async function storeDrawioAssetNextToDocument(
  file: File,
  documentPathOverride?: string,
): Promise<{ relativePath: string; absolutePath: string; fileName: string }> {
  const documentPath = documentPathOverride ?? getDocumentPathFromWindow();
  if (!documentPath) {
    throw new Error('Open a markdown document before adding a draw.io diagram');
  }

  rememberDroppedFiles([file]);
  rememberUploadFileName(file.name);

  const buffer = new Uint8Array(await file.arrayBuffer());
  const resolvedName = resolvePreservedDrawioFileName(file.name, buffer);
  const isDrawioFile =
    shouldPreserveDrawioFilename(file) ||
    resolvedName.toLowerCase().endsWith('.drawio.svg') ||
    resolvedName.toLowerCase().endsWith('.drawio.png') ||
    resolvedName.toLowerCase().endsWith('.drawio') ||
    resolvedName.toLowerCase().endsWith('.dio') ||
    (await isDrawioUploadFile(file));

  if (!isDrawioFile) {
    throw new Error(
      `Expected a draw.io file (*.drawio, *.drawio.svg, *.drawio.png, or draw.io content). Got "${file.name}".`,
    );
  }

  const assetsDirAbs = assetsDirAbsolutePath(documentPath);
  const fileName = await pickAvailableFileName(assetsDirAbs, resolvedName);

  return writeDrawioAssetToDocument({
    documentPath,
    fileName,
    bytes: buffer,
  });
}

export type UploadedDrawioImage = {
  kind: 'image';
  src: string;
  altText: string;
};

export async function uploadDrawioImagePreserveName(
  file: File,
  documentPathOverride?: string,
): Promise<UploadedDrawioImage> {
  const stored = await storeDrawioAssetNextToDocument(file, documentPathOverride);
  return {
    kind: 'image',
    src: stored.relativePath,
    altText: stripDrawioExtension(file.name),
  };
}
