/** La red de transporte todavía no está cargada. */
export class NetworkNotLoadedError extends Error {
  constructor() {
    super('Los datos GTFS todavía no están cargados');
    this.name = 'NetworkNotLoadedError';
  }
}
