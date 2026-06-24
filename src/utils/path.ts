export function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) {
    return '.';
  }
  return normalized.slice(0, index);
}

export function join(...parts: string[]): string {
  return parts
    .map((part, index) => {
      const normalized = part.replace(/\\/g, '/');
      if (index === 0) {
        return normalized.replace(/\/+$/, '');
      }
      return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
    })
    .filter(Boolean)
    .join('/');
}
