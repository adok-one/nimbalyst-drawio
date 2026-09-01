/**
 * Move the version — in both files that carry it, in one command.
 *
 *   node scripts/bump-version.mjs patch|minor|major
 *   node scripts/bump-version.mjs 0.6.0
 *
 * `manifest.json` is the source of truth: it is what the host reads, what the Settings card
 * shows and what the release archive is named after. `package.json` holds the same number
 * because npm insists on holding one, and two numbers meant to be equal diverge the moment
 * nothing writes them together — which is why the packer refuses to build when they disagree.
 *
 * The edit is a substitution on the raw text rather than parse-and-restringify: rewriting
 * the whole of `manifest.json` over one field would re-escape every entity in the embedded
 * mxfile templates and bury the version change in a diff nobody can review.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv[2];

if (!argument) {
  fail('usage: node scripts/bump-version.mjs patch|minor|major|<version>');
}

const manifestPath = join(root, 'manifest.json');
const packagePath = join(root, 'package.json');

const manifestText = await readFile(manifestPath, 'utf8');
const packageText = await readFile(packagePath, 'utf8');

const current = versionIn(manifestText, 'manifest.json');
const packageVersion = versionIn(packageText, 'package.json');

const next = resolveNext(current, argument);
if (next === current) {
  fail(`already at ${current}`);
}

await writeFile(manifestPath, replaceVersion(manifestText, next));
await writeFile(packagePath, replaceVersion(packageText, next));

console.log(`[version] manifest.json ${current} → ${next}`);
console.log(
  packageVersion === current
    ? `[version] package.json  ${packageVersion} → ${next}`
    : `[version] package.json  ${packageVersion} → ${next} (it had drifted; now in step)`,
);
console.log(`[version] tag the release as v${next} once the change is committed`);

/**
 * The first top-level `"version"` key. `"apiVersion"` does not match: the pattern anchors on
 * the opening quote, so the only line it can find is the one that is exactly `version`.
 */
function versionPattern() {
  return /^(\s*)"version":\s*"([^"]+)"/m;
}

function versionIn(text, label) {
  const match = text.match(versionPattern());
  if (!match) fail(`no "version" field in ${label}`);
  return match[2];
}

function replaceVersion(text, version) {
  return text.replace(versionPattern(), `$1"version": "${version}"`);
}

function resolveNext(current, argument) {
  if (/^\d+\.\d+\.\d+$/.test(argument)) return argument;

  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    fail(`cannot bump ${current} — it is not a plain x.y.z version; pass the new one instead`);
  }

  const [major, minor, patch] = parts;
  switch (argument) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return fail(`unknown bump "${argument}" — expected patch, minor, major or an x.y.z version`);
  }
}

function fail(message) {
  console.error(`[version] ${message}`);
  process.exit(1);
}
