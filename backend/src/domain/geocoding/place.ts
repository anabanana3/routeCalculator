export type GeocodeKind = 'address' | 'street' | 'poi' | 'stop';

/** Lugar encontrado por el buscador (dirección, calle, punto de interés o parada). */
export interface GeocodeResult {
  label: string;
  secondary?: string;
  lat: number;
  lon: number;
  kind: GeocodeKind;
}

export interface PlaceSearchResult {
  results: GeocodeResult[];
  /** Aviso si el proveedor externo ha fallado y solo se devuelven paradas. */
  warning?: string;
}

/** Quita resultados repetidos (misma etiqueta y texto secundario, sin distinguir mayúsculas). */
export function dedupeResults(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  return results.filter((p) => {
    const key = `${p.label}|${p.secondary ?? ''}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
