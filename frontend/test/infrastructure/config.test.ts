import { describe, expect, it } from 'vitest';
import { appConfig, loadAppConfig } from '../../src/infrastructure/config';

describe('loadAppConfig', () => {
  it('valores por defecto', () => {
    expect(loadAppConfig({})).toEqual({
      apiUrl: '',
      map: {
        tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        defaultCenter: [40.4168, -3.7038],
        defaultZoom: 14,
      },
    });
  });

  it('lee las variables VITE_*', () => {
    const c = loadAppConfig({
      VITE_API_URL: 'https://api.example.com/',
      VITE_TILE_URL: 'https://tiles.example.com/{z}/{x}/{y}.png',
      VITE_TILE_ATTRIBUTION: '© Ejemplo',
      VITE_DEFAULT_LAT: '38.26',
      VITE_DEFAULT_LON: '-0.7',
    });
    expect(c.apiUrl).toBe('https://api.example.com');
    expect(c.map.tileUrl).toBe('https://tiles.example.com/{z}/{x}/{y}.png');
    expect(c.map.attribution).toBe('© Ejemplo');
    expect(c.map.defaultCenter).toEqual([38.26, -0.7]);
  });

  it('ignora coordenadas inválidas o fuera de rango', () => {
    expect(loadAppConfig({ VITE_DEFAULT_LAT: 'abc', VITE_DEFAULT_LON: '500' }).map.defaultCenter).toEqual([40.4168, -3.7038]);
  });

  it('solo acepta teselas http(s)', () => {
    expect(loadAppConfig({ VITE_TILE_URL: 'javascript:alert(1)' }).map.tileUrl).toMatch(/^https:\/\/\{s\}\.tile/);
    expect(loadAppConfig({ VITE_TILE_URL: 'http://localhost:8080/{z}/{x}/{y}.png' }).map.tileUrl).toBe(
      'http://localhost:8080/{z}/{x}/{y}.png',
    );
  });

  it('ignora valores vacíos o no textuales', () => {
    expect(loadAppConfig({ VITE_API_URL: '  ', VITE_TILE_URL: true }).apiUrl).toBe('');
  });

  it('appConfig se carga desde import.meta.env', () => {
    expect(appConfig.map.defaultZoom).toBe(14);
  });
});
