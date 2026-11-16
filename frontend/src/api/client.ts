import { appConfig } from '../config';
import type { GtfsInfoDto, PlanRequest, PlanResponse } from '../types/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${appConfig.apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // respuesta sin JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  gtfsInfo: () => request<GtfsInfoDto>('/api/gtfs'),
  plan: (body: PlanRequest, signal?: AbortSignal) =>
    request<PlanResponse>('/api/plan', { method: 'POST', body: JSON.stringify(body), signal }),
};
