import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

export interface ZipLimits {
  /** Número máximo de entradas en el zip. */
  maxEntries: number;
  /** Tamaño máximo descomprimido de un fichero. */
  maxEntryBytes: number;
  /** Tamaño máximo descomprimido total. */
  maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 200,
  maxEntryBytes: 1024 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
};

/** Profundidad máxima de la carpeta que contiene stops.txt dentro del zip. */
const MAX_ROOT_DEPTH = 3;
/** Nombres de fichero GTFS admitidos: nunca contienen rutas, así que no hay "zip slip". */
const GTFS_FILE = /^[a-z_]+\.txt$/;

export class UnsafeZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeZipError';
  }
}

interface SelectedEntry {
  entry: AdmZip.IZipEntry;
  fileName: string;
}

function splitEntryName(entryName: string): { dir: string; base: string; depth: number } {
  const parts = entryName.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = parts.pop() ?? '';
  return { dir: parts.join('/'), base, depth: parts.length };
}

/**
 * Selecciona los ficheros .txt de la carpeta del zip que contiene stops.txt,
 * validando nombres, duplicados y tamaños declarados.
 */
export function selectGtfsEntries(zip: AdmZip, limits: ZipLimits): SelectedEntry[] {
  const entries = zip.getEntries();
  if (entries.length > limits.maxEntries) {
    throw new UnsafeZipError(`El zip GTFS tiene demasiadas entradas (${entries.length} > ${limits.maxEntries})`);
  }

  let rootDir: string | null = null;
  let rootDepth = Infinity;
  for (const e of entries) {
    if (e.isDirectory) continue;
    const { dir, base, depth } = splitEntryName(e.entryName);
    if (base.toLowerCase() === 'stops.txt' && depth <= MAX_ROOT_DEPTH && depth < rootDepth) {
      rootDir = dir;
      rootDepth = depth;
    }
  }
  if (rootDir === null) throw new Error('El zip GTFS no contiene stops.txt');

  const selected: SelectedEntry[] = [];
  const names = new Set<string>();
  let total = 0;
  for (const e of entries) {
    if (e.isDirectory) continue;
    const { dir, base } = splitEntryName(e.entryName);
    const fileName = base.toLowerCase();
    if (dir !== rootDir || !GTFS_FILE.test(fileName)) continue;
    if (names.has(fileName)) throw new UnsafeZipError(`Entrada duplicada en el zip GTFS: ${fileName}`);
    names.add(fileName);
    const size = e.header.size;
    if (size > limits.maxEntryBytes) throw new UnsafeZipError(`${fileName} supera el tamaño máximo permitido`);
    total += size;
    if (total > limits.maxTotalBytes) throw new UnsafeZipError('El zip GTFS supera el tamaño total permitido');
    selected.push({ entry: e, fileName });
  }
  return selected;
}

/**
 * Extrae un zip GTFS en una carpeta nueva dentro de baseDir y borra las extracciones
 * anteriores (para no pisar datos en uso). Devuelve la carpeta con los .txt.
 */
export async function extractGtfsZip(
  buffer: Buffer,
  baseDir: string,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
  now: () => number = Date.now,
): Promise<string> {
  const zip = new AdmZip(buffer);
  const selected = selectGtfsEntries(zip, limits);

  await mkdir(baseDir, { recursive: true });
  const target = path.join(baseDir, `extract-${now()}`);
  await mkdir(target, { recursive: true });
  try {
    for (const { entry, fileName } of selected) {
      // adm-zip >= 0.6.1 no devuelve más bytes que el tamaño declarado, ya validado arriba.
      const data = entry.getData();
      if (data.length > limits.maxEntryBytes) throw new UnsafeZipError(`${fileName} supera el tamaño máximo permitido`);
      // Ficheros regulares con permisos fijos: no se conservan enlaces simbólicos ni bits SUID/SGID del zip.
      await writeFile(path.join(target, fileName), data, { mode: 0o644 });
    }
  } catch (err) {
    await rm(target, { recursive: true, force: true });
    throw err;
  }

  for (const entry of await readdir(baseDir)) {
    const full = path.join(baseDir, entry);
    if (full !== target) await rm(full, { recursive: true, force: true });
  }
  return target;
}
