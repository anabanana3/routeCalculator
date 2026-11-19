import { useEffect, useState } from 'react';
import { useServices } from '../services';
import type { LatLon } from '../../domain/types/api';
import type { SelectedPlace } from '../../domain/types/place';

export const MIN_SEARCH_CHARS = 3;
export const SEARCH_DEBOUNCE_MS = 300;

export interface PlaceSearchState {
  results: SelectedPlace[];
  loading: boolean;
  warning?: string;
  /** El usuario ha escrito lo suficiente y el texto no es el del lugar ya elegido. */
  typing: boolean;
}

/** Autocompletado de lugares con espera entre pulsaciones y cancelación de peticiones antiguas. */
export function usePlaceSearch(inputValue: string, selectedLabel: string | undefined, focus?: LatLon): PlaceSearchState {
  const { api } = useServices();
  const [results, setResults] = useState<SelectedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | undefined>();

  const q = inputValue.trim();
  const typing = q.length >= MIN_SEARCH_CHARS && q !== selectedLabel;

  useEffect(() => {
    if (!typing) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .geocodeSearch(q, focus, controller.signal)
        .then((res) => {
          setResults(res.results);
          setWarning(res.warning);
          setLoading(false);
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') {
            setResults([]);
            setLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, q, typing, focus?.lat, focus?.lon]);

  return { results, loading, warning, typing };
}
