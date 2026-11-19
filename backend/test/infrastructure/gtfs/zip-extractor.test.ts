import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ZIP_LIMITS,
  extractGtfsZip,
  selectGtfsEntries,
  UnsafeZipError,
} from '../../../src/infrastructure/gtfs/zip-extractor.js';
import { makeZip } from '../../fixtures/zip.js';

let base: string;
beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'gtfs-zip-'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('selectGtfsEntries', () => {
  it('elige la carpeta menos profunda que contiene stops.txt', () => {
    const zip = new AdmZip(
      makeZip({
        'feed/stops.txt': 'a',
        'feed/routes.txt': 'b',
        'feed/old/stops.txt': 'c',
        'feed/README.md': 'd',
        'other/trips.txt': 'e',
      }),
    );
    expect(selectGtfsEntries(zip, DEFAULT_ZIP_LIMITS).map((e) => e.fileName).sort()).toEqual(['routes.txt', 'stops.txt']);
  });

  it('falla si no hay stops.txt', () => {
    expect(() => selectGtfsEntries(new AdmZip(makeZip({ 'routes.txt': 'x' })), DEFAULT_ZIP_LIMITS)).toThrow(/no contiene stops.txt/);
  });

  it('ignora stops.txt demasiado profundos', () => {
    const zip = new AdmZip(makeZip({ 'a/b/c/d/stops.txt': 'x' }));
    expect(() => selectGtfsEntries(zip, DEFAULT_ZIP_LIMITS)).toThrow(/no contiene stops.txt/);
  });

  it('rechaza zips con demasiadas entradas', () => {
    const zip = new AdmZip(makeZip({ 'stops.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' }));
    expect(() => selectGtfsEntries(zip, { ...DEFAULT_ZIP_LIMITS, maxEntries: 2 })).toThrow(UnsafeZipError);
  });

  it('rechaza ficheros que superan el tamaño máximo (zip bomb)', () => {
    const zip = new AdmZip(makeZip({ 'stops.txt': Buffer.alloc(2048, 'a') }));
    expect(() => selectGtfsEntries(zip, { ...DEFAULT_ZIP_LIMITS, maxEntryBytes: 1024 })).toThrow(/tamaño máximo/);
  });

  it('rechaza zips que superan el tamaño total', () => {
    const zip = new AdmZip(makeZip({ 'stops.txt': Buffer.alloc(600, 'a'), 'trips.txt': Buffer.alloc(600, 'b') }));
    expect(() => selectGtfsEntries(zip, { ...DEFAULT_ZIP_LIMITS, maxTotalBytes: 1000 })).toThrow(/tamaño total/);
  });

  it('rechaza entradas duplicadas (mismo nombre con distinta capitalización)', () => {
    const zip = new AdmZip(makeZip({ 'stops.txt': 'a', 'STOPS.txt': 'b' }));
    expect(() => selectGtfsEntries(zip, DEFAULT_ZIP_LIMITS)).toThrow(/duplicada/);
  });
});

describe('extractGtfsZip', () => {
  it('extrae solo los .txt de la carpeta del feed, en plano y en minúsculas', async () => {
    const buffer = makeZip({ 'gtfs/stops.txt': 'stop_id\nA\n', 'gtfs/Routes.TXT': 'route_id\n', 'gtfs/run.sh': 'rm -rf /' });
    const dir = await extractGtfsZip(buffer, base, DEFAULT_ZIP_LIMITS, () => 1);
    expect(dir).toBe(path.join(base, 'extract-1'));
    expect(readdirSync(dir).sort()).toEqual(['routes.txt', 'stops.txt']);
    expect(readFileSync(path.join(dir, 'stops.txt'), 'utf8')).toBe('stop_id\nA\n');
  });

  it('no escribe fuera de la carpeta destino (zip slip)', async () => {
    const zip = new AdmZip();
    zip.addFile('stops.txt', Buffer.from('stop_id\n'));
    zip.addFile('x', Buffer.from('owned'));
    // Se fuerza un nombre con "../" tras crear la entrada (adm-zip normaliza los nombres al añadirlos).
    zip.getEntry('x')!.entryName = '../../evil.txt';
    const dir = await extractGtfsZip(zip.toBuffer(), path.join(base, 'cache'), DEFAULT_ZIP_LIMITS, () => 2);
    expect(existsSync(path.join(base, 'evil.txt'))).toBe(false);
    expect(existsSync(path.join(base, '..', 'evil.txt'))).toBe(false);
    expect(readdirSync(dir)).toEqual(['stops.txt']);
  });

  it('borra las extracciones anteriores', async () => {
    mkdirSync(path.join(base, 'extract-0'));
    writeFileSync(path.join(base, 'extract-0', 'stops.txt'), 'old');
    await extractGtfsZip(makeZip({ 'stops.txt': 'new' }), base, DEFAULT_ZIP_LIMITS, () => 5);
    expect(readdirSync(base)).toEqual(['extract-5']);
  });

  it('no deja una extracción a medias si falla', async () => {
    mkdirSync(path.join(base, 'extract-0'));
    const name = 'stops.txt';
    const buffer = makeZip({ [name]: randomBytes(256) });
    // Se corrompen los datos de la primera entrada: la descompresión/CRC falla al extraer.
    const dataStart = 30 + buffer.readUInt16LE(26) + buffer.readUInt16LE(28);
    buffer[dataStart + 10] ^= 0xff;
    await expect(extractGtfsZip(buffer, base, DEFAULT_ZIP_LIMITS, () => 7)).rejects.toThrow();
    expect(readdirSync(base)).toEqual(['extract-0']);
  });

  it('falla con un buffer que no es un zip', async () => {
    await expect(extractGtfsZip(Buffer.from('no soy un zip'), base)).rejects.toThrow();
  });

  it('falla sin dejar carpetas si el zip no es un GTFS', async () => {
    await expect(extractGtfsZip(makeZip({ 'readme.txt': 'x' }), base)).rejects.toThrow(/stops.txt/);
    expect(readdirSync(base)).toEqual([]);
  });
});
