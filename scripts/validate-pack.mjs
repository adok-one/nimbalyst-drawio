/**
 * Open the archive again and ask of it what a machine that has never seen this repository
 * would ask.
 *
 * The packer checked the files it was about to add; this checks the file it produced — with
 * `adm-zip`, the same reader the host uses (`extractNimext`). A package that reads correctly
 * here reads correctly there, and the alternative — trusting the writer about its own output
 * — is how an archive nothing can open gets shipped.
 *
 * Run after `pack:nimext`; it defaults to the archive that build just named.
 */
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredPackageFiles } from './package-contents.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));

const archivePath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(root, 'release', `nimbalyst-drawio-${manifest.version}.nimext`);

const archive = await readFile(archivePath).catch(() => null);
if (!archive) {
  fail(`no archive at ${archivePath} — run \`npm run pack:nimext\` first`);
}

const errors = [];
let entryNames = [];

try {
  entryNames = new AdmZip(archive).getEntries().map((entry) => entry.entryName);
} catch (err) {
  fail(`the archive does not open as a zip: ${err instanceof Error ? err.message : String(err)}`);
}

// The host resolves every entry against the destination and refuses the archive if any of
// them lands outside it. An absolute path or a `..` segment is the shape that does that.
for (const name of entryNames) {
  if (name.startsWith('/') || name.split('/').includes('..')) {
    errors.push(`entry escapes the destination directory: ${name}`);
  }
  if (name.startsWith('node_modules/') || name.includes('/node_modules/')) {
    errors.push(`node_modules leaked into the archive: ${name}`);
  }
}

for (const path of requiredPackageFiles(manifest)) {
  if (!entryNames.includes(path)) errors.push(`missing from the archive: ${path}`);
}

// Read the manifest back out of the archive rather than off disk: what the host installs is
// this copy, and a packer that wrote the wrong bytes would still pass a check that re-reads
// the source.
if (entryNames.includes('manifest.json')) {
  try {
    const packed = JSON.parse(new AdmZip(archive).readAsText('manifest.json'));
    if (packed.id !== manifest.id) {
      errors.push(`the packed manifest says id "${packed.id}", the repository says "${manifest.id}"`);
    }
    if (packed.version !== manifest.version) {
      errors.push(
        `the packed manifest says version ${packed.version}, the repository says ${manifest.version}`,
      );
    }
  } catch {
    errors.push('manifest.json inside the archive is not valid JSON');
  }
}

const checksumLine = await readFile(`${archivePath}.sha256`, 'utf8').catch(() => null);
if (checksumLine === null) {
  errors.push(`no ${basename(archivePath)}.sha256 beside the archive`);
} else {
  const expected = checksumLine.trim().split(/\s+/)[0];
  const actual = createHash('sha256').update(archive).digest('hex');
  if (expected !== actual) {
    errors.push(`the .sha256 file describes a different archive (${expected} != ${actual})`);
  }
}

if (errors.length > 0) {
  fail(`${basename(archivePath)}:\n` + errors.map((e) => `  ${e}`).join('\n'));
}

console.log(
  `[validate:pack] ${basename(archivePath)} OK — ${manifest.id} v${manifest.version}, ` +
    `${entryNames.length} entries, ${(archive.length / 1024).toFixed(0)} kB`,
);

function fail(message) {
  console.error(`[validate:pack] ${message}`);
  process.exit(1);
}
