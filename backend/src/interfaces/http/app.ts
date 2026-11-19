import cors, { type CorsOptions } from 'cors';
import express from 'express';
import { type Logger, silentLogger } from '../../application/ports/logger.js';
import type { GetFeedInfoUseCase } from '../../application/use-cases/get-feed-info.js';
import type { PlanTripUseCase } from '../../application/use-cases/plan-trip.js';
import type { ReloadFeedUseCase } from '../../application/use-cases/reload-feed.js';
import type { ReverseGeocodeUseCase } from '../../application/use-cases/reverse-geocode.js';
import type { SearchPlacesUseCase } from '../../application/use-cases/search-places.js';
import type { AppConfig } from '../../infrastructure/config/env-config.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { rateLimit } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { geocodeRoutes } from './routes/geocode.routes.js';
import { gtfsRoutes } from './routes/gtfs.routes.js';
import { planRoutes } from './routes/plan.routes.js';

export interface HttpDependencies {
  planTrip: Pick<PlanTripUseCase, 'execute'>;
  getFeedInfo: Pick<GetFeedInfoUseCase, 'execute'>;
  reloadFeed: Pick<ReloadFeedUseCase, 'execute'>;
  searchPlaces: Pick<SearchPlacesUseCase, 'execute'>;
  reverseGeocode: Pick<ReverseGeocodeUseCase, 'execute'>;
  security: AppConfig['security'];
  logger?: Logger;
}

/** Tamaño máximo del cuerpo JSON: las peticiones válidas ocupan unos cientos de bytes. */
export const JSON_BODY_LIMIT = '10kb';

export function corsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins.includes('*') ? true : origins.length > 0 ? origins : false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };
}

export function createApp(deps: HttpDependencies) {
  const logger = deps.logger ?? silentLogger;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.security.trustProxy);

  app.use(requestLogger(logger));
  app.use(securityHeaders());
  app.use(cors(corsOptions(deps.security.corsOrigins)));
  app.use(
    '/api',
    rateLimit({
      windowMs: deps.security.rateLimitWindowMs,
      max: deps.security.rateLimitMax,
      skip: (path) => path === '/health',
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', gtfsRoutes(deps.getFeedInfo, deps.reloadFeed, deps.security.adminToken));
  app.use('/api', planRoutes(deps.planTrip));
  app.use('/api', geocodeRoutes(deps.searchPlaces, deps.reverseGeocode));

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
