# Route Calculator

Calculadora de rutas en **transporte público urbano** a partir de datos abiertos en formato **GTFS**, con una interfaz de mapa al estilo de Google Maps o Apple Maps.

---

## a. Descripción general

Route Calculator indica qué líneas de autobús, tranvía, metro, etc. hay que coger para ir de un punto **A** a un punto **B**, combinando tramos a pie y transbordos.

El usuario elige el origen y el destino en un mapa, escribiendo una dirección o parada, o con su ubicación actual. La aplicación le muestra:

- varias alternativas de ruta, con hora de salida, hora de llegada y duración total;
- cada tramo dibujado en el mapa con el color de su línea: paradas de subida y bajada, paradas intermedias y tramos a pie;
- cuándo pasa el siguiente vehículo y las salidas posteriores;
- el tiempo andando, la distancia a pie y el número de transbordos.

Hay dos partes:

- **Backend**: API REST que carga los datos GTFS en memoria y calcula las rutas con el algoritmo _Connection Scan_ (CSA). Los datos se pueden leer de una carpeta o un `.zip` local, o descargar periódicamente de una URL. Opcionalmente consume feeds **GTFS-Realtime** (retrasos, cancelaciones, posición de los vehículos y avisos).
- **Frontend**: aplicación web de una sola página con un mapa de OpenStreetMap, sustituible por otro proveedor, y un panel de búsqueda y resultados.

> Sin GTFS-Realtime configurado se usan los horarios **programados** del GTFS estático. Con él, las rutas se calculan con las horas **previstas** y se muestran retrasos, avisos y vehículos en el mapa.

---

## b. Stack tecnológico

| Parte           | Tecnologías                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lenguaje        | **TypeScript** en todo el proyecto                                                                                                                     |
| Backend         | **Node.js** + **Express 5**, validación con **Zod**, lectura de CSV en streaming con **csv-parse**, zips con **adm-zip**, configuración con **dotenv** |
| Frontend        | **React 19** + **Vite 6**, **Material UI (MUI) 7** como librería de diseño, **Leaflet** + **react-leaflet** para el mapa                               |
| Mapa            | Teselas de **OpenStreetMap**, configurables por variables de entorno                                                                                   |
| Geocodificación | **Photon** (por defecto) o **Nominatim**, ambos sobre datos de OpenStreetMap                                                                           |
| Datos           | Feeds **GTFS** estáticos y, opcionalmente, **GTFS-Realtime** (protobuf, decodificado con **gtfs-realtime-bindings**)                                   |
| Tests           | **Vitest**, **Testing Library** y **jsdom**, con cobertura mediante `@vitest/coverage-v8`                                                              |
| Monorepo        | **npm workspaces** (`backend`, `frontend`) + **concurrently** para arrancar ambos a la vez                                                             |

---

## c. Instalación y ejecución

### Requisitos

- **Node.js 20 o superior** (probado con Node 24) y **npm 10 o superior**.
- Conexión a Internet para las teselas del mapa y el buscador de direcciones. El cálculo de rutas funciona sin conexión.

### Instalación

```bash
git clone <url-del-repositorio>
cd routeCalculator
npm install
```

`npm install` en la raíz instala las dependencias del backend y del frontend.

### Configuración

```bash
# Linux / macOS
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env    # opcional

# Windows (PowerShell)
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Por defecto el backend usa un GTFS **ficticio de ejemplo** del centro de Madrid (`backend/data/gtfs-sample`). Para usar el GTFS real de **Elche** incluido en el repositorio, edita `backend/.env`:

```ini
GTFS_LOCAL_PATH=./data/elche
# El feed de Elche solo tiene servicio el 27/07/2026: para probarlo cualquier día
DEBUG_IGNORE_CALENDAR=true
```

Variables principales de `backend/.env` (todas están documentadas en `backend/.env.example`):

| Variable                                                                                                                                                                    | Descripción                                                                                        | Por defecto          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| `PORT` / `HOST`                                                                                                                                                             | Puerto e interfaz de escucha de la API                                                             | `3000` / todas       |
| `LOG_LEVEL`                                                                                                                                                                 | `debug`, `info`, `warn`, `error` o `silent`                                                        | `info`               |
| `GTFS_SOURCE`                                                                                                                                                               | `local` o `url`                                                                                    | `local`              |
| `GTFS_LOCAL_PATH`                                                                                                                                                           | Carpeta con los `.txt` o ruta a un `.zip`                                                          | `./data/gtfs-sample` |
| `GTFS_URL`                                                                                                                                                                  | URL que devuelve el zip GTFS                                                                       | —                    |
| `GTFS_REFRESH_MINUTES`                                                                                                                                                      | Cada cuánto se recargan los datos (0 = nunca)                                                      | `1440`               |
| `TIMEZONE`                                                                                                                                                                  | Zona horaria; si se deja vacía, se usa la de `agency.txt`                                          | —                    |
| `MAX_WALK_METERS`, `MAX_TRANSFER_METERS`, `MAX_DIRECT_WALK_METERS`, `WALK_SPEED_MPS`, `WALK_DISTANCE_FACTOR`, `MIN_TRANSFER_SECONDS`, `MAX_ITINERARIES`, `MAX_SEARCH_HOURS` | Parámetros del cálculo de rutas                                                                    | ver `.env.example`   |
| `DEBUG_IGNORE_CALENDAR`                                                                                                                                                     | Ignora el calendario de servicios, útil con feeds caducados                                        | `false`              |
| `GEOCODER_*`                                                                                                                                                                | Proveedor, URL, idioma y zona del buscador de direcciones                                          | Photon               |
| `CORS_ORIGINS`, `ADMIN_TOKEN`, `RATE_LIMIT_*`, `TRUST_PROXY`                                                                                                                | Seguridad de la API                                                                                | ver `.env.example`   |
| `GTFS_DOWNLOAD_TIMEOUT_MS`, `GTFS_MAX_DOWNLOAD_MB`, `GTFS_ZIP_MAX_*`                                                                                                        | Límites de descarga y descompresión del GTFS                                                       | ver `.env.example`   |
| `GTFS_RT_TRIP_UPDATES_URL`, `GTFS_RT_VEHICLE_POSITIONS_URL`, `GTFS_RT_ALERTS_URL`                                                                                           | URLs de los feeds GTFS-Realtime. Vacías = sin tiempo real. Si coinciden, se descargan una sola vez | —                    |
| `GTFS_RT_REFRESH_SECONDS`                                                                                                                                                   | Cada cuánto se descargan los feeds en tiempo real (mínimo 5)                                       | `30`                 |
| `GTFS_RT_IDLE_MINUTES`                                                                                                                                                      | Minutos sin peticiones tras los que se pausa la descarga (0 = nunca)                               | `10`                 |
| `GTFS_RT_MAX_AGE_SECONDS`                                                                                                                                                   | Antigüedad máxima de los datos para usarlos (0 = sin límite)                                       | `300`                |
| `GTFS_RT_HEADERS`                                                                                                                                                           | Cabeceras extra en JSON, p. ej. `{"x-api-key":"..."}`                                              | —                    |
| `GTFS_RT_TIMEOUT_MS`, `GTFS_RT_MAX_DOWNLOAD_MB`, `GTFS_RT_LANGUAGE`                                                                                                         | Límites de descarga e idioma preferido de los avisos                                               | `10000`, `20`, `es`  |

Variables de `frontend/.env`:

| Variable                                 | Descripción                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `VITE_API_URL`                           | URL base de la API. Vacía = mismo origen; en desarrollo se usa el proxy de Vite |
| `VITE_TILE_URL`, `VITE_TILE_ATTRIBUTION` | Proveedor de teselas del mapa (OpenStreetMap por defecto)                       |
| `VITE_DEFAULT_LAT`, `VITE_DEFAULT_LON`   | Centro inicial del mapa si el backend aún no ha devuelto la zona del GTFS       |

### Ejecución en desarrollo

```bash
npm run dev
```

Arranca a la vez:

- **API**: http://localhost:3000, y se recarga sola al cambiar el código.
- **Web**: http://localhost:5173. Vite reenvía las peticiones `/api` al backend.

Abre http://localhost:5173 en el navegador.

### Otros comandos

| Comando                          | Qué hace                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `npm run build`                  | Compila el backend (`backend/dist`) y genera la web estática (`frontend/dist`) |
| `npm run start -w backend`       | Ejecuta el backend compilado                                                   |
| `npm run preview -w frontend`    | Sirve la web compilada para probarla                                           |
| `npm run typecheck`              | Comprobación de tipos de backend y frontend                                    |
| `npm test`                       | Ejecuta todos los tests                                                        |
| `npm run test:coverage`          | Tests con informe de cobertura (`*/coverage`)                                  |
| `npm run sample-gtfs -w backend` | Regenera el GTFS de ejemplo                                                    |

---

## d. Estructura del proyecto

Backend y frontend siguen una **arquitectura por capas** (estilo hexagonal): el dominio no depende de frameworks y la infraestructura se conecta a través de _puertos_ (interfaces).

```
routeCalculator/
├── package.json                  # Workspaces y scripts comunes (dev, build, test…)
├── backend/
│   ├── .env.example              # Configuración documentada
│   ├── data/
│   │   ├── gtfs-sample/          # GTFS ficticio de ejemplo (Madrid)
│   │   ├── elche/                # GTFS real de Elche
│   │   └── cache/                # Descargas y extracciones (ignorado en git)
│   ├── scripts/
│   │   └── generate-sample-gtfs.mjs
│   ├── src/
│   │   ├── index.ts              # Punto de entrada: carga la configuración y arranca
│   │   ├── main.ts               # Composición de dependencias y arranque del servidor
│   │   ├── domain/               # Lógica pura, sin dependencias externas
│   │   │   ├── network/          #   Modelo de red y construcción desde las tablas GTFS
│   │   │   ├── routing/          #   CSA, planificador, calendario, geometría, itinerarios
│   │   │   ├── realtime/         #   Modelo GTFS-Realtime, horas previstas por viaje y avisos
│   │   │   ├── geocoding/        #   Búsqueda de paradas, zona de búsqueda, normalización
│   │   │   ├── geo/              #   Distancias e índice espacial
│   │   │   └── time/             #   Horas de servicio GTFS y zonas horarias
│   │   ├── application/          # Casos de uso y puertos
│   │   │   ├── use-cases/        #   plan-trip, search-places, reverse-geocode, get-feed-info, reload-feed, get-vehicles
│   │   │   ├── services/         #   Almacén de la red en memoria, recarga periódica y almacén del tiempo real
│   │   │   └── ports/            #   Interfaces: fuente GTFS, fuente GTFS-Realtime, geocodificador, caché, logger…
│   │   ├── infrastructure/       # Implementaciones concretas
│   │   │   ├── gtfs/             #   Lectura CSV, fuente local, descarga HTTP, extracción de zip
│   │   │   ├── gtfs-realtime/    #   Descarga HTTP y decodificación protobuf de GTFS-Realtime
│   │   │   ├── geocoding/        #   Proveedores Photon y Nominatim
│   │   │   ├── config/           #   Lectura y validación de variables de entorno
│   │   │   ├── cache/  logging/  http/
│   │   └── interfaces/http/      # API REST (Express)
│   │       ├── app.ts            #   Montaje de middlewares y rutas
│   │       ├── routes/           #   /plan, /gtfs, /geocode, /realtime
│   │       ├── middleware/       #   Logs, cabeceras de seguridad, rate limit, token admin, errores
│   │       ├── schemas.ts        #   Validación de peticiones (Zod)
│   │       └── dto.ts, presenters.ts  # Contrato de la API y conversión desde el dominio
│   └── test/                     # Tests (misma estructura que src) y fixtures
└── frontend/
    ├── .env.example
    ├── index.html, vite.config.ts
    ├── src/
    │   ├── main.tsx              # Punto de entrada: tema MUI e inyección de servicios
    │   ├── domain/               # Tipos de la API, formato de horas y distancias, lógica de itinerarios y tiempo real
    │   ├── application/          # Hooks de estado (useTripPlanner, usePlaceSearch, useVehicles, useNow) y puertos
    │   ├── infrastructure/       # Cliente HTTP de la API, geolocalización del navegador, configuración
    │   └── ui/                   # Componentes React + MUI
    │       ├── App.tsx           #   Mapa a pantalla completa + panel flotante
    │       ├── components/       #   SearchPanel, PlaceSearchField, ItineraryList, ItineraryDetail, RouteBadge, RealtimeTime, AlertList
    │       │   └── map/          #   MapView, ItineraryLayer, VehicleLayer, marcadores
    │       └── theme.ts
    └── test/                     # Tests de dominio, hooks, cliente y componentes
```

---

## e. Funcionalidades principales

### Cálculo de rutas (backend)

- **Algoritmo _Connection Scan_ (CSA)**: al cargar el feed, todos los tramos parada→parada de todos los viajes se ordenan por hora de salida. En cada consulta se recorren una sola vez para obtener la **llegada más temprana**, en decenas de milisegundos con una red urbana.
- **Tramos a pie**:
  - acceso desde el origen a las paradas cercanas y desde las paradas al destino;
  - transbordos andando entre paradas próximas;
  - opción de ir solo andando en trayectos cortos.

  El tiempo se calcula como distancia en línea recta × `WALK_DISTANCE_FACTOR` (1,25) ÷ `WALK_SPEED_MPS` (1,25 m/s).

- **Transbordos** con tiempo mínimo configurable (`MIN_TRANSFER_SECONDS`).
- **Calendarios**: días de la semana (`calendar.txt`) y excepciones (`calendar_dates.txt`). Se tienen en cuenta horarios de más de 24:00 (servicios nocturnos del día anterior) y servicios del día siguiente.
- **Varias alternativas**: se repite la búsqueda saliendo más tarde y se descartan las peores. Cada una incluye el tiempo total, a pie y de espera, y el número de transbordos.
- **Información de cada tramo**:
  - línea con su color;
  - sentido (_headsign_);
  - paradas intermedias con su hora de paso;
  - trazado real desde `shapes.txt`, o uniendo paradas si no existe;
  - **próximas salidas** de la misma línea desde la parada de subida.
- **Ficheros GTFS soportados**: `agency`, `stops`, `routes`, `trips`, `stop_times`, `calendar`, `calendar_dates`, `frequencies` y `shapes`. Las horas que faltan en `stop_times` se interpolan.

### Gestión de los datos GTFS

- Lectura desde una **carpeta**, un **`.zip` local** o una **URL**.
- **Recarga periódica** cada `GTFS_REFRESH_MINUTES`. Con URL se usan `ETag`/`Last-Modified` para no volver a procesar si el fichero no ha cambiado, y si la descarga falla se usa la última copia en caché.
- La carga no bloquea el arranque: mientras tanto `/api/plan` responde `503`.
- Límites frente a ficheros maliciosos: tamaño de descarga, tiempo de espera y número y tamaño de entradas del zip.
- **Modo depuración** `DEBUG_IGNORE_CALENDAR`, para probar con feeds caducados o de un solo día.

### Datos en tiempo real (GTFS-Realtime)

Opcional: se activa al configurar al menos una de las URLs `GTFS_RT_*`. Se admiten los tres tipos de feed, por separado o combinados en uno.

- **TripUpdates** (retrasos, cancelaciones y paradas suprimidas) **intervienen en el cálculo de rutas**:
  - las horas previstas se calculan con las reglas de la especificación: el retraso se arrastra a las paradas siguientes hasta la próxima actualización, `NO_DATA` lo corta y se conserva el tiempo de parada si solo llega la llegada o la salida;
  - los viajes con datos en tiempo real se retiran de las conexiones programadas y se añaden, con sus horas previstas, a un **cuarto flujo del CSA** ordenado por hora real. Así no hay que reordenar las conexiones estáticas en cada actualización y el cálculo sigue siendo exacto: un retraso puede hacer perder un transbordo y un viaje cancelado no se usa;
  - los viajes se casan por `trip_id` (y `start_time` en los de `frequencies.txt`), las paradas por `stop_sequence` o `stop_id`, y si falta `start_date` se deduce el día de servicio;
  - las **próximas salidas** también usan las horas previstas y omiten los viajes cancelados.
- **VehiclePositions**: posición de los vehículos de los tramos del itinerario (`GET /api/realtime/vehicles`).
- **Alerts**: los avisos vigentes se adjuntan a los tramos a los que afectan (agencia, línea, sentido, viaje o paradas de subida y bajada, incluida su estación).
- **Descarga y caché**:
  - los feeds se descargan cada `GTFS_RT_REFRESH_SECONDS` en segundo plano y se guardan en memoria; las peticiones nunca esperan a la red salvo al reanudar tras una pausa (como mucho 3 s);
  - **pausa por inactividad**: si nadie usa la API durante `GTFS_RT_IDLE_MINUTES`, se deja de descargar (por ejemplo, de noche) y se reanuda con la siguiente petición;
  - `ETag`/`Last-Modified` y `header.timestamp` evitan reprocesar un feed que no ha cambiado;
  - ante errores, cada feed reintenta con **espera exponencial** (hasta 10 min) sin afectar a los demás;
  - los datos más antiguos que `GTFS_RT_MAX_AGE_SECONDS` se descartan, para no aplicar retrasos caducados si el proveedor deja de actualizar;
  - el cruce de los feeds con la red se calcula una vez por actualización y se reutiliza en todas las consultas.
- Límites de tamaño y tiempo de descarga; los textos de los avisos se recortan y solo se admiten enlaces `http(s)`.

### Buscador de direcciones (geocodificación)

- **Autocompletado** de calles, direcciones y lugares mediante Photon (o Nominatim), limitado a la zona del GTFS.
- Búsqueda de **paradas del GTFS** por nombre o código, sin tener en cuenta acentos.
- **Geocodificación inversa**: al pinchar en el mapa se muestra el nombre de la calle, o el de la parada si el punto cae encima.
- Caché en memoria. Si el proveedor externo falla, se devuelven igualmente las paradas.

### Interfaz web (frontend)

- **Mapa a pantalla completa** (OpenStreetMap) con un **panel flotante**, que en el móvil pasa a la parte inferior.
- Origen y destino por **búsqueda con autocompletado**, **"Tu ubicación"** (geolocalización del navegador; requiere `localhost` o HTTPS) o **pulsando en el mapa**. Los marcadores se pueden arrastrar y hay un botón para intercambiar origen y destino.
- **"Salir ahora"** o **"Salir a las"** una fecha y hora concretas.
- **Cálculo automático** al cambiar el origen, el destino o la hora.
- **Lista de alternativas**: horario, duración, líneas en su color, metros a pie, transbordos y "Sale en X min de…".
- **Detalle del itinerario** en forma de línea de tiempo:
  - tramos a pie con duración y distancia;
  - línea, sentido, "sale en X min" y siguientes salidas;
  - paradas intermedias desplegables;
  - parada de bajada.

  Al pulsar un tramo, el mapa se centra en él.

- **Mapa de la ruta**: tramos a pie con línea punteada, tramos en vehículo con el color de la línea y paradas con su hora en un _tooltip_.
- **Tiempo real** (si el backend lo tiene configurado):
  - horas previstas en verde (puntual), rojo (retraso) o naranja (adelanto), con la hora programada tachada debajo;
  - "Tiempo real · 3 min de retraso" en la lista y en el detalle, y número de avisos de cada alternativa;
  - avisos de incidencias en cada tramo, desplegables y con enlace a más información;
  - **vehículos en el mapa** con el color de su línea y una flecha hacia donde se mueven, actualizados periódicamente, y en el detalle por qué parada van;
  - con "Salir ahora", la ruta se recalcula cada minuto sin perder el itinerario que se está viendo.

  Solo se consulta mientras la pestaña está visible y para itinerarios en curso o que empiezan pronto.

- Horas mostradas en la **zona horaria del feed**.

### API REST

| Método | Ruta                                            | Descripción                                                                                                                                                                                                             |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health`                                   | Estado del servicio y si el GTFS está cargado                                                                                                                                                                           |
| `GET`  | `/api/gtfs`                                     | Información del feed: origen, última carga, estadísticas, zona geográfica, zona horaria y estado del tiempo real                                                                                                        |
| `POST` | `/api/gtfs/reload`                              | Fuerza la recarga del feed. Requiere `Authorization: Bearer <ADMIN_TOKEN>`; si `ADMIN_TOKEN` está vacío, el endpoint está deshabilitado                                                                                 |
| `POST` | `/api/plan`                                     | Calcula itinerarios. El tiempo de cálculo se devuelve en la cabecera `X-Compute-Time-Ms`. Con tiempo real, los tramos incluyen `realtime` (horas programadas y retrasos) y `alerts`, y la respuesta `realtimeUpdatedAt` |
| `GET`  | `/api/geocode/search?q=…[&lat=…&lon=…&limit=…]` | Busca direcciones, lugares y paradas                                                                                                                                                                                    |
| `GET`  | `/api/geocode/reverse?lat=…&lon=…`              | Nombre de un punto                                                                                                                                                                                                      |
| `GET`  | `/api/realtime/vehicles?tripIds=…`              | Posición de los vehículos de hasta 20 viajes (separados por comas). Lista vacía sin tiempo real                                                                                                                         |

Ejemplo de petición a `/api/plan`:

```json
{
  "from": { "lat": 38.26208, "lon": -0.70072 },
  "to": { "lat": 38.26155, "lon": -0.71986 },
  "dateTime": "2026-07-27T10:00:00+02:00",
  "maxItineraries": 3
}
```

Si no se indica `dateTime`, se usa la hora actual.

### Seguridad y observabilidad

- Validación estricta de las peticiones con Zod y límite de tamaño del cuerpo JSON.
- CORS restringido por configuración, cabeceras de seguridad, **límite de peticiones por IP** y token de administración para la recarga.
- **Trazas** configurables con `LOG_LEVEL`: una línea por petición, un resumen de cada cálculo de ruta y, en `debug`, el detalle de cada itinerario.

### Limitaciones conocidas

- Los tiempos andando son estimaciones en línea recta y no siguen el callejero real.
- GTFS-Realtime: no se usan los viajes que no están en el GTFS estático (`ADDED`, `NEW`, `DUPLICATED`), ni `TripModifications`, ni feeds incrementales (`DIFFERENTIAL`: se tratan como completos).
- El algoritmo optimiza la **hora de llegada**: una línea que llega más tarde, aunque tenga menos transbordos, puede no aparecer.
- No se usan `transfers.txt` ni `pathways.txt`.

---

## f. Usuario y contraseña de prueba

La aplicación **no tiene login**: es de acceso libre y no hace falta usuario ni contraseña para usarla.

La única operación protegida es `POST /api/gtfs/reload`, que no es un acceso de usuario sino un endpoint de administración. Para usarlo:

1. Define en `backend/.env` un token de al menos 16 caracteres, por ejemplo `ADMIN_TOKEN=token-de-prueba-1234`.
2. Envíalo en la cabecera de la petición:

```bash
curl -X POST http://localhost:3000/api/gtfs/reload -H "Authorization: Bearer token-de-prueba-1234"
```

## e. Enlaces

- Repositorio -> https://github.com/anabanana3/routeCalculator
- Despliegue -> https://route-calculator-sigma.vercel.app/
- Presentación -> https://drive.google.com/file/d/1cglqPBey88-9OYYK1e6bAHduw_FsG9sZ/view?usp=sharing
- Vídeo -> https://drive.google.com/file/d/1VxRgUcumSLf0iE6GeJfOQHwNEChneGCm/view?usp=sharing
