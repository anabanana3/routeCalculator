import { Router } from 'express';
import type { GetVehiclesUseCase } from '../../../application/use-cases/get-vehicles.js';
import type { VehiclesResponse } from '../dto.js';
import { toVehicleDto } from '../presenters.js';
import { describeIssues, vehiclesSchema } from '../schemas.js';

export function realtimeRoutes(getVehicles: Pick<GetVehiclesUseCase, 'execute'>): Router {
  const router = Router();

  router.get('/realtime/vehicles', (req, res) => {
    const parsed = vehiclesSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Parámetros no válidos', issues: describeIssues(parsed.error) });
      return;
    }
    const body: VehiclesResponse = { vehicles: getVehicles.execute(parsed.data.tripIds).map(toVehicleDto) };
    res.setHeader('Cache-Control', 'no-store');
    res.json(body);
  });

  return router;
}
