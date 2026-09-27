'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { STATIONS } from '../data/trainData';
import { fetchStations } from './api';
import type { Station } from '../types/train';

export interface StationDirectory {
  /** Full directory — MongoDB-backed when reachable, offline catalog otherwise. */
  stations: Station[];
  /** True when the list came from the live MongoDB-backed station endpoint. */
  isLive: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Shared loader for the Indian Railways station directory.
 *
 * `GET /api/stations` returns the MongoDB catalogue (code + name only), so
 * city/state are only attached for stations that exist in the offline hub
 * catalogue — nothing is invented for the rest.
 */
export function useStationDirectory(): StationDirectory {
  const [stations, setStations] = useState<Station[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchStations(controller.signal)
      .then((list) => {
        const hubByCode = new Map(STATIONS.map((s) => [s.code, s]));
        setStations(
          list.map((s) => {
            const hub = hubByCode.get(s.code);
            return { code: s.code, name: s.name, city: hub?.city ?? '', state: hub?.state ?? '' };
          }),
        );
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setStations(null);
        setError((err as Error).message || 'Station directory unavailable.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return useMemo(
    () => ({
      stations: stations ?? STATIONS,
      isLive: stations !== null,
      loading,
      error,
    }),
    [stations, loading, error],
  );
}

/** Case-insensitive match on station name, code, city or state. */
export function filterStations(stations: Station[], query: string): Station[] {
  const q = query.trim().toLowerCase();
  if (!q) return stations;
  return stations.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q) ||
      s.state.toLowerCase().includes(q),
  );
}
