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

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_ML_API_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
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