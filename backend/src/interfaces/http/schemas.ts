import { z } from 'zod';

const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);
const latLon = z.object({ lat, lon });

export const planSchema = z.object({
  from: latLon,
  to: latLon,
  dateTime: z.iso.datetime({ offset: true }).optional(),
  maxItineraries: z.number().int().min(1).max(10).optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(6),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

export const reverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Errores de validación sin eco de los valores recibidos. */
export function describeIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}
