/**
 * Pack the extension into the one file that travels: `release/<name>-<version>.nimext`.
 *
 * A `.nimext` is a zip with `manifest.json` at the ROOT — no top-level folder. That is the
 * host's own format (`ExtensionMarketplaceHandlers.ts`, `installFromPackageUrl`), the same
 * format the marketplace registry serves, and the same one `install.sh` in the eai-flow
 * repository unpacks when it installs this extension beside AltusNova EAI.
 *
 * What goes in is `package-contents.mjs`, an explicit list; a missing required entry fails
 * here rather than on somebody else's machine.
 *
 * The archive is deterministic — fixed entry timestamps, fixed modes — so two builds of the
 * same bundles produce the same checksum, and "is this the file CI built?" becomes a
 * question `shasum -c` can answer.
 */
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE_FILE, OPTIONAL_PACKAGE_FILES, requiredPackageFiles } from './package-contents.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The archive's base name. It follows the name of the repository whose Downloads page the
 * archive lands on -- the Bitbucket mirror -- because that is what somebody scanning that page
 * sees beside every other artefact of ours. That is deliberately NOT this project's own name:
 * the source of truth is `adok-one/nimbalyst-drawio` on GitHub, and the archive was called
 * after it until 2026-09-01.
 *
 * This constant is where the name is DECIDED; three other places have to agree with it, and
 * they are all in other repositories -- the component tables of `install/install.sh` and
 * `install/install.ps1` in eai-flow, and `Extensions::Registry` in decisions-system, which
 * matches shelf files by this basename to decide what it hands out. Changing it here alone
 * makes this extension invisible to all three.
 */
const PACKAGE_BASENAME = 'eai-nimbalyst-draw-io-plugin';

/**
 * Every zip entry is stamped with this instead of its mtime. A checksum that changes because
 * a file was rebuilt at a different second cannot be compared against anything.
 *
 * The RAW DOS value, not a `Date`. Zip stores the timestamp as local wall-clock with no zone
 * attached, and adm-zip converts a `Date` with `getHours()` and friends -- so a `Date` fixed
 * in UTC is written differently by every machine that is not on UTC, and the archive stops
 * being reproducible off the CI runners. That is not theoretical: it is why a build on a
 * CEST laptop and a build on the (UTC) runners disagreed while every entry's contents,
 * sizes and CRCs matched to the byte.
 *
 * 2020-01-01 00:00:00, encoded as `(date << 16) | time` the way `Utils.fromDate2DOS` does:
 *   date = ((2020 - 1980) << 9) | (1 << 5) | 1 = 0x5021
 *   time = (0 << 11) | (0 << 5) | (0 >> 1)     = 0x0000
 * which is what the runners were already producing, so published checksums still verify.
 * The date itself carries no meaning; 1980 is the format's floor.
 */
const FIXED_DOS_TIME = 0x5021 << 16;

/**
 * "Version made by": zip format 2.0, host system 3 (Unix). adm-zip picks this from the
 * machine it runs on -- `_verMade |= Utils.isWin ? 0x0a00 : 0x0300` -- so the same files
 * packed on Windows and on Linux produce archives that differ in this one header field and
 * therefore in their checksum. CI caught exactly that: identical entry contents on both,
 * different totals.
 *
 * Pinned to the Unix value because that is what the release runner produces and what every
 * archive published so far already carries. Nothing reads it here: the host extracts by
 * entry name.
 */
const MADE_BY_UNIX_ZIP20 = 0x0314;

const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

/**
 * `manifest.json` is the version the host reads and the person sees, so it is the source of
 * truth; `package.json` is kept equal to it by `scripts/bump-version.mjs`. Two numbers meant
 * to be the same diverge the moment nothing checks them, and the one that drifts is the one
 * nobody looks at — so the check stands here, where an archive is about to be named after one.
 */
if (manifest.version !== pkg.version) {
  fail(
    `manifest.json is ${manifest.version} and package.json is ${pkg.version}.\n` +
      `Run: node scripts/bump-version.mjs ${manifest.version}`,
  );
}

const missing = [];
const entries = [];

for (const path of requiredPackageFiles(manifest)) {
  const size = await sizeOf(join(root, path));
  if (size === null) missing.push(path);
  else entries.push({ path, size });
}

if (missing.length > 0) {
  fail(
    `the package is missing ${missing.length} required file(s):\n` +
      missing.map((path) => `  ${path}`).join('\n') +
      `\n\nRun \`npm run build\` first — it writes dist/index.js and dist/index.css.`,
  );
}

for (const { path } of OPTIONAL_PACKAGE_FILES) {
  const size = await sizeOf(join(root, path));
  if (size !== null) entries.push({ path, size });
}

const zip = new AdmZip();
for (const entry of entries) {
  const added = zip.addFile(entry.path, await readFile(join(root, entry.path)), '', MODE_FILE);
  added.header.timeval = FIXED_DOS_TIME;
  added.header.made = MADE_BY_UNIX_ZIP20;
}

const archiveName = `${PACKAGE_BASENAME}-${manifest.version}.nimext`;
const archivePath = join(root, 'release', archiveName);

await mkdir(join(root, 'release'), { recursive: true });
const archive = zip.toBuffer();
await writeFile(archivePath, archive);

const checksum = createHash('sha256').update(archive).digest('hex');
// Two spaces between hash and name: the format both `shasum -a 256 -c` and `sha256sum -c` read.
await writeFile(`${archivePath}.sha256`, `${checksum}  ${archiveName}\n`);

for (const entry of entries) {
  console.log(`  ${entry.path.padEnd(30)} ${kb(entry.size).padStart(8)}`);
}
console.log(
  `[pack] ${manifest.id} v${manifest.version} — ${entries.length} files, ` +
    `${kb(archive.length)} → release/${archiveName}`,
);
console.log(`[pack] sha256 ${checksum}`);

async function sizeOf(path) {
  try {
    const stats = await stat(path);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} kB`;
}

function fail(message) {
  console.error(`[pack] ${message}`);
  process.exit(1);
}
