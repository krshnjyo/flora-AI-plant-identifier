/**
 * File: backend/lib/catalog-image.ts
 * Purpose: Resolve best public image paths for plant/disease catalog entities.
 */

export type PublicImageIndex = {
  byPath: Set<string>;
  byStem: Map<string, string>;
};

function normalizeStem(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function rankPath(path: string) {
  return path.toLowerCase().includes("dataset") ? 1 : 0;
}

export function buildPublicImageIndex(prefix: string, fileNames: string[]): PublicImageIndex {
  const byPath = new Set<string>();
  const byStem = new Map<string, string>();

  for (const fileName of fileNames) {
    const path = `${prefix}/${fileName}`;
    byPath.add(path);

    const stem = normalizeStem(stripExtension(fileName));
    if (!stem) continue;

    const existing = byStem.get(stem);
    if (!existing || rankPath(path) < rankPath(existing)) {
      byStem.set(stem, path);
    }
  }

  return { byPath, byStem };
}

export function resolvePreferredImageUrl(
  index: PublicImageIndex,
  primaryName: string,
  options: {
    aliases?: string[];
    declaredImageUrl?: string | null;
  } = {}
) {
  const declared = options.declaredImageUrl || null;
  if (declared && index.byPath.has(declared)) {
    return declared;
  }

  const aliases = options.aliases || [];
  const candidates = [primaryName, ...aliases]
    .map((value) => normalizeStem(value))
    .filter(Boolean);

  for (const stem of candidates) {
    const exact = index.byStem.get(stem);
    if (exact) return exact;
  }

  const stems = Array.from(index.byStem.keys());
  for (const candidate of candidates) {
    const partial = stems
      .filter((stem) => stem.startsWith(`${candidate}-`) || stem.includes(`-${candidate}-`))
      .sort((a, b) => rankPath(index.byStem.get(a) || "") - rankPath(index.byStem.get(b) || ""))[0];
    if (partial) {
      return index.byStem.get(partial) || null;
    }
  }

  return null;
}
