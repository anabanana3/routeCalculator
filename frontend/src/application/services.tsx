import { createContext, useContext, type ReactNode } from 'react';
import type { GeolocationService } from './ports/geolocation';
import type { TransitApi } from './ports/transit-api';

export interface Services {
  api: TransitApi;
  geolocation: GeolocationService;
}

const ServicesContext = createContext<Services | null>(null);

/** Inyecta las implementaciones de los puertos (reales en main.tsx, simuladas en los tests). */
export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices debe usarse dentro de <ServicesProvider>');
  return services;
}
