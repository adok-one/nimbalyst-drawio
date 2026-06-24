import { useEffect, useRef } from 'react';
import { useEditorLifecycle } from '@nimbalyst/runtime';
import type { EditorHostProps } from '../types/extension.js';
import { getDrawioFileKind } from '../drawio/fileKind.js';
import { useDrawioClient } from './useDrawioClient.js';

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

export function DrawioEditor({ host }: EditorHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileKind = getDrawioFileKind(host.fileName);
  const isBinary = fileKind === 'png';

  // Bridges the circular wiring: the client needs markDirty (from the lifecycle),
  // and the lifecycle needs applyContent/getClient (from the client hook).
  const markDirtyRef = useRef<() => void>(() => {});

  const { applyContent, getClient, isReady } = useDrawioClient({
    containerRef,
    fileKind,
    onChange: () => markDirtyRef.current(),
    onSave: () => markDirtyRef.current(),
  });

  const { isLoading, error, markDirty, theme } = useEditorLifecycle(host, {
    binary: isBinary,
    applyContent: (raw) => {
      void applyContent(raw);
    },
    onSave: async () => {
      const client = getClient();
      if (!client) {
        return;
      }
      if (fileKind === 'png') {
        const bytes = await client.exportAsPngWithEmbeddedXml();
        await host.saveContent(bytes.buffer as ArrayBuffer);
      } else if (fileKind === 'svg') {
        const bytes = await client.exportAsSvgWithEmbeddedXml();
        await host.saveContent(bytesToText(bytes));
      } else {
        const xml = await client.getXml();
        await host.saveContent(xml);
      }
      host.setDirty(false);
    },
  });
  markDirtyRef.current = markDirty;

  useEffect(() => {
    return host.onFileChanged(async () => {
      if (!isReady()) {
        return;
      }
      try {
        const raw = isBinary
          ? new Uint8Array(await host.loadBinaryContent())
          : await host.loadContent();
        await applyContent(raw);
      } catch (loadError) {
        console.error('[DrawioEditor] External change failed:', loadError);
      }
    });
  }, [applyContent, host, isBinary, isReady]);

  if (isLoading) {
    return <div className="drawio-editor drawio-editor--loading">Loading diagram…</div>;
  }

  if (error) {
    return (
      <div className="drawio-editor drawio-editor--error">
        Failed to load diagram: {error.message}
      </div>
    );
  }

  return (
    <div className={`drawio-editor drawio-editor--${theme}`} data-readonly={host.readOnly ? 'true' : 'false'}>
      <div ref={containerRef} className="drawio-editor__canvas" />
    </div>
  );
}
