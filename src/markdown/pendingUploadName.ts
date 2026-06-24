let pending: { name: string; ts: number } | null = null;
let lastDroppedFiles: File[] = [];

const TTL_MS = 10000;

export function rememberUploadFileName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }
  pending = { name: trimmed, ts: Date.now() };
}

export function rememberDroppedFiles(files: FileList | File[]): void {
  lastDroppedFiles = Array.from(files);
  if (lastDroppedFiles[0]) {
    rememberUploadFileName(lastDroppedFiles[0].name);
  }
}

export function consumeUploadFileName(): string | undefined {
  const fromPending = consumePendingName();
  if (fromPending) {
    return fromPending;
  }
  const fromDrop = lastDroppedFiles[0]?.name;
  lastDroppedFiles = [];
  return fromDrop;
}

export function peekUploadFileName(): string | undefined {
  const fromPending = peekPendingName();
  if (fromPending) {
    return fromPending;
  }
  return lastDroppedFiles[0]?.name;
}

function consumePendingName(): string | undefined {
  if (!pending) {
    return undefined;
  }
  if (Date.now() - pending.ts > TTL_MS) {
    pending = null;
    return undefined;
  }
  const name = pending.name;
  pending = null;
  return name;
}

function peekPendingName(): string | undefined {
  if (!pending) {
    return undefined;
  }
  if (Date.now() - pending.ts > TTL_MS) {
    pending = null;
    return undefined;
  }
  return pending.name;
}
