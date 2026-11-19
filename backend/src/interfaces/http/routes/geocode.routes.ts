import { Router } from 'express';
import type { ReverseGeocodeUseCase } from '../../../application/use-cases/reverse-geocode.js';
import type { SearchPlacesUseCase } from '../../../application/use-cases/search-places.js';
import type { GeocodeReverseResponse, GeocodeSearchResponse } from '../dto.js';
import { toGeocodeResultDto } from '../presenters.js';
import { describeIssues, reverseSchema, searchSchema } from '../schemas.js';

export function geocodeRoutes(
  searchPlaces: Pick<SearchPlacesUseCase, 'execute'>,
  reverseGeocode: Pick<ReverseGeocodeUseCase, 'execute'>,
): Router {
  const router = Router();

  router.get('/geocode/search', async (req, res) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Parámetros no válidos', issues: describeIssues(parsed.error) });
      return;
    }
    const { q, limit, lat, lon } = parsed.data;
    const focus = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
    const result = await searchPlaces.execute({ q, limit, focus });
    const body: GeocodeSearchResponse = { results: result.results.map(toGeocodeResultDto) };
    if (result.warning) body.warning = result.warning;
    res.json(body);
  });

  router.get('/geocode/reverse', async (req, res) => {
    const parsed = reverseSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Parámetros no válidos', issues: describeIssues(parsed.error) });
      return;
    }
    const result = await reverseGeocode.execute(parsed.data);
    const body: GeocodeReverseResponse = { result: result ? toGeocodeResultDto(result) : null };
    res.json(body);
  });

  return router;
}
