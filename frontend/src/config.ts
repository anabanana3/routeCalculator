const env = import.meta.env;

export const appConfig = {
  apiUrl: (env.VITE_API_URL as string | undefined) ?? '',
  map: {
    // Cambiando estas variables se puede usar otro proveedor de teselas (MapTiler, Stadia, Mapbox...)
    tileUrl: (env.VITE_TILE_URL as string | undefined) || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      (env.VITE_TILE_ATTRIBUTION as string | undefined) ||
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    defaultCenter: [Number(env.VITE_DEFAULT_LAT ?? 40.4168), Number(env.VITE_DEFAULT_LON ?? -3.7038)] as [
      number,
      number,
    ],
    defaultZoom: 14,
  },
};
