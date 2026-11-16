import { createApp } from './app.js';
import { config } from './config.js';
import { GtfsService } from './gtfs/service.js';

const gtfs = new GtfsService(config);
const app = createApp(gtfs, config.routing);

const server = app.listen(config.port, () => {
  console.log(`API escuchando en http://localhost:${config.port}`);
});

// La carga del GTFS no bloquea el arranque del servidor; mientras tanto /api/plan responde 503.
void gtfs.start();

const shutdown = () => {
  gtfs.stop();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
