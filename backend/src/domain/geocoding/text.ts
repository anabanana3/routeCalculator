/** Normaliza texto para búsquedas: sin acentos, minúsculas, solo letras/números y espacios simples. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Une las partes no vacías con ", " omitiendo repeticiones (sin distinguir mayúsculas). */
export function joinUnique(parts: (string | undefined)[]): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = p?.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.length > 0 ? out.join(', ') : undefined;
}
