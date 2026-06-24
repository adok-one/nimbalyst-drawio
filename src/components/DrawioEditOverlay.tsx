import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDrawioFileKind } from '../drawio/fileKind.js';
import { readDrawioFile, saveDrawioFile } from '../utils/drawioFileIO.js';
import { useDrawioClient } from './useDrawioClient.js';

type DrawioEditOverlayProps = {
  absolutePath: string;
  onClose: () => void;
  onSaved: () => void;
};

export function DrawioEditOverlay({ absolutePath, onClose, onSaved }: DrawioEditOverlayProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);

  const fileName = absolutePath.split(/[/\\]/).pop() ?? absolutePath;
  const fileKind = getDrawioFileKind(fileName);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { applyContent, getClient } = useDrawioClient({
    containerRef: canvasRef,
    fileKind,
    onChange: () => {
      dirtyRef.current = true;
    },
    onApplyError: (loadError) =>
      setError(loadError instanceof Error ? loadError.message : 'Failed to load diagram'),
  });

  const requestClose = useCallback(() => {
    if (dirtyRef.current && !window.confirm('Discard unsaved diagram changes?')) {
      return;
    }
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    const client = getClient();
    if (!client || isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await saveDrawioFile(absolutePath, fileKind, client);
      dirtyRef.current = false;
      onSaved();
      onClose();
    } catch (saveError) {
      console.error('[DrawioEditOverlay] Save failed:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to save diagram');
    } finally {
      setIsSaving(false);
    }
  }, [absolutePath, fileKind, getClient, isSaving, onClose, onSaved]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { content } = await readDrawioFile(absolutePath);
        if (cancelled) {
          return;
        }
        await applyContent(content);
        setIsLoading(false);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        console.error('[DrawioEditOverlay] Load failed:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load diagram');
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [absolutePath, applyContent]);

  return createPortal(
    <div
      className="drawio-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${fileName}`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="drawio-overlay__panel">
        <header className="drawio-overlay__header">
          <div className="drawio-overlay__title">
            <span className="drawio-overlay__label">Draw.io</span>
            <span className="drawio-overlay__filename">{fileName}</span>
          </div>
          <div className="drawio-overlay__actions">
            <button
              type="button"
              className="drawio-overlay__button drawio-overlay__button--secondary"
              disabled={isSaving}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="drawio-overlay__button drawio-overlay__button--primary"
              disabled={isLoading || isSaving || !!error}
              onClick={() => void handleSave()}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </header>

        {error ? (
          <div className="drawio-overlay__error">{error}</div>
        ) : null}

        <div className="drawio-overlay__body">
          {isLoading ? (
            <div className="drawio-overlay__loading">Loading diagram…</div>
          ) : null}
          <div ref={canvasRef} className="drawio-overlay__canvas" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
