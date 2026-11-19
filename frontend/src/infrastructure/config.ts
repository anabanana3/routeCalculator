type Env = Record<string, string | boolean | undefined>;

const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038];

function str(env: Env, name: string): string | undefined {
  const v = env[name];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function coord(env: Env, name: string, def: number, limit: number): number {
  const n = Number(str(env, name));
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : def;
}

/** Solo se admiten teselas por http(s): evita esquemas como javascript: o data:. */
function httpUrlOr(value: string | undefined, def: string): string {
  return value && /^https?:\/\//i.test(value) ? value : def;
}

export function loadAppConfig(env: Env) {
  return {
    apiUrl: (str(env, 'VITE_API_URL') ?? '').replace(/\/$/, ''),
    map: {
      // Cambiando estas variables se puede usar otro proveedor de teselas (MapTiler, Stadia, Mapbox...)
      tileUrl: httpUrlOr(str(env, 'VITE_TILE_URL'), DEFAULT_TILE_URL),
      attribution: str(env, 'VITE_TILE_ATTRIBUTION') ?? DEFAULT_ATTRIBUTION,
      defaultCenter: [
        coord(env, 'VITE_DEFAULT_LAT', DEFAULT_CENTER[0], 90),
        coord(env, 'VITE_DEFAULT_LON', DEFAULT_CENTER[1], 180),
      ] as [number, number],
      defaultZoom: 14,
    },
  };
}

export type AppConfig = ReturnType<typeof loadAppConfig>;

export const appConfig: AppConfig = loadAppConfig(import.meta.env as Env);
