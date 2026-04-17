/**
 * Index manifest — tracks which files have been processed and their SHA-256
 * fingerprints so uploads of the same file are a no-op, and re-uploads of a
 * changed file only reprocess the changed document.
 *
 * Persisted to: data/index-manifest.json
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const MANIFEST_PATH = path.join(process.cwd(), "data", "index-manifest.json");

export type FileRecord = {
  sha256: string;
  uploadedAt: string;
  chunkCount: number;
};

export type Manifest = {
  files: Record<string, FileRecord>;
};

function loadManifest(): Manifest {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
    }
  } catch {
    // Corrupt manifest — start fresh
  }
  return { files: {} };
}

function saveManifest(manifest: Manifest): void {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

/** Compute SHA-256 hex digest of a Buffer. */
export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Check whether `filename` with this exact `sha256` is already indexed.
 * Returns true if the file is unchanged and can be skipped.
 */
export function isAlreadyIndexed(filename: string, sha256: string): boolean {
  const manifest = loadManifest();
  return manifest.files[filename]?.sha256 === sha256;
}

/**
 * Record a file as indexed.  Called after successful vector store creation.
 */
export function recordIndexed(
  filename: string,
  sha256: string,
  chunkCount: number
): void {
  const manifest = loadManifest();
  manifest.files[filename] = {
    sha256,
    uploadedAt: new Date().toISOString(),
    chunkCount,
  };
  saveManifest(manifest);
}

/** Return all tracked files. */
export function getManifest(): Manifest {
  return loadManifest();
}
