# Route Calculator

Calculadora de rutas en transporte público a partir de datos **GTFS**.

- **backend/**: API en Node.js + TypeScript (Express). Carga el GTFS en memoria y calcula las rutas.
- **frontend/**: React + TypeScript + Material UI + Leaflet (OpenStreetMap).

## Puesta en marcha

```bash
npm install
cp backend/.env.example backend/.env   # ajustar la configuración
npm run dev                            # backend (3000) + frontend (5173)
```

Abre http://localhost:5173. Elige origen y destino escribiendo una dirección o parada, con "Tu ubicación" o pulsando en el mapa; la ruta se calcula automáticamente.

Por defecto se usa un GTFS ficticio de ejemplo (`backend/data/gtfs-sample`, centro de Madrid), que se puede regenerar con `npm run sample-gtfs -w backend`.

## Datos GTFS

Se configura en `backend/.env`:

| Variable | Descripción |
| --- | --- |
| `GTFS_SOURCE` | `local` o `url` |
| `GTFS_LOCAL_PATH` | Carpeta con los `.txt` o ruta a un `.zip` |
| `GTFS_URL` | URL que devuelve el zip GTFS |
| `GTFS_REFRESH_MINUTES` | Cada cuánto se recarga (0 = nunca). Con URL se usa ETag/Last-Modified para no recargar si no cambió |
| `GTFS_CACHE_DIR` | Carpeta de descarga y extracción |
| `TIMEZONE` | Zona horaria (por defecto la de `agency.txt`) |

Parámetros de cálculo: `MAX_WALK_METERS`, `MAX_TRANSFER_METERS`, `MAX_DIRECT_WALK_METERS`, `WALK_SPEED_MPS`, `WALK_DISTANCE_FACTOR`, `MIN_TRANSFER_SECONDS`, `MAX_ITINERARIES`, `MAX_SEARCH_HOURS`.

Se soportan `agency`, `stops`, `routes`, `trips`, `stop_times`, `calendar`, `calendar_dates`, `frequencies` y `shapes`.

Seguridad (ver `backend/.env.example`): `CORS_ORIGINS`, `ADMIN_TOKEN`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `TRUST_PROXY`, `HOST` y límites de descarga/descompresión del GTFS (`GTFS_DOWNLOAD_TIMEOUT_MS`, `GTFS_MAX_DOWNLOAD_MB`, `GTFS_ZIP_MAX_*`).

## Arquitectura

Ambos proyectos siguen *clean architecture*: las dependencias apuntan siempre hacia dentro y la lógica de negocio no conoce Express, React, el sistema de ficheros ni la red.

```
backend/src
├── domain/          Reglas de negocio puras: red de transporte, cálculo de rutas (CSA),
│                    calendarios, geometría, búsqueda de paradas. Sin dependencias externas.
├── application/     Casos de uso (planificar, buscar lugares, estado/recarga del feed)
│   └── ports/       Interfaces que implementa la infraestructura (origen GTFS, geocodificador, caché, logs)
├── infrastructure/  Implementaciones: lectura CSV, zip seguro, descarga HTTP, Photon/Nominatim, config, logs
├── interfaces/http/ Express: rutas, validación (zod), presentadores dominio→DTO, middlewares de seguridad
├── main.ts          Raíz de composición (conecta implementaciones con casos de uso)
└── index.ts         Punto de entrada

frontend/src
├── domain/          Tipos del contrato, formatos y reglas de presentación de itinerarios (funciones puras)
├── application/     Puertos (API, geolocalización) y hooks con el estado de la pantalla (useTripPlanner...)
├── infrastructure/  Cliente HTTP, geolocalización del navegador, configuración
├── ui/              Componentes React (solo presentación)
└── main.tsx         Raíz de composición
```

## Tests

```bash
npm test                 # backend + frontend
npm run test:coverage    # con informe de cobertura (coverage/index.html en cada proyecto)
```

Los tests están en `backend/test` y `frontend/test`, con la misma estructura que `src`. Usan Vitest (y Testing Library + jsdom en el frontend).

## API

- `GET /api/health`
- `GET /api/gtfs`: estado del feed (origen, última carga, estadísticas, límites geográficos).
- `POST /api/gtfs/reload`: fuerza la recarga. Requiere `Authorization: Bearer <ADMIN_TOKEN>`; sin `ADMIN_TOKEN` configurado está deshabilitado.
- `POST /api/plan`

```json
{
  "from": { "lat": 40.4212, "lon": -3.7195 },
  "to": { "lat": 40.4047, "lon": -3.7028 },
  "dateTime": "2026-11-16T10:00:00+01:00",
  "maxItineraries": 3
}
```

Devuelve itinerarios con tramos (`legs`) a pie o en vehículo: línea, color, sentido, paradas intermedias con hora, geometría para el mapa y próximas salidas.

- `GET /api/geocode/search?q=reina victoria[&lat=..&lon=..&limit=6]`: direcciones, calles y lugares del proveedor + paradas del GTFS.
- `GET /api/geocode/reverse?lat=..&lon=..`: nombre de un punto (si cae sobre una parada, el de la parada).

## Buscador de direcciones

El backend hace de intermediario con un geocodificador de OpenStreetMap, intercambiable por configuración (`GEOCODER_*` en `backend/.env`, ver `.env.example`):

- **Photon** (por defecto): gratuito y apto para autocompletar.
- **Nominatim**: su servidor público limita a 1 petición/segundo y no permite autocompletado intensivo; recomendable con instancia propia.

Los resultados se limitan a la zona del GTFS, se cachean en memoria y se completan con las paradas del GTFS buscadas por nombre o código. La opción "Tu ubicación" usa la geolocalización del navegador, que solo funciona en `localhost` o con HTTPS.

## Cómo se calcula

`backend/src/domain/routing/csa.ts` implementa el **Connection Scan Algorithm**: todos los tramos parada→parada de todos los viajes se ordenan por hora de salida al cargar el feed, y en cada consulta se recorren una sola vez para obtener la llegada más temprana. Tiene en cuenta:

- paradas a pie cercanas al origen y al destino, y transbordos a pie entre paradas próximas;
- tiempo mínimo de transbordo;
- calendarios (días de la semana y excepciones);
- horarios de más de 24:00 (servicios del día anterior) y servicios del día siguiente.

Las alternativas se obtienen repitiendo la búsqueda con una hora de salida posterior y descartando las dominadas.

## Mapa

El proveedor de teselas se configura en `frontend/.env` (`VITE_TILE_URL`, `VITE_TILE_ATTRIBUTION`); ver `frontend/.env.example`.

## Próximos pasos posibles

- GTFS-Realtime para tiempos de llegada reales.
- Rutas a pie reales (OSRM, GraphHopper o Valhalla) en lugar de líneas rectas.
- Opción "llegar a las", preferencias (menos transbordos, menos andar).
- Soporte de `transfers.txt` y de `pathways`.
