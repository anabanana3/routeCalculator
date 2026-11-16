import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { RoutingConfig } from './config.js';
import type { GtfsService } from './gtfs/service.js';
import { Planner } from './routing/planner.js';
import type { GtfsInfoDto } from './types/api.js';

const latLon = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const planSchema = z.object({
  from: latLon,
  to: latLon,
  dateTime: z.string().datetime({ offset: true }).optional(),
  maxItineraries: z.number().int().min(1).max(10).optional(),
});

export function createApp(gtfs: GtfsService, routing: RoutingConfig) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  let planner: Planner | null = gtfs.current ? new Planner(gtfs.current, routing) : null;
  gtfs.onLoad((data) => {
    planner = new Planner(data, routing);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', gtfsLoaded: gtfs.current !== null });
  });

  app.get('/api/gtfs', (_req, res) => {
    const data = gtfs.current;
    const info: GtfsInfoDto = {
      ...gtfs.status(),
      timezone: data?.timezone,
      agencies: data?.agencies.map((a) => a.name) ?? [],
      stats: data
        ? {
            stops: data.stops.length,
            routes: data.routes.length,
            trips: data.trips.length,
            connections: data.connections.count,
          }
        : undefined,
      bounds: data?.bounds ?? undefined,
    };
    res.json(info);
  });

  app.post('/api/gtfs/reload', (_req, res) => {
    void gtfs.reload(true);
    res.status(202).json({ status: 'reloading' });
  });

  app.post('/api/plan', (req, res) => {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Petición no válida', issues: parsed.error.issues });
      return;
    }
    if (!planner) {
      res.status(503).json({ error: 'Los datos GTFS todavía no están cargados' });
      return;
    }
    const started = Date.now();
    const result = planner.plan(parsed.data);
    res.setHeader('X-Compute-Time-Ms', String(Date.now() - started));
    res.json(result);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}
