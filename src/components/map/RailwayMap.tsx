'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, GeoJSONSource, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  fetchMapLiveTrains,
  fetchMapStations,
  fetchTrainRoute,
  fetchTrainMapEta,
  fetchStationDetail,
  fetchMapCongestion,
  MapLiveTrain,
  MapStation,
  TrainRouteResponse,
  TrainMapEtaResponse,
  StationDetailResponse,
  CongestionCorridor,
} from '../../lib/api';

import { MapControls, MapStatusChip } from './MapControls';
import { TrainSearchBar } from './TrainSearchBar';
import { TrainEtaSidePanel } from './TrainEtaSidePanel';
import { StationInfoModal } from './StationInfoModal';
import { RefreshCw, Navigation } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const INDIA_CENTER: [number, number] = [78.9629, 21.5937];
const DEFAULT_ZOOM = 5.0;

/**
 * OpenFreeMap "dark" style — free, key-less (no API key required), no rate
 * limits, and production-supported. Override per deployment with the
 * NEXT_PUBLIC_MAP_STYLE_URL env var (e.g. a custom self-hosted provider).
 */
const OPENFREEMAP_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || OPENFREEMAP_DARK_STYLE;

/** Restrained dark-theme delay palette (green → amber → orange → red). */
const DELAY_TO_ICON = {
  0: '#2FA98A', // on-time
  1: '#E0A22E', // slight
  2: '#E0782E', // moderate
  3: '#E05C5C', // severe
} as const;

interface IconSpec {
  name: string;
  color: string;
  stroke: string;
}

const TRAIN_ICON_SPECS: IconSpec[] = [
  { name: 'train-g', color: DELAY_TO_ICON[0], stroke: '#0B0F19' },
  { name: 'train-a', color: DELAY_TO_ICON[1], stroke: '#0B0F19' },
  { name: 'train-o', color: DELAY_TO_ICON[2], stroke: '#0B0F19' },
  { name: 'train-r', color: DELAY_TO_ICON[3], stroke: '#0B0F19' },
  { name: 'train-selected', color: '#4EA8FF', stroke: '#EFF6FF' },
];

/** North-pointing teardrop used as the directional train marker. */
function trainIconSvg(color: string, stroke: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
    `<path d="M8 1C9 3 15.4 9.5 15.4 11.4a7.4 7.4 0 0 1-14.8 0C0.6 9.5 7 3 8 1Z" ` +
    `fill="${color}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/></svg>`
  );
}

function loadIcons(
  specs: IconSpec[],
): Promise<{ name: string; img: HTMLImageElement }[]> {
  return Promise.all(
    specs.map(
      (s) =>
        new Promise<{ name: string; img: HTMLImageElement }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ name: s.name, img });
          img.onerror = () => reject(new Error(`Icon ${s.name} failed to load`));
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
            trainIconSvg(s.color, s.stroke),
          )}`;
        }),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
// GeoJSON helpers
// ─────────────────────────────────────────────────────────────

/** Encode a delay value to a numeric status for MapLibre expressions */
function delayToStatus(delay: number): number {
  if (delay <= 0) return 0;   // on-time
  if (delay <= 5) return 1;   // slight
  if (delay <= 20) return 2;  // moderate
  return 3;                   // severe
}

function trainsToGeoJSON(
  trains: MapLiveTrain[],
  selectedNumber: string | null,
): GeoJSON.FeatureCollection {
  const hasSelection = Boolean(selectedNumber);
  return {
    type: 'FeatureCollection',
    features: trains.map((t) => ({
      type: 'Feature',
      id: t.train_number,            // stable id for feature-state
      properties: {
        train_number: t.train_number,
        train_name: t.train_name,
        status: t.status,
        delay_minutes: t.delay_minutes ?? 0,
        delay_status: delayToStatus(t.delay_minutes ?? 0),
        speed: t.speed,
        bearing: t.bearing ?? 0,
        current_station: t.current_station,
        current_station_name: t.current_station_name ?? t.current_station,
        next_station: t.next_station,
        next_station_name: t.next_station_name ?? t.next_station,
        type: t.type ?? 'Express',
        is_selected: t.train_number === selectedNumber ? 1 : 0,
        dimmed: hasSelection && t.train_number !== selectedNumber ? 1 : 0,
      },
      geometry: {
        type: 'Point',
        coordinates: [t.current_lng, t.current_lat],
      },
    })),
  };
}

function stationsToGeoJSON(stations: MapStation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      id: s.code,
      properties: {
        code: s.code,
        name: s.name,
        hub: s.rank === 'major' ? 1 : 0,
      },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    })),
  };
}

function routeStopsToGeoJSON(
  stops: TrainRouteResponse['stops'],
): GeoJSON.FeatureCollection {
  if (!stops) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature',
      properties: { code: s.code, name: s.name },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    })),
  };
}

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

// ─────────────────────────────────────────────────────────────
// Map loading state — subtle phase label, no generic spinner
// ─────────────────────────────────────────────────────────────
const MapLoadingPhase: React.FC = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1300);
    const t2 = setTimeout(() => setPhase(2), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const labels = [
    'Loading railway network…',
    'Connecting to live telemetry…',
    'Positioning live trains…',
  ];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-col items-center gap-1.5">
        {labels.map((l, i) => (
          <div
            key={l}
            className={`text-[11px] font-mono text-slate-500 transition-all duration-300 ${
              phase === i
                ? 'opacity-90 text-slate-300'
                : phase > i
                ? 'opacity-30 text-slate-600 line-through decoration-slate-700'
                : 'opacity-0'
            }`}
          >
            {l}
          </div>
        ))}
      </div>
      <div className="rb-loading-bar h-px w-40 rounded-full" />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

interface RailwayMapProps {
  initialTrainNumber?: string | null;
  onSelectTrainExternal?: (train: MapLiveTrain) => void;
  className?: string;
  isDashboardWidget?: boolean;
  onExpandToFull?: () => void;
}

export const RailwayMap: React.FC<RailwayMapProps> = ({
  initialTrainNumber = null,
  onSelectTrainExternal,
  className = '',
  isDashboardWidget = false,
  onExpandToFull,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapInitError, setMapInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const mapErrorRef = useRef<string | null>(null);

  // Live train data
  const [trains, setTrains] = useState<MapLiveTrain[]>([]);
  const trainsRef = useRef<MapLiveTrain[]>([]);
  trainsRef.current = trains;

  // Station catalogue (real CORE_STATIONS from the backend)
  const [stations, setStations] = useState<MapStation[]>([]);

  // Selection state
  const [selectedTrain, setSelectedTrain] = useState<MapLiveTrain | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<TrainRouteResponse | null>(null);
  const [trainEtaData, setTrainEtaData] = useState<TrainMapEtaResponse | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaError, setEtaError] = useState<string | null>(null);

  // Station card
  const [selectedStationData, setSelectedStationData] =
    useState<StationDetailResponse['station'] | null>(null);
  const [stationLoading, setStationLoading] = useState(false);

  // Congestion
  const [congestionCorridors, setCongestionCorridors] = useState<CongestionCorridor[]>([]);

  // Layer toggles
  const [showTrains, setShowTrains] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showCongestion, setShowCongestion] = useState(false);
  const [showRailwayNetwork, setShowRailwayNetwork] = useState(true);

  // Live ticker
  const [lastUpdatedAgo, setLastUpdatedAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [unavailableWarning, setUnavailableWarning] = useState<string | null>(null);
  const lastFetchTimeRef = useRef(Date.now());

  // Keep stable refs to callbacks used inside map event handlers
  const handleSelectTrainRef = useRef<(train: MapLiveTrain) => void>(() => {});
  const handleStationClickRef = useRef<(code: string) => void>(() => {});

  const connectionIssue = Boolean(networkError) || Boolean(unavailableWarning);

  // ─────────────────────────────────────────────────────────────
  // 1. Initialize MapLibre GL
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let disposed = false;
    setMapInitError(null);

    const initTimeout = setTimeout(() => {
      if (disposed || mapRef.current?.loaded()) return;
      setMapInitError(
        mapErrorRef.current ||
          'Timed out while loading the map style and tiles. Check network access to tiles.openfreemap.org.',
      );
    }, 20000);

    (async () => {
      let icons: { name: string; img: HTMLImageElement }[] = [];
      try {
        icons = await loadIcons(TRAIN_ICON_SPECS);
      } catch {
        icons = [];
      }

      if (disposed || !mapContainerRef.current) return;

      // Turbopack dev does not emit a usable URL for maplibre's internal
      // `new URL("maplibre-gl-worker.mjs", import.meta.url)` (resolves to ""),
      // which makes module-worker creation fetch the page and fail MIME checks.
      // Serve the self-contained worker from /public instead.
      maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE_URL,
        center: INDIA_CENTER,
        zoom: isDashboardWidget ? 4.2 : DEFAULT_ZOOM,
        minZoom: 3.5,
        maxZoom: 18,
        attributionControl: false,
      });

      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'bottom-left',
      );

      map.on('error', (e) => {
        if (disposed || mapRef.current?.loaded()) return;
        const maybe = e as { error?: unknown; message?: string };
        const detail =
          maybe.error instanceof Error && maybe.error.message
            ? maybe.error.message
            : maybe.message || 'Unknown style or tile error.';
        mapErrorRef.current = detail;
      });

      map.on('load', () => {
        clearTimeout(initTimeout);
        setMapInitError(null);
        const hasBasemapVector = typeof map.getSource('openmaptiles') !== 'undefined';

        // ── RAILWAY NETWORK (national → regional) from basemap vector ──
        if (hasBasemapVector) {
          // National spine — subtle casing for separation from basemap
          map.addLayer({
            id: 'rail-network-casing',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            minzoom: 3,
            maxzoom: 13.4,
            filter: [
              'all',
              ['==', ['get', 'class'], 'rail'],
              ['!', ['has', 'service']],
            ],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#0C1524',
              'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 6, 2.6, 9, 3.2, 12, 4],
              'line-opacity': 0.85,
            },
          });

          // National network — subtle, subordinate to map content
          map.addLayer({
            id: 'rail-network',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            minzoom: 3,
            maxzoom: 13.4,
            filter: [
              'all',
              ['==', ['get', 'class'], 'rail'],
              ['!', ['has', 'service']],
            ],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#43566C',
              'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 6, 1, 9, 1.4, 12, 1.8],
              'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 7, 0.4, 11, 0.5, 13.4, 0.55],
            },
          });

          // Regional network — slightly stronger as you zoom in
          map.addLayer({
            id: 'rail-network-region',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            minzoom: 7.5,
            maxzoom: 13.4,
            filter: [
              'all',
              ['==', ['get', 'class'], 'rail'],
              ['!', ['has', 'service']],
            ],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#5A7089',
              'line-width': ['interpolate', ['linear'], ['zoom'], 7.5, 1.1, 10, 1.7, 12, 2.4],
              'line-opacity': ['interpolate', ['linear'], ['zoom'], 7.5, 0.42, 11, 0.55, 13.4, 0.6],
            },
          });
        }

        // ── STATIONS SOURCE (real CORE_STATIONS catalogue) ──────────
        map.addSource('stations-source', {
          type: 'geojson',
          data: EMPTY_FC,
        });

        map.addLayer({
          id: 'station-dots',
          type: 'circle',
          source: 'stations-source',
          minzoom: 3,
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'hub'], 1],
              ['interpolate', ['linear'], ['zoom'], 3, 2.2, 8, 3.2, 14, 3.8],
              ['interpolate', ['linear'], ['zoom'], 3, 1.5, 8, 2, 14, 2.4],
            ],
            'circle-color': ['case', ['==', ['get', 'hub'], 1], '#94A3B8', '#5B6B7D'],
            'circle-opacity': ['case', ['==', ['get', 'hub'], 1], 0.85, 0.5],
            'circle-stroke-width': ['case', ['==', ['get', 'hub'], 1], 0.7, 0],
            'circle-stroke-color': '#0B0F19',
            'circle-stroke-opacity': 0.9,
          },
        });

        // Hub labels appear regionally, not at national zoom
        map.addLayer({
          id: 'station-labels-hub',
          type: 'symbol',
          source: 'stations-source',
          minzoom: 5.5,
          filter: ['==', ['get', 'hub'], 1],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9.5, 12, 11],
            'text-anchor': 'top',
            'text-offset': [0, 1],
            'text-max-width': 12,
          },
          paint: {
            'text-color': '#9FB3C8',
            'text-halo-color': '#0B0F19',
            'text-halo-width': 1.4,
          },
        });

        // All station labels only when you can actually read them
        map.addLayer({
          id: 'station-labels-regular',
          type: 'symbol',
          source: 'stations-source',
          minzoom: 9,
          filter: ['!=', ['get', 'hub'], 1],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 8.5,
            'text-anchor': 'top',
            'text-offset': [0, 0.9],
            'text-max-width': 10,
          },
          paint: {
            'text-color': '#64748B',
            'text-halo-color': '#0B0F19',
            'text-halo-width': 1.1,
          },
        });

        // ── TRAINS SOURCE — clustered GeoJSON ─────────────────────
        map.addSource('trains-source', {
          type: 'geojson',
          data: EMPTY_FC,
          cluster: true,
          clusterMaxZoom: 8,
          clusterRadius: 55,
          clusterProperties: {
            // Aggregate worst delay + whether a selection is inside, so
            // clusters can be colored by delay and dimmed when a train
            // is selected.
            max_delay: ['max', ['get', 'delay_minutes']],
            sel: ['+', ['get', 'is_selected']],
          },
        });

        // ── CLUSTER CIRCLES — compact, subordinate to the map ─────
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'trains-source',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'max_delay'],
              DELAY_TO_ICON[0], // on time
              5,  DELAY_TO_ICON[1], // slight
              20, DELAY_TO_ICON[2], // moderate
              40, DELAY_TO_ICON[3], // severe
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              12,
              10,  15,
              50,  18,
              200, 22,
            ],
            'circle-opacity': ['case', ['>', ['get', 'sel'], 0], 0.35, 0.85],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#0B0F19',
            'circle-stroke-opacity': 0.75,
          },
        });

        // ── CLUSTER MINI ICON + COUNT ─────────────────────────────
        map.addLayer({
          id: 'cluster-icon',
          type: 'symbol',
          source: 'trains-source',
          filter: ['has', 'point_count'],
          layout: {
            'icon-image': [
              'step',
              ['get', 'max_delay'],
              'train-g',
              5, 'train-a',
              20, 'train-o',
              40, 'train-r',
            ],
            'icon-size': 0.34,
            'icon-anchor': 'center',
            'icon-offset': [0, -15],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });

        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'trains-source',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Bold', 'Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 10,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.45)',
            'text-halo-width': 0.6,
          },
        });

        if (icons.length > 0) {
          icons.forEach((icon) => {
            if (!map.hasImage(icon.name)) map.addImage(icon.name, icon.img);
          });

          // ── UNCLUSTERED TRAINS — compact directional markers ─────
          map.addLayer({
            id: 'unclustered-trains',
            type: 'symbol',
            source: 'trains-source',
            filter: [
              'all',
              ['!', ['has', 'point_count']],
              ['!=', ['get', 'is_selected'], 1],
            ],
            minzoom: 4.5,
            layout: {
              'icon-image': [
                'step',
                ['get', 'delay_status'],
                'train-g',
                1, 'train-a',
                2, 'train-o',
                3, 'train-r',
              ],
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-anchor': 'center',
              'icon-size': [
                'interpolate', ['linear'], ['zoom'],
                5, 0.38,
                8, 0.46,
                12, 0.54,
                14, 0.6,
              ],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: {
              'icon-opacity': ['case', ['==', ['get', 'dimmed'], 1], 0.24, 0.9],
            },
          });
        } else {
          // Fallback: plain dots if the sprite could not be generated
          map.addLayer({
            id: 'unclustered-trains',
            type: 'circle',
            source: 'trains-source',
            filter: [
              'all',
              ['!', ['has', 'point_count']],
              ['!=', ['get', 'is_selected'], 1],
            ],
            minzoom: 4.5,
            paint: {
              'circle-color': [
                'step',
                ['get', 'delay_minutes'],
                DELAY_TO_ICON[0],
                5,  DELAY_TO_ICON[1],
                20, DELAY_TO_ICON[2],
                40, DELAY_TO_ICON[3],
              ],
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.6, 14, 3.8],
              'circle-opacity': ['case', ['==', ['get', 'dimmed'], 1], 0.24, 0.85],
              'circle-stroke-width': 1,
              'circle-stroke-color': '#0B0F19',
            },
          });
        }

        // Hover label — number, name & delay appear only on hover
        map.addLayer({
          id: 'train-hover-label',
          type: 'symbol',
          source: 'trains-source',
          filter: ['==', ['feature-state', 'hovered'], true],
          minzoom: 6.5,
          layout: {
            'text-field': [
              'concat',
              ['get', 'train_number'],
              '  ',
              ['get', 'train_name'],
              '\n',
              [
                'case',
                ['<=', ['get', 'delay_minutes'], 0],
                'On time',
                ['concat', '+', ['to-string', ['round', ['get', 'delay_minutes']]], ' min'],
              ],
            ],
            'text-font': ['Noto Sans Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 10,
            'text-anchor': 'top',
            'text-offset': [0, 1],
            'text-line-height': 1.35,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#E2E8F0',
            'text-halo-color': '#0B0F19',
            'text-halo-width': 2,
          },
        });

        // ── SELECTED TRAIN — separate source, always on top ──────
        map.addSource('selected-train-source', {
          type: 'geojson',
          data: EMPTY_FC,
        });

        // Soft footprint — subtle, no neon glow
        map.addLayer({
          id: 'selected-train-glow',
          type: 'circle',
          source: 'selected-train-source',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              5, 13,
              12, 19,
            ],
            'circle-color': '#38BDF8',
            'circle-opacity': 0.07,
            'circle-stroke-width': 0,
            'circle-blur': 1,
          },
        });

        // Ring
        map.addLayer({
          id: 'selected-train-ring',
          type: 'circle',
          source: 'selected-train-source',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              5, 9,
              12, 13,
            ],
            'circle-color': '#12233B',
            'circle-opacity': 0.85,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#38BDF8',
            'circle-stroke-opacity': 0.95,
          },
        });

        // Directional marker for the selected train
        map.addLayer({
          id: 'selected-train-icon',
          type: 'symbol',
          source: 'selected-train-source',
          layout: {
            'icon-image': 'train-selected',
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-anchor': 'center',
            'icon-size': [
              'interpolate', ['linear'], ['zoom'],
              4, 0.7,
              12, 0.9,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });

        // Train number + name label (always visible for selected train)
        map.addLayer({
          id: 'selected-train-label',
          type: 'symbol',
          source: 'selected-train-source',
          layout: {
            'text-field': ['concat', ['get', 'train_number'], '\n', ['get', 'train_name_short']],
            'text-font': ['Noto Sans Bold', 'Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-offset': [0, -2.4],
            'text-anchor': 'bottom',
            'text-line-height': 1.3,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-max-width': 14,
          },
          paint: {
            'text-color': '#BFDBFE',
            'text-halo-color': '#0B0F19',
            'text-halo-width': 2,
          },
        });

        // ── ROUTE SOURCES — completed + remaining split ───────────
        map.addSource('route-completed-source', {
          type: 'geojson',
          data: EMPTY_FC,
        });

        map.addSource('route-remaining-source', {
          type: 'geojson',
          data: EMPTY_FC,
        });

        // Completed — muted dashed
        map.addLayer({
          id: 'route-completed',
          type: 'line',
          source: 'route-completed-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#64748B',
            'line-width': 1.8,
            'line-opacity': 0.6,
            'line-dasharray': [2, 3],
          },
        });

        // Remaining route — casing then soft glow then crisp core
        map.addLayer({
          id: 'route-remaining-casing',
          type: 'line',
          source: 'route-remaining-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#0B0F19',
            'line-width': 5.5,
            'line-opacity': 0.85,
            'line-blur': 0.6,
          },
        });

        map.addLayer({
          id: 'route-remaining-glow',
          type: 'line',
          source: 'route-remaining-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#38BDF8',
            'line-width': 6,
            'line-opacity': 0.12,
            'line-blur': 4,
          },
        });

        map.addLayer({
          id: 'route-remaining',
          type: 'line',
          source: 'route-remaining-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#60A5FA',
            'line-width': 2.4,
            'line-opacity': 0.95,
          },
        });

        // ── ROUTE STATIONS ────────────────────────────────────────
        map.addSource('route-stations-source', {
          type: 'geojson',
          data: EMPTY_FC,
        });

        map.addLayer({
          id: 'route-stations',
          type: 'circle',
          source: 'route-stations-source',
          minzoom: 4,
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              4, 2.2,
              10, 3.6,
            ],
            'circle-color': '#0F172A',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#60A5FA',
            'circle-opacity': 0.9,
          },
        });

        map.addLayer({
          id: 'route-stations-labels',
          type: 'symbol',
          source: 'route-stations-source',
          minzoom: 8,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 10,
            'text-offset': [0, 1.3],
            'text-anchor': 'top',
            'text-max-width': 8,
          },
          paint: {
            'text-color': '#94A3B8',
            'text-halo-color': '#0B0F19',
            'text-halo-width': 1.5,
          },
        });

        // ── CONGESTION ────────────────────────────────────────────
        map.addSource('congestion-source', {
          type: 'geojson',
          data: EMPTY_FC,
        });

        map.addLayer({
          id: 'congestion-layer',
          type: 'line',
          source: 'congestion-source',
          minzoom: 3,
          layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'none' },
          paint: {
            'line-color': [
              'match', ['get', 'level'],
              'Critical',  '#F05252',
              'Congested', '#E0782E',
              'Busy',      '#D9A02E',
              '#2FA98A',
            ],
            'line-width': 2.5,
            'line-opacity': 0.5,
            'line-dasharray': [2, 2],
          },
        });

        // ── CLUSTER CLICK: zoom in ────────────────────────────────
        map.on('click', 'clusters', (e: MapMouseEvent) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
          if (!features.length) return;
          const clusterId = features[0].properties?.cluster_id as number | undefined;
          if (clusterId === undefined) return;
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
          (map.getSource('trains-source') as GeoJSONSource)
            .getClusterExpansionZoom(clusterId)
            .then((zoom: number) => {
              map.easeTo({ center: coords, zoom: zoom + 0.5, duration: 500 });
            })
            .catch(() => {});
        });

        // ── INDIVIDUAL TRAIN CLICK ────────────────────────────────
        map.on(
          'click',
          'unclustered-trains',
          (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
            const features = e.features;
            if (!features?.length) return;
            const tn = features[0].properties?.train_number as string | undefined;
            if (!tn) return;
            const train = trainsRef.current.find((t) => t.train_number === tn);
            if (train) handleSelectTrainRef.current(train);
          },
        );

        // ── STATION CLICK: open station panel ─────────────────────
        map.on(
          'click',
          'station-dots',
          (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
            const features = e.features;
            if (!features?.length) return;
            const code = features[0].properties?.code as string | undefined;
            if (code) handleStationClickRef.current(code);
          },
        );

        // ── HOVER: cursor + train tooltip ─────────────────────────
        let hoveredTrainId: string | null = null;
        const clearTrainHover = () => {
          if (hoveredTrainId !== null) {
            try {
              map.setFeatureState(
                { source: 'trains-source', id: hoveredTrainId },
                { hovered: false },
              );
            } catch { /* feature may have been replaced */ }
            hoveredTrainId = null;
          }
        };

        const pointerOn = () => { map.getCanvas().style.cursor = 'pointer'; };
        const pointerOff = () => { map.getCanvas().style.cursor = ''; };
        map.on('mouseenter', 'clusters', pointerOn);
        map.on('mouseleave', 'clusters', pointerOff);
        map.on('mouseenter', 'station-dots', pointerOn);
        map.on('mouseleave', 'station-dots', pointerOff);

        map.on(
          'mousemove',
          'unclustered-trains',
          (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
            map.getCanvas().style.cursor = 'pointer';
            const id = e.features?.[0]?.id as string | undefined;
            if (id && id !== hoveredTrainId) {
              clearTrainHover();
              hoveredTrainId = id;
              try {
                map.setFeatureState(
                  { source: 'trains-source', id },
                  { hovered: true },
                );
              } catch { /* ignore */ }
            }
          },
        );
        map.on('mouseleave', 'unclustered-trains', () => {
          clearTrainHover();
          pointerOff();
        });

        setMapReady(true);
      });

      mapRef.current = map;

      // Dev-only handle for visual QA (never shipped in production builds)
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as Record<string, unknown>).__railbuddyMap = map;
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(initTimeout);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDashboardWidget, initAttempt]);

  // ─────────────────────────────────────────────────────────────
  // 2. Load Live Train Positions
  // ─────────────────────────────────────────────────────────────
  const loadTrains = useCallback(async (forceRefresh = false) => {
    try {
      setIsRefreshing(true);
      const res = await fetchMapLiveTrains(forceRefresh);
      if (res.success && Array.isArray(res.trains)) {
        setTrains(res.trains);
        setIsDemo(Boolean(res.is_demo));
        if (res.trains.length === 0 && res.warning) {
          setUnavailableWarning(res.warning);
        } else {
          setUnavailableWarning(null);
        }
        setNetworkError(null);
        if (res.trains.length > 0) {
          // Only a fetched snapshot with real positions counts as "last success"
          lastFetchTimeRef.current = Date.now();
          setLastUpdatedAgo(0);
        }
      }
    } catch (err: unknown) {
      setNetworkError(
        err instanceof Error ? err.message : 'Unable to connect to live train feed',
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTrains();
  }, [loadTrains]);

  useEffect(() => {
    fetchMapCongestion()
      .then((res) => { if (res.success) setCongestionCorridors(res.corridors); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchMapStations()
      .then((res) => {
        if (mounted && res.success && Array.isArray(res.stations)) {
          setStations(res.stations);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-refresh every 35 seconds
  useEffect(() => {
    const refreshInterval = setInterval(() => loadTrains(), 35000);
    const secondsTicker = setInterval(() => {
      setLastUpdatedAgo(Math.floor((Date.now() - lastFetchTimeRef.current) / 1000));
    }, 1000);
    return () => {
      clearInterval(refreshInterval);
      clearInterval(secondsTicker);
    };
  }, [loadTrains]);

  // ─────────────────────────────────────────────────────────────
  // 3. Update Trains GeoJSON Source (no DOM markers, no map recreate)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('trains-source') as GeoJSONSource | undefined;
    if (!source) return;

    source.setData(
      showTrains
        ? trainsToGeoJSON(trains, selectedTrain?.train_number ?? null)
        : EMPTY_FC,
    );
  }, [mapReady, trains, selectedTrain, showTrains]);

  // ─────────────────────────────────────────────────────────────
  // 4. Update Stations GeoJSON Source
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('stations-source') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(stations.length ? stationsToGeoJSON(stations) : EMPTY_FC);
  }, [mapReady, stations]);

  // ─────────────────────────────────────────────────────────────
  // 5. Update Selected Train Source
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('selected-train-source') as GeoJSONSource | undefined;
    if (!source) return;

    if (!selectedTrain) {
      source.setData(EMPTY_FC);
      return;
    }

    const shortName =
      selectedTrain.train_name.length > 18
        ? selectedTrain.train_name.slice(0, 17) + '…'
        : selectedTrain.train_name;

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            train_number: selectedTrain.train_number,
            train_name_short: shortName,
            bearing: selectedTrain.bearing ?? 0,
          },
          geometry: {
            type: 'Point',
            coordinates: [selectedTrain.current_lng, selectedTrain.current_lat],
          },
        },
      ],
    });
  }, [mapReady, selectedTrain]);

  // ─────────────────────────────────────────────────────────────
  // 6. Handle Train Selection
  // ─────────────────────────────────────────────────────────────
  const handleSelectTrain = useCallback(
    async (train: MapLiveTrain) => {
      setSelectedTrain(train);
      setSelectedRoute(null);
      setTrainEtaData(null);

      if (onSelectTrainExternal) onSelectTrainExternal(train);

      const map = mapRef.current;
      if (map) {
        map.flyTo({
          center: [train.current_lng, train.current_lat],
          zoom: Math.max(map.getZoom(), 8.5),
          speed: 1.3,
          curve: 1.5,
          essential: true,
        });
      }

      // Fetch route
      try {
        const routeData = await fetchTrainRoute(train.train_number);
        if (routeData?.coordinates?.length > 0) {
          setSelectedRoute(routeData);
        }
      } catch {
        // non-fatal
      }

      // Fetch RailBuddy ML ETA
      setEtaLoading(true);
      setEtaError(null);
      try {
        const etaRes = await fetchTrainMapEta(train.train_number, {
          station_code: train.current_station,
          current_speed_kmh: train.speed ?? undefined,
        });
        if (etaRes.success) setTrainEtaData(etaRes);
      } catch (err: unknown) {
        setEtaError(
          err instanceof Error ? err.message : 'Failed to calculate ML ETA',
        );
      } finally {
        setEtaLoading(false);
      }
    },
    [onSelectTrainExternal],
  );

  // Keep refs in sync (used inside map event handlers)
  useEffect(() => {
    handleSelectTrainRef.current = handleSelectTrain;
  }, [handleSelectTrain]);

  // Respond to initialTrainNumber prop
  useEffect(() => {
    if (!initialTrainNumber || trains.length === 0) return;
    const match = trains.find((t) => t.train_number === initialTrainNumber);
    if (match && selectedTrain?.train_number !== initialTrainNumber) {
      handleSelectTrain(match);
    }
  }, [initialTrainNumber, trains, handleSelectTrain, selectedTrain]);

  // ─────────────────────────────────────────────────────────────
  // 7. Update Route Layers (completed / remaining split)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const completedSrc = map.getSource('route-completed-source') as GeoJSONSource | undefined;
    const remainingSrc = map.getSource('route-remaining-source') as GeoJSONSource | undefined;
    const stationsSrc  = map.getSource('route-stations-source') as GeoJSONSource | undefined;

    if (!selectedRoute || !showRoutes || selectedRoute.coordinates.length < 2) {
      completedSrc?.setData(EMPTY_FC);
      remainingSrc?.setData(EMPTY_FC);
      stationsSrc?.setData(EMPTY_FC);
      return;
    }

    const coords = selectedRoute.coordinates as [number, number][];

    // Find split index: closest point in the route to current train position
    let splitIdx = 0;
    if (selectedTrain) {
      const [lng, lat] = [selectedTrain.current_lng, selectedTrain.current_lat];
      let minDist = Infinity;
      coords.forEach(([cLng, cLat], i) => {
        const d = (cLng - lng) ** 2 + (cLat - lat) ** 2;
        if (d < minDist) { minDist = d; splitIdx = i; }
      });
    }

    // Completed segment
    if (splitIdx > 0) {
      completedSrc?.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords.slice(0, splitIdx + 1) },
        }],
      });
    } else {
      completedSrc?.setData(EMPTY_FC);
    }

    // Remaining segment
    remainingSrc?.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords.slice(splitIdx) },
      }],
    });

    // Station stops
    if (showStations && selectedRoute.stops?.length) {
      stationsSrc?.setData(routeStopsToGeoJSON(selectedRoute.stops));
    } else {
      stationsSrc?.setData(EMPTY_FC);
    }
  }, [mapReady, selectedRoute, showRoutes, showStations, selectedTrain]);

  // ─────────────────────────────────────────────────────────────
  // 8. Update Congestion Layer
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('congestion-source') as GeoJSONSource | undefined;
    if (!source) return;

    if (!showCongestion || !congestionCorridors.length) {
      source.setData(EMPTY_FC);
      return;
    }

    source.setData({
      type: 'FeatureCollection',
      features: congestionCorridors
        .filter((c) => c.coordinates?.length >= 2)
        .map((c) => ({
          type: 'Feature' as const,
          properties: {
            corridor_id: c.corridor_id,
            name: c.name,
            level: c.level,
            score: c.score,
          },
          geometry: { type: 'LineString' as const, coordinates: c.coordinates },
        })),
    });
  }, [mapReady, showCongestion, congestionCorridors]);

  // ─────────────────────────────────────────────────────────────
  // 9. Layer visibility toggles
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const vis = (v: boolean): 'visible' | 'none' => (v ? 'visible' : 'none');
    const safeSet = (layer: string, value: 'visible' | 'none') => {
      try { if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', value); }
      catch { /* layer not yet added */ }
    };

    safeSet('rail-network-casing',   vis(showRailwayNetwork));
    safeSet('rail-network',          vis(showRailwayNetwork));
    safeSet('rail-network-region',   vis(showRailwayNetwork));
    safeSet('clusters',              vis(showTrains));
    safeSet('cluster-count',         vis(showTrains));
    safeSet('cluster-icon',          vis(showTrains));
    safeSet('unclustered-trains',    vis(showTrains));
    safeSet('train-hover-label',     vis(showTrains));
    safeSet('selected-train-glow',   vis(showTrains));
    safeSet('selected-train-ring',   vis(showTrains));
    safeSet('selected-train-icon',   vis(showTrains));
    safeSet('selected-train-label',  vis(showTrains));
    safeSet('station-dots',          vis(showStations));
    safeSet('station-labels-hub',    vis(showStations));
    safeSet('station-labels-regular', vis(showStations));
    safeSet('route-completed',       vis(showRoutes));
    safeSet('route-remaining-casing', vis(showRoutes));
    safeSet('route-remaining-glow',  vis(showRoutes));
    safeSet('route-remaining',       vis(showRoutes));
    safeSet('route-stations',        vis(showStations));
    safeSet('route-stations-labels', vis(showStations));
    safeSet('congestion-layer',      vis(showCongestion));
  }, [mapReady, showTrains, showStations, showRoutes, showCongestion, showRailwayNetwork]);

  // ─────────────────────────────────────────────────────────────
  // 10. Station Click Handler
  // ─────────────────────────────────────────────────────────────
  const handleStationClick = useCallback(
    async (stationCode: string) => {
      setStationLoading(true);
      setSelectedStationData(null);

      const map = mapRef.current;
      const station = stations.find((s) => s.code === stationCode);
      if (map && station) {
        map.flyTo({
          center: [station.lng, station.lat],
          zoom: Math.max(map.getZoom(), 6.5),
          speed: 1.3,
          curve: 1.4,
          essential: true,
        });
      }

      try {
        const res = await fetchStationDetail(stationCode);
        if (res.success) setSelectedStationData(res.station);
      } catch {
        // non-fatal
      } finally {
        setStationLoading(false);
      }
    },
    [stations],
  );

  useEffect(() => {
    handleStationClickRef.current = handleStationClick;
  }, [handleStationClick]);

  // ─────────────────────────────────────────────────────────────
  // Camera Controls
  // ─────────────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => mapRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => mapRef.current?.zoomOut(), []);

  const handleLocateSelected = useCallback(() => {
    if (!selectedTrain || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [selectedTrain.current_lng, selectedTrain.current_lat],
      zoom: 10,
      speed: 1.3,
      essential: true,
    });
  }, [selectedTrain]);

  const handleResetView = useCallback(() => {
    mapRef.current?.flyTo({
      center: INDIA_CENTER,
      zoom: isDashboardWidget ? 4.2 : DEFAULT_ZOOM,
      speed: 1.0,
      essential: true,
    });
  }, [isDashboardWidget]);

  const handleRetryMap = useCallback(() => {
    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch {
        /* noop */
      }
      mapRef.current = null;
    }
    setMapReady(false);
    setMapInitError(null);
    setInitAttempt((n) => n + 1);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className={`relative w-full h-full min-h-[520px] overflow-hidden bg-[#0b0b0c] ${className}`}>
      {/* MapLibre Canvas */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Map loading state — subtle, on-the-map, no generic spinner */}
      {!mapReady && !mapInitError && (
        <div className="absolute inset-0 bg-[#0b0b0c] z-10 pointer-events-none">
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
            <MapLoadingPhase />
          </div>
        </div>
      )}

      {/* Map init failure — proper error state with retry */}
      {mapInitError && (
        <div className="absolute inset-0 bg-[#0b0b0c] z-20 flex flex-col items-center justify-center gap-3 px-6">
          <div className="text-[13px] font-semibold text-slate-200">Map failed to load</div>
          <p className="text-[10.5px] font-mono text-slate-500 max-w-[52ch] text-center break-words leading-relaxed">
            {mapInitError}
          </p>
          <button
            onClick={handleRetryMap}
            className="flex items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-500/10 text-sky-200 px-3 py-1.5 text-[11px] font-mono font-bold hover:bg-sky-500/20 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* Connection / availability banner */}
      {connectionIssue && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto rb-surface rounded-lg border border-amber-400/25 px-3.5 py-2 flex items-center gap-3 rb-anim-fade-up">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
          </span>
          <span className="text-[10.5px] font-mono text-amber-200/90 max-w-[36ch]">
            {networkError
              ? 'Live train positions temporarily unavailable. Showing last snapshot.'
              : 'Live train positions temporarily unavailable — retrying automatically.'}
          </span>
          <button
            onClick={() => loadTrains(true)}
            className="flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-200 px-2 py-1 text-[10px] font-mono font-bold hover:bg-amber-400/20 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      )}

      {/* Top bar — command search + live status chip */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-wrap items-start gap-2 max-w-[calc(100%-2rem)]">
        <TrainSearchBar
          trains={trains}
          selectedTrainNumber={selectedTrain?.train_number || null}
          onSelectTrain={handleSelectTrain}
          onSelectStation={handleStationClick}
          className="w-full min-w-0 sm:w-96"
        />
        <MapStatusChip
          trainCount={trains.length}
          lastUpdatedSecondsAgo={lastUpdatedAgo}
          isRefreshing={isRefreshing}
          onRefreshNow={() => loadTrains(true)}
          isDemo={isDemo}
          isConnectionIssue={connectionIssue}
        />
      </div>

      {/* Vertical control group — bottom-right (desktop) / top-right (mobile) */}
      <div className="absolute z-20 top-16 right-3 sm:top-auto sm:bottom-3">
        <MapControls
          trainCount={trains.length}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onLocateSelected={handleLocateSelected}
          onResetView={handleResetView}
          showTrains={showTrains}
          onToggleTrains={() => setShowTrains((p) => !p)}
          showStations={showStations}
          onToggleStations={() => setShowStations((p) => !p)}
          showRoutes={showRoutes}
          onToggleRoutes={() => setShowRoutes((p) => !p)}
          showCongestion={showCongestion}
          onToggleCongestion={() => setShowCongestion((p) => !p)}
          showRailwayNetwork={showRailwayNetwork}
          onToggleRailwayNetwork={() => setShowRailwayNetwork((p) => !p)}
          hasSelectedTrain={Boolean(selectedTrain)}
          lastUpdatedSecondsAgo={lastUpdatedAgo}
          isRefreshing={isRefreshing}
          onRefreshNow={() => loadTrains(true)}
          isDemo={isDemo}
          isConnectionIssue={connectionIssue}
        />
      </div>

      {/* Dashboard: expand button */}
      {isDashboardWidget && onExpandToFull && (
        <div className="absolute bottom-4 left-4 z-20 pointer-events-auto">
          <button
            onClick={onExpandToFull}
            className="px-4 py-2 rounded-lg bg-sky-500/90 hover:bg-sky-500 text-white font-mono text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-2 border border-sky-300/30 transition-all active:scale-95"
          >
            <Navigation className="w-3.5 h-3.5" />
            Open Full Railway Map
          </button>
        </div>
      )}

      {/* ETA panel — floating operational card (top-right) / bottom sheet (mobile) */}
      {selectedTrain && (
        <div className="absolute z-30 pointer-events-none left-2 right-2 bottom-2 sm:left-auto sm:right-4 sm:bottom-auto sm:top-4 sm:w-[360px]">
          <TrainEtaSidePanel
            train={selectedTrain}
            etaData={trainEtaData}
            loading={etaLoading}
            error={etaError}
            onClose={() => {
              setSelectedTrain(null);
              setSelectedRoute(null);
              setTrainEtaData(null);
            }}
            onLocate={handleLocateSelected}
          />
        </div>
      )}

      {/* Station card — compact, bottom-left */}
      {(selectedStationData || stationLoading) && (
        <div className="absolute bottom-4 left-4 z-30 pointer-events-none">
          <StationInfoModal
            stationData={selectedStationData}
            loading={stationLoading}
            onClose={() => setSelectedStationData(null)}
            onSelectTrain={handleSelectTrain}
          />
        </div>
      )}
    </div>
  );
};