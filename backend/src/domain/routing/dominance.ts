import type { Itinerary } from './itinerary.js';

function itineraryKey(it: Itinerary): string {
  return it.legs.map((l) => `${l.tripId ?? 'walk'}:${l.from.stopId ?? ''}`).join('|');
}

/** Elimina itinerarios que salen antes y llegan igual o más tarde que otro (y los duplicados). */
export function removeDominated(list: Itinerary[]): Itinerary[] {
  const unique = new Map<string, Itinerary>();
  for (const it of list) {
    const key = itineraryKey(it);
    if (!unique.has(key)) unique.set(key, it);
  }
  const items = [...unique.values()];
  return items.filter(
    (a) =>
      !items.some((b) => {
        if (b === a) return false;
        const better =
          b.startTime >= a.startTime &&
          b.endTime <= a.endTime &&
          (b.startTime > a.startTime || b.endTime < a.endTime || b.transfers < a.transfers);
        return better && b.transfers <= a.transfers;
      }),
  );
}
