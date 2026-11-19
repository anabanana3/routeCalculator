import { Router } from 'express';
import type { PlanTripUseCase } from '../../../application/use-cases/plan-trip.js';
import { toPlanResponse } from '../presenters.js';
import { describeIssues, planSchema } from '../schemas.js';

export function planRoutes(planTrip: Pick<PlanTripUseCase, 'execute'>): Router {
  const router = Router();
  router.post('/plan', (req, res) => {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Petición no válida', issues: describeIssues(parsed.error) });
      return;
    }
    const { plan, computeMs } = planTrip.execute(parsed.data);
    res.setHeader('X-Compute-Time-Ms', String(computeMs));
    res.json(toPlanResponse(plan));
  });
  return router;
}
