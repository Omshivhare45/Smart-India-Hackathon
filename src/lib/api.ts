/**
 * RailBuddy API client.
 *
 * Wraps the FastAPI backend (ml/api/main.py):
 *   - POST /api/predict          ML delay/ETA forecast
 *   - GET  /api/live/train/{no}  real-time NTES running feed
 *   - GET  /health               service health
 */

export interface PredictRequest {
  train_number: string;
  station_code: string;
  station_index?: number;
  journey_date?: string;
  delay_current_minutes: number;
  current_speed_kmh: number;
  distance_covered_km?: number;
  target?: string;
}

export interface PredictionResponse {
  predicted_delay_minutes: number;
  predicted_eta: string;
  confidence: number;
  model_used: string;
  target_station: string;
  scheduled_arrival: string;
  data_source: string;
}

export interface NtesTrain {
  TrainNumber?: string;
  TrainName?: string;
  Source?: string;
  SourceName?: string;
  Destination?: string;
  DestinationName?: string;
  Type?: string;
}

export interface NtesScheduleStation {
  StationCode?: string;
  StationName?: string;
  STA?: string;
  STD?: string;
  Halt?: number;
  Distance?: number;
  Day?: number;
  Sr?: number;
}

export interface NtesSchedule {
  TrainName?: string;
  TrainNumber?: string;
  DaysOfRun?: string;
  TravelTime?: string;
  vStartDateList?: string[];
  stations?: NtesScheduleStation[];
}

export interface NtesWaysideStop {
  SC?: string;
  SN?: string;
  STA?: string;
  STD?: string;
  DIST?: number;
  SrWTT?: number;
}

export interface NtesLiveStop {
  SC: string;
  SN?: string;
  STA?: string;
  STD?: string;
  DARR?: string;
  DDEP?: string;
  ETA?: string;
  ETD?: string;
  PF?: string;
  ISD?: boolean;
  ISA?: boolean;
  DIST?: number;
  WTTSTNS?: NtesWaysideStop[];
}

export interface NtesLiveStatus {
  TN?: string;
  TNM?: string;
  SRC?: string;
  DSTN?: string;
  LSTN?: string;
  LSTNN?: string;
  NSTN?: string;
  NSTNN?: string;
  NPSTN?: string;
  NPSTNN?: string;
  LDEL?: number;
  ISPTT?: boolean;
  LTIME?: string;
  LUPDFULL?: string;
  LASTUPD?: string;
  TRUNST?: number;
  STNS?: NtesLiveStop[];
}

export interface LiveTrainPipelineStep {
  step: string;
  success: boolean;
  detail: string;
}

export interface LiveTrainPayload {
  success: boolean;
  data_source: string;
  train_number: string;
  journey_date_used?: string;
  error?: string;
  search?: { Trains?: NtesTrain[] };
  train_info?: Record<string, unknown>;
  schedule?: NtesSchedule;
  live_status?: NtesLiveStatus;
  pipeline?: LiveTrainPipelineStep[];
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';
const DEFAULT_BACKEND_API_BASE_URL = 'http://127.0.0.1:4000';

export function getApiBaseUrl(): string {
  return (process.env.ML_API_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

/** Node.js railbuddy-backend (Express, port 4000) which proxies RailRadar. */
export function getBackendApiBaseUrl(): string {
  return (process.env.BACKEND_API_URL || DEFAULT_BACKEND_API_BASE_URL).replace(/\/+$/, '');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractErrorDetail(body: unknown, status: number): string {
  if (isObject(body)) {
    const detail = body.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0 && isObject(detail[0])) {
      const msg = detail[0].msg;
      if (typeof msg === 'string') return msg;
    }
  }
  return `Request failed with HTTP ${status}`;
}

export async function fetchLiveTrain(
  trainNumber: string,
  signal?: AbortSignal,
): Promise<LiveTrainPayload> {
  const res = await fetch(
    `${getApiBaseUrl()}/api/live/train/${encodeURIComponent(trainNumber)}`,
    { signal },
  );

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body — fall through to generic message */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }

  const data: unknown = await res.json();
  return data as LiveTrainPayload;
}

export async function predictDelay(
  request: PredictRequest,
  signal?: AbortSignal,
): Promise<PredictionResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body — fall through to generic message */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }

  const data: unknown = await res.json();
  return data as PredictionResponse;
}

export async function fetchApiHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}

/** Real-time dynamic ETA (GET /api/trains/{no}/prediction) */

export interface FullPredictionTrain {
  trainNumber: string;
  trainName: string;
  type: string;
  sourceCode: string;
  sourceName: string;
  destinationCode: string;
  destinationName: string;
  distanceKm: number;
  duration: string;
  departureTime: string;
  arrivalTime: string;
}

export interface FullPredictionLiveStatus {
  live_available: boolean;
  current_station: string | null;
  current_station_name: string | null;
  previous_station: string | null;
  next_station: string | null;
  current_delay_minutes: number | null;
  current_speed_kmh: number | null;
  distance_covered_km: number | null;
  total_distance_km: number | null;
  last_updated: string | null;
  journey_date_used: string | null;
}

export interface CongestionFactor {
  name: string;
  value: number | null;
  unit: string | null;
  source: string;
  score: number | null;
}

export interface CongestionInfo {
  score: number | null;
  level: string;
  estimated: boolean;
  basis: string;
  factors: CongestionFactor[];
}

export interface FullPredictionBreakdown {
  ml_predicted_delay: number;
  current_live_delay: number | null;
  progress_factor: number;
  speed_factor: number;
  congestion_factor: number;
}

export interface FullPrediction {
  ml_base_delay: number;
  live_adjusted_delay: number;
  confidence: number;
  model_used: string;
  target_eta: string | null;
  target_station: string;
  scheduled_arrival: string;
  breakdown: FullPredictionBreakdown;
  sources: {
    live_delay: string;
    progress: string;
    speed: string;
    congestion: string;
    ml_base: string;
  };
}

export interface UpcomingStationEta {
  station_name: string;
  station_code: string;
  station_index: number;
  distance_remaining_km: number;
  scheduled_arrival: string;
  predicted_delay_minutes: number;
  predicted_eta: string | null;
  confidence: number;
  delay_source: string;
}

export interface FullPredictionResponse {
  train: FullPredictionTrain;
  live_status: FullPredictionLiveStatus;
  congestion: CongestionInfo;
  prediction: FullPrediction;
  current_station: {
    station_name: string | null;
    station_code: string | null;
    current_delay_minutes: number | null;
    last_update: string | null;
  };
  upcoming_stations: UpcomingStationEta[];
  generated_at: string;
}

export async function fetchFullPrediction(
  trainNumber: string,
  query: {
    journey_date?: string;
    station_code?: string;
    distance_covered_km?: number;
    current_speed_kmh?: number;
  } = {},
  signal?: AbortSignal,
): Promise<FullPredictionResponse> {
  const params = new URLSearchParams();
  if (query.journey_date) params.set('journey_date', query.journey_date);
  if (query.station_code) params.set('station_code', query.station_code);
  if (query.distance_covered_km !== undefined) {
    params.set('distance_covered_km', String(query.distance_covered_km));
  }
  if (query.current_speed_kmh !== undefined) {
    params.set('current_speed_kmh', String(query.current_speed_kmh));
  }

  const qs = params.toString();
  const res = await fetch(
    `${getApiBaseUrl()}/api/trains/${encodeURIComponent(trainNumber)}/prediction${qs ? `?${qs}` : ''}`,
    { signal },
  );

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body — fall through to generic message */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }

  const data: unknown = await res.json();
  return data as FullPredictionResponse;
}

// =============================================================================
// Live Railway Map & Telemetry API Client
// =============================================================================

export interface MapLiveTrain {
  train_number: string;
  train_name: string;
  type: string;
  current_lat: number;
  current_lng: number;
  bearing: number;
  speed: number | null;
  delay_minutes: number;
  status: 'on_time' | 'moderate' | 'delayed';
  current_station: string;
  current_station_name: string;
  next_station: string;
  next_station_name: string;
  next_lat: number | null;
  next_lng: number | null;
  curr_distance: number | null;
  next_distance: number | null;
  mins_since_dep: number | null;
  departure_minutes: number | null;
  next_arrival_minutes: number | null;
  source: string;
}

export interface MapLiveTrainsResponse {
  success: boolean;
  trains: MapLiveTrain[];
  count: number;
  updated_at: string;
  source: string;
  is_demo: boolean;
  live_available?: boolean;
  warning?: string | null;
}

export interface RouteStationStop {
  sequence: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export interface TrainRouteResponse {
  success?: boolean;
  train_number: string;
  format: string;
  coordinates: [number, number][]; // [lng, lat]
  stops: RouteStationStop[];
  source: string;
}

export interface MapStationUpcomingEta {
  station_code: string;
  station_name: string;
  distance_remaining_km?: number;
  scheduled_arrival: string;
  live_estimated_arrival: string;
  railbuddy_predicted_eta: string;
  predicted_delay_minutes: number;
  confidence: number;
  delay_source: string;
  lat?: number;
  lng?: number;
}

export interface TrainMapEtaResponse {
  success: boolean;
  train: FullPredictionTrain;
  live_status: FullPredictionLiveStatus;
  congestion: CongestionInfo;
  prediction: FullPrediction;
  current_station: {
    station_name: string | null;
    station_code: string | null;
    current_delay_minutes: number | null;
    last_update: string | null;
  };
  upcoming_stations: MapStationUpcomingEta[];
  generated_at: string;
}

export interface StationDetailResponse {
  success: boolean;
  station: {
    code: string;
    name: string;
    lat: number;
    lng: number;
    zone: string;
    platforms: number;
    arriving_trains: MapLiveTrain[];
    departing_trains: MapLiveTrain[];
    total_active: number;
    congestion: string;
  };
}

export interface CongestionCorridor {
  corridor_id: string;
  name: string;
  level: 'Normal' | 'Busy' | 'Congested' | 'Critical';
  score: number;
  active_trains_count: number;
  avg_delay_minutes: number;
  coordinates: [number, number][];
  stations: string[];
}

export interface MapStation {
  code: string;
  name: string;
  lat: number;
  lng: number;
  zone?: string;
  platforms?: number;
  rank?: string;
}

export async function fetchMapLiveTrains(
  forceRefresh: boolean = false,
  signal?: AbortSignal,
): Promise<MapLiveTrainsResponse> {
  const url = `${getApiBaseUrl()}/api/map/trains${forceRefresh ? '?force_refresh=true' : ''}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }
  return (await res.json()) as MapLiveTrainsResponse;
}

export async function fetchMapStations(
  signal?: AbortSignal,
): Promise<{ success: boolean; stations: MapStation[] }> {
  const url = `${getApiBaseUrl()}/api/map/stations`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }
  return (await res.json()) as { success: boolean; stations: MapStation[] };
}

export async function fetchTrainRoute(
  trainNumber: string,
  signal?: AbortSignal,
): Promise<TrainRouteResponse> {
  const url = `${getApiBaseUrl()}/api/live/train/${encodeURIComponent(trainNumber)}/route`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }
  return (await res.json()) as TrainRouteResponse;
}

export async function fetchTrainMapEta(
  trainNumber: string,
  query: { journey_date?: string; station_code?: string; current_speed_kmh?: number } = {},
  signal?: AbortSignal,
): Promise<TrainMapEtaResponse> {
  const params = new URLSearchParams();
  if (query.journey_date) params.set('journey_date', query.journey_date);
  if (query.station_code) params.set('station_code', query.station_code);
  if (query.current_speed_kmh !== undefined) params.set('current_speed_kmh', String(query.current_speed_kmh));

  const qs = params.toString();
  const url = `${getApiBaseUrl()}/api/live/train/${encodeURIComponent(trainNumber)}/eta${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }
  return (await res.json()) as TrainMapEtaResponse;
}

export async function fetchStationDetail(
  stationCode: string,
  signal?: AbortSignal,
): Promise<StationDetailResponse> {
  const url = `${getApiBaseUrl()}/api/stations/${encodeURIComponent(stationCode)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }
  return (await res.json()) as StationDetailResponse;
}

export async function fetchMapCongestion(
  signal?: AbortSignal,
): Promise<{ success: boolean; corridors: CongestionCorridor[] }> {
  const url = `${getApiBaseUrl()}/api/map/congestion`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(extractErrorDetail(body, res.status));
  }
  return (await res.json()) as { success: boolean; corridors: CongestionCorridor[] };
}

// =============================================================================
// Real trains between stations (Node backend -> RailRadar)
// =============================================================================

export interface BetweenTrainLive {
  type?: string;
  startDate?: string;
  departedAt?: string;
  delayMinutes?: number;
  platform?: string | null;
}

export interface BetweenTrainStop {
  code: string;
  name: string;
  city?: string;
  departure?: string;
  arrival?: string;
  day?: number;
  sequence?: number;
}

export interface BetweenTrain {
  train: {
    number: string;
    name: string;
    type: string;
    runDays: string[];
    runningDaysBitmap?: number;
  };
  from: BetweenTrainStop;
  to: BetweenTrainStop;
  distance: number;
  duration: number; // travel time in minutes
  totalHaltsBetween: number;
  live?: BetweenTrainLive | null;
}

export interface TrainsBetweenData {
  from: { code: string; name: string };
  to: { code: string; name: string };
  trains: BetweenTrain[];
  count: number;
}

export interface TrainsBetweenResponse {
  success: boolean;
  data?: TrainsBetweenData;
  error?: { code?: string; message?: string };
}

export async function fetchTrainsBetween(
  from: string,
  to: string,
  options: { date?: string; live?: boolean; signal?: AbortSignal } = {},
): Promise<TrainsBetweenData> {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (options.date) params.set('date', options.date);
  params.set('live', options.live === false ? 'false' : 'true');

  const res = await fetch(
    `${getBackendApiBaseUrl()}/api/trains/between?${params.toString()}`,
    { signal: options.signal },
  );

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body — fall through to generic message */
    }
    const err = (body as TrainsBetweenResponse | null)?.error;
    throw new Error((err?.message || extractErrorDetail(body, res.status)).replace(/\.?$/, '.'));
  }

  const data: unknown = await res.json();
  const parsed = data as TrainsBetweenResponse;
  if (!parsed?.data) {
    throw new Error(parsed?.error?.message || 'No train data returned for this route.');
  }
  return parsed.data;
}

// =============================================================================
// Real Indian Railways station directory (Node backend -> RailRadar)
// =============================================================================

export interface RealStation {
  code: string;
  name: string;
}

export interface StationsResponse {
  success: boolean;
  count: number;
  data: RealStation[];
}

export async function fetchStations(signal?: AbortSignal): Promise<RealStation[]> {
  const res = await fetch(`${getBackendApiBaseUrl()}/api/stations?limit=0`, { signal });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body — fall through to generic message */
    }
    const err = (body as { error?: { message?: string } } | null)?.error;
    throw new Error((err?.message || extractErrorDetail(body, res.status)).replace(/\.?$/, '.'));
  }

  const parsed = (await res.json()) as StationsResponse;
  if (!Array.isArray(parsed?.data)) {
    throw new Error('Station directory unavailable.');
  }
  return parsed.data;
}