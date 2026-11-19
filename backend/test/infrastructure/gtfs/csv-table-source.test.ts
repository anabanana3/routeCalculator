import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CsvGtfsTableSource, findGtfsRoot } from '../../../src/infrastructure/gtfs/csv-table-source.js';
import type { Row } from '../../../src/domain/network/gtfs-table-source.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'gtfs-csv-'));
  writeFileSync(
    path.join(dir, 'stops.txt'),
    '\uFEFF stop_id , stop_name ,stop_lat\r\nA,"Plaza, Mayor",40.4\r\n\r\nB, Calle "Real" ,40.5,extra\r\n',
  );
  writeFileSync(path.join(dir, 'agency.txt'), '__proto__,agency_name\npolluted,Test\n');
  mkdirSync(path.join(dir, 'nested', 'deeper'), { recursive: true });
  writeFileSync(path.join(dir, 'nested', 'deeper', 'stops.txt'), 'stop_id\n');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('CsvGtfsTableSource', () => {
  it('lee filas quitando BOM y espacios de las cabeceras', async () => {
    const rows: Row[] = [];
    const count = await new CsvGtfsTableSource(dir).forEach('stops', (r) => rows.push(r));
    expect(count).toBe(2);
    expect(rows[0]).toEqual({ stop_id: 'A', stop_name: 'Plaza, Mayor', stop_lat: '40.4' });
    // Comillas sueltas y columnas de más se toleran.
    expect(rows[1].stop_id).toBe('B');
    expect(rows[1].stop_name).toBe('Calle "Real"');
  });

  it('devuelve 0 si la tabla no existe', async () => {
    const source = new CsvGtfsTableSource(dir);
    expect(source.has('trips')).toBe(false);
    expect(await source.forEach('trips', () => {})).toBe(0);
  });

  it('no permite nombres de tabla con rutas', async () => {
    const source = new CsvGtfsTableSource(path.join(dir, 'nested'));
    expect(() => source.has('../stops')).toThrow(/Nombre de tabla GTFS no válido/);
    await expect(source.forEach('../../etc/passwd', () => {})).rejects.toThrow(/no válido/);
  });

  it('una cabecera "__proto__" no contamina prototipos', async () => {
    const rows: Row[] = [];
    await new CsvGtfsTableSource(dir).forEach('agency', (r) => rows.push(r));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(rows[0])).not.toHaveProperty('polluted');
    expect(rows[0].agency_name).toBe('Test');
  });
});

describe('findGtfsRoot', () => {
  it('devuelve la propia carpeta si contiene stops.txt', async () => {
    expect(await findGtfsRoot(dir)).toBe(dir);
  });

  it('busca en subcarpetas hasta la profundidad indicada', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'gtfs-root-'));
    try {
      mkdirSync(path.join(parent, 'a', 'b'), { recursive: true });
      writeFileSync(path.join(parent, 'a', 'b', 'stops.txt'), 'stop_id\n');
      writeFileSync(path.join(parent, 'readme.txt'), 'x');
      expect(await findGtfsRoot(parent)).toBe(path.join(parent, 'a', 'b'));
      expect(await findGtfsRoot(parent, 1)).toBeNull();
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
