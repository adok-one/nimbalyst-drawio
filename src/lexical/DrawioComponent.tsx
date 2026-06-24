import type { MouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawioEditOverlay } from '../components/DrawioEditOverlay.js';
import { getExtensionContext } from '../context.js';
import { exportDrawioPreviewBlob } from '../drawio/preview.js';
import { getDrawioFileKind, isDrawioAssetPath } from '../drawio/fileKind.js';
import { readDrawioFile } from '../utils/drawioFileIO.js';
import {
  getDocumentPathFromElement,
  resolveDrawioAbsolutePath,
  resolveDrawioPreviewUrl,
} from '../utils/resolveDrawioAssetUrl.js';

type DrawioComponentProps = {
  src: string;
  altText: string;
  className?: string;
};

type PreviewMode = 'loading' | 'image' | 'placeholder';

function stopLexicalPointerEvent(event: { stopPropagation(): void; preventDefault(): void }): void {
  event.stopPropagation();
  event.preventDefault();
}

export function DrawioComponent({ src, altText, className }: DrawioComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editPath, setEditPath] = useState<string | null>(null);

  const fileName = src.split('/').pop() ?? src;
  const fileKind = getDrawioFileKind(fileName);

  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => revokeBlobUrl(), [revokeBlobUrl]);

  const refreshPreview = useCallback(async () => {
    const path = getDocumentPathFromElement(containerRef.current);
    const bust = Date.now();
    setLoadError(null);
    setPreviewMode('loading');
    revokeBlobUrl();
    setResolvedSrc('');

    try {
      const absolutePath = resolveDrawioAbsolutePath(src, path);
      const { kind, content } = await readDrawioFile(absolutePath);

      if (kind === 'xml') {
        const previewBlob = await exportDrawioPreviewBlob(absolutePath, kind);
        if (previewBlob) {
          const blobUrl = URL.createObjectURL(previewBlob);
          blobUrlRef.current = blobUrl;
          setResolvedSrc(blobUrl);
          setPreviewMode('image');
          setPreviewKey((key) => key + 1);
          return;
        }
        setPreviewMode('placeholder');
        return;
      }

      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      const mime = kind === 'png' ? 'image/png' : 'image/svg+xml';
      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;
      setResolvedSrc(blobUrl);
      setPreviewMode('image');
      setPreviewKey((key) => key + 1);
      return;
    } catch (error) {
      console.warn('[DrawioComponent] Fresh preview read failed, using nim-asset:', error);
    }

    if (fileKind === 'xml') {
      setPreviewMode('placeholder');
      return;
    }

    setResolvedSrc(resolveDrawioPreviewUrl(src, path, bust));
    setPreviewMode('image');
    setPreviewKey((key) => key + 1);
  }, [fileKind, revokeBlobUrl, src]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  const handleRedraw = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      stopLexicalPointerEvent(event);
      void refreshPreview().catch((error) => {
        console.error('[DrawioComponent] Redraw failed:', error);
        setLoadError('Failed to refresh diagram preview');
      });
    },
    [refreshPreview],
  );

  const handleEdit = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      stopLexicalPointerEvent(event);
      try {
        const path = getDocumentPathFromElement(containerRef.current);
        const absolutePath = resolveDrawioAbsolutePath(src, path);
        setEditPath(absolutePath);
      } catch (error) {
        console.error('[DrawioComponent] Failed to open editor:', error);
        try {
          getExtensionContext().services.ui.showError(
            error instanceof Error ? error.message : 'Failed to open draw.io editor',
          );
        } catch {
          // Extension context may be unavailable during teardown.
        }
      }
    },
    [src],
  );

  return (
    <div
      ref={containerRef}
      className={`drawio-block my-4 border border-[var(--nim-border)] rounded-lg bg-[var(--nim-bg)] overflow-hidden ${className || ''}`}
      contentEditable={false}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="drawio-header flex items-center justify-between px-4 py-2 bg-[var(--nim-bg-secondary)] border-b border-[var(--nim-border)]">
        <span className="drawio-label font-medium text-[var(--nim-text)] text-sm flex items-center gap-2">
          Draw.io Diagram
          {isDrawioAssetPath(src) ? (
            <span className="text-[var(--nim-text-muted)] font-normal">{fileName}</span>
          ) : null}
        </span>
        <div className="drawio-header-buttons flex gap-2">
          <button
            type="button"
            className="drawio-redraw-button py-1 px-3 text-xs border border-[var(--nim-border)] rounded bg-[var(--nim-bg)] text-[var(--nim-text-muted)] cursor-pointer transition-colors hover:bg-[var(--nim-bg-hover)] hover:text-[var(--nim-text)]"
            onMouseDown={stopLexicalPointerEvent}
            onClick={(event) => {
              stopLexicalPointerEvent(event);
              handleRedraw(event);
            }}
            title="Redraw diagram"
          >
            Redraw
          </button>
          <button
            type="button"
            className="drawio-edit-button py-1 px-3 text-xs border border-[var(--nim-border)] rounded bg-[var(--nim-bg)] text-[var(--nim-text)] cursor-pointer transition-colors hover:bg-[var(--nim-bg-hover)]"
            onMouseDown={stopLexicalPointerEvent}
            onClick={handleEdit}
          >
            Edit
          </button>
        </div>
      </div>

      <div className="drawio-diagram p-4 min-h-[120px] flex flex-col items-center justify-center bg-[var(--nim-bg)]">
        {previewMode === 'loading' ? (
          <div className="drawio-preview-loading text-[var(--nim-text-muted)] text-sm">
            Loading diagram…
          </div>
        ) : null}
        {previewMode === 'image' && resolvedSrc ? (
          <img
            key={previewKey}
            alt={altText}
            className="drawio-preview max-w-full h-auto"
            draggable={false}
            onError={() => setLoadError('Failed to load diagram preview')}
            src={resolvedSrc}
          />
        ) : null}
        {previewMode === 'placeholder' ? (
          <div className="drawio-preview-placeholder">
            <span className="drawio-preview-placeholder__icon" aria-hidden="true">
              ⎘
            </span>
            <span className="drawio-preview-placeholder__name">{fileName}</span>
            <span className="drawio-preview-placeholder__hint">Preview unavailable — use Edit</span>
          </div>
        ) : null}
        {loadError ? (
          <div className="drawio-error text-[var(--nim-error)] text-sm mt-2">{loadError}</div>
        ) : null}
      </div>

      {editPath ? (
        <DrawioEditOverlay
          absolutePath={editPath}
          onClose={() => setEditPath(null)}
          onSaved={() => {
            void refreshPreview();
          }}
        />
      ) : null}
    </div>
  );
}
