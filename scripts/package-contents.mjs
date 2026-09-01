/**
 * What an installable copy of this extension consists of — one list, read by the packer
 * (`pack-nimext.mjs`) and again by `validate-pack.mjs` when the archive is opened back up.
 *
 * One list rather than two, so that the archive and the check on it cannot disagree about
 * a file. Everything here is derived from `manifest.json` where the manifest already says
 * it, because a path written twice is a path that drifts.
 */

export const MODE_FILE = 0o644;

/**
 * Every file that MUST be present, as paths relative to the repository root — which are
 * also the entry names inside the archive: the host reads `manifest.json` from the archive
 * root and resolves everything else relative to the installed directory.
 */
export function requiredPackageFiles(manifest) {
  // The marketplace card offers to open these; a screenshot pointing at a file that did
  // not travel is a broken button on somebody else's machine.
  const screenshots = (manifest.marketplace?.screenshots ?? [])
    .map((shot) => shot.fileToOpen)
    .filter(Boolean);

  return [...new Set(['manifest.json', manifest.main, manifest.styles, ...screenshots].filter(Boolean))];
}

/**
 * Packed when present, skipped when not: nothing here decides whether the extension works.
 */
export const OPTIONAL_PACKAGE_FILES = [{ path: 'README.md' }, { path: 'LICENSE' }];
