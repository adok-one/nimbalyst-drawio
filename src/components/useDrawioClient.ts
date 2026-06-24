import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { DrawioClient } from '../drawio/DrawioClient.js';
import type { DrawioFileKind } from '../drawio/fileKind.js';
import { applyDrawioContentToClient } from '../utils/drawioFileIO.js';

type DrawioContent = string | Uint8Array;

type UseDrawioClientOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  fileKind: DrawioFileKind;
  onChange?: () => void;
  onSave?: () => void;
  onApplyError?: (error: unknown) => void;
};

type UseDrawioClientResult = {
  /** Apply content now if the iframe is ready, otherwise queue it until onReady. */
  applyContent: (raw: DrawioContent) => Promise<void>;
  getClient: () => DrawioClient | null;
  isReady: () => boolean;
};

/**
 * Owns the embed.diagrams.net iframe lifecycle shared by the custom editor and
 * the inline edit overlay: create the client on the container, queue content
 * until the iframe is ready, apply it, and tear everything down on unmount.
 *
 * Callbacks are read through refs so changing their identity does not re-create
 * the iframe — only `fileKind` (or the container) triggers a rebuild.
 */
export function useDrawioClient({
  containerRef,
  fileKind,
  onChange,
  onSave,
  onApplyError,
}: UseDrawioClientOptions): UseDrawioClientResult {
  const clientRef = useRef<DrawioClient | null>(null);
  const loadedRef = useRef(false);
  const pendingContentRef = useRef<DrawioContent | null>(null);

  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onApplyErrorRef = useRef(onApplyError);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onApplyErrorRef.current = onApplyError;

  const applyContent = useCallback(
    async (raw: DrawioContent): Promise<void> => {
      const client = clientRef.current;
      if (!client || !loadedRef.current) {
        pendingContentRef.current = raw;
        return;
      }
      pendingContentRef.current = null;
      await applyDrawioContentToClient(client, raw, fileKind);
    },
    [fileKind],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const client = new DrawioClient(container);
    clientRef.current = client;
    loadedRef.current = false;
    pendingContentRef.current = null;

    const unsubChange = client.onChange(() => onChangeRef.current?.());
    const unsubSave = client.onSave(() => onSaveRef.current?.());
    const unsubReady = client.onReady(() => {
      loadedRef.current = true;
      const pending = pendingContentRef.current;
      if (pending === null) {
        return;
      }
      pendingContentRef.current = null;
      void applyDrawioContentToClient(client, pending, fileKind).catch((error) => {
        console.error('[useDrawioClient] Pending load failed:', error);
        onApplyErrorRef.current?.(error);
      });
    });

    return () => {
      unsubChange();
      unsubSave();
      unsubReady();
      client.destroy();
      clientRef.current = null;
      loadedRef.current = false;
      pendingContentRef.current = null;
    };
  }, [containerRef, fileKind]);

  const getClient = useCallback(() => clientRef.current, []);
  const isReady = useCallback(() => loadedRef.current, []);

  return { applyContent, getClient, isReady };
}
