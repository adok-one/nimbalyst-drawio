import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const errors = [];

if (!manifest.id || !manifest.main) {
  errors.push('manifest.json missing id or main');
}

try {
  await readFile(manifest.main, 'utf8');
} catch {
  errors.push(`Built entry not found: ${manifest.main} — run npm run build`);
}

if (errors.length > 0) {
  console.error('Validation failed:\n', errors.join('\n'));
  process.exit(1);
}

console.log('Extension bundle OK:', manifest.id, manifest.version);
