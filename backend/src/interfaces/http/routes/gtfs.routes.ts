import { Router } from 'express';
import type { GetFeedInfoUseCase } from '../../../application/use-cases/get-feed-info.js';
import type { ReloadFeedUseCase } from '../../../application/use-cases/reload-feed.js';
import { requireAdminToken } from '../middleware/admin-auth.js';
import { toGtfsInfoDto } from '../presenters.js';

export function gtfsRoutes(
  getFeedInfo: Pick<GetFeedInfoUseCase, 'execute'>,
  reloadFeed: Pick<ReloadFeedUseCase, 'execute'>,
  adminToken: string,
): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', gtfsLoaded: getFeedInfo.execute().status.loaded });
  });

  router.get('/gtfs', (_req, res) => {
    res.json(toGtfsInfoDto(getFeedInfo.execute()));
  });

  // Recargar el feed es costoso: solo con token de administración.
  router.post('/gtfs/reload', requireAdminToken(adminToken), (_req, res) => {
    reloadFeed.execute();
    res.status(202).json({ status: 'reloading' });
  });

  return router;
}
