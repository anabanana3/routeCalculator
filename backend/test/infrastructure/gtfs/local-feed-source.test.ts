import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAll } from '../../../src/domain/network/gtfs-table-source.js';
import { CsvGtfsTableSource } from '../../../src/infrastructure/gtfs/csv-table-source.js';
import { LocalGtfsFeedSource } from '../../../src/infrastructure/gtfs/local-feed-source.js';
import { DEFAULT_ZIP_LIMITS } from '../../../src/infrastructure/gtfs/zip-extractor.js';
import { makeZip, MINIMAL_GTFS } from '../../fixtures/zip.js';

let base: string;
beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'gtfs-local-'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const opts = { force: false, hasCurrent: false };

describe('LocalGtfsFeedSource', () => {
  it('lee una carpeta (también con el feed en una subcarpeta)', async () => {
    const feed = path.join(base, 'feed', 'v1');
    mkdirSync(feed, { recursive: true });
    for (const [name, content] of Object.entries(MINIMAL_GTFS)) writeFileSync(path.join(feed, name), content);
    const src = new LocalGtfsFeedSource(path.join(base, 'feed'), path.join(base, 'cache'));
    expect(src.kind).toBe('local');
    const tables = await src.fetch(opts);
    expect(tables).toBeInstanceOf(CsvGtfsTableSource);
    expect((tables as CsvGtfsTableSource).dir).toBe(feed);
    expect(await readAll(tables, 'stops')).toHaveLength(2);
  });

  it('extrae un zip local en la caché', async () => {
    const zipPath = path.join(base, 'gtfs.zip');
    writeFileSync(zipPath, makeZip(MINIMAL_GTFS));
    const cache = path.join(base, 'cache');
    const tables = (await new LocalGtfsFeedSource(zipPath, cache).fetch(opts)) as CsvGtfsTableSource;
    expect(tables.dir.startsWith(path.join(cache, 'local'))).toBe(true);
    expect(await readAll(tables, 'agency')).toEqual([
      { agency_id: 'AG', agency_name: 'Test', agency_url: 'https://example.com', agency_timezone: 'Europe/Madrid' },
    ]);
  });

  it('aplica los límites al zip', async () => {
    const zipPath = path.join(base, 'gtfs.zip');
    writeFileSync(zipPath, makeZip(MINIMAL_GTFS));
    const src = new LocalGtfsFeedSource(zipPath, path.join(base, 'cache'), { ...DEFAULT_ZIP_LIMITS, maxEntries: 1 });
    await expect(src.fetch(opts)).rejects.toThrow(/demasiadas entradas/);
  });

  it('falla si la ruta no existe', async () => {
    await expect(new LocalGtfsFeedSource(path.join(base, 'nope'), base).fetch(opts)).rejects.toThrow(/No existe la ruta GTFS local/);
  });

  it('falla si la carpeta no tiene stops.txt', async () => {
    await expect(new LocalGtfsFeedSource(base, path.join(base, 'cache')).fetch(opts)).rejects.toThrow(/No se encontró stops.txt/);
  });
});
