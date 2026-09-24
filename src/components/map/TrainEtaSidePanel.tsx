'use client';

import React, { useState } from 'react';
import {
  X,
  Navigation,
  Clock,
  BrainCircuit,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Route as RouteIcon,
} from 'lucide-react';
import { MapLiveTrain, TrainMapEtaResponse } from '../../lib/api';

interface TrainEtaSidePanelProps {
  train: MapLiveTrain;
  etaData: TrainMapEtaResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onLocate: () => void;
}

interface TimelineNode {
  station_code?: string;
  station_name: string;
  railbuddy_predicted_eta?: string;
  scheduled_arrival?: string;
  predicted_delay_minutes?: number;
  distance_remaining_km?: number;
  is_destination?: boolean;
}

/* ─────────────────────────────────────────────────────────────
   Delay tone helpers — single restrained palette
   ───────────────────────────────────────────────────────────── */
function delayTone(delay: number) {
  if (delay <= 0)
    return {
      text: 'text-emerald-300',
      chip: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
      bar: 'bg-emerald-400',
      label: 'On time',
    };
  if (delay <= 5)
    return {
      text: 'text-green-300',
      chip: 'bg-green-400/10 text-green-300 border-green-400/20',
      bar: 'bg-green-400',
      label: `${delay} min late`,
    };
  if (delay <= 20)
    return {
      text: 'text-amber-300',
      chip: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
      bar: 'bg-amber-400',
      label: `${delay} min late`,
    };
  return {
    text: 'text-rose-300',
    chip: 'bg-rose-400/10 text-rose-300 border-rose-400/20',
    bar: 'bg-rose-400',
    label: `${delay} min late`,
  };
}

export const TrainEtaSidePanel: React.FC<TrainEtaSidePanelProps> = ({
  train,
  etaData,
  loading,
  error,
  onClose,
  onLocate,
}) => {
  const [expanded, setExpanded] = useState(false);

  // ── Live telemetry values ───────────────────────────────────
  const currentDelay = etaData?.live_status?.current_delay_minutes ?? train.delay_minutes ?? 0;
  const currentSpeed = etaData?.live_status?.current_speed_kmh ?? train.speed ?? null;
  const currentStation =
    etaData?.live_status?.current_station_name ??
    etaData?.current_station?.station_name ??
    train.current_station_name ??
    train.current_station ??
    'Running on section';
  const nextStation =
    etaData?.live_status?.next_station ??
    train.next_station_name ??
    train.next_station ??
    'Upcoming stoppage';

  const mlPrediction = etaData?.prediction;
  const confidencePct = mlPrediction?.confidence ? Math.round(mlPrediction.confidence * 100) : null;
  const modelUsed = mlPrediction?.model_used ?? null;
  const upcoming = etaData?.upcoming_stations ?? [];
  const nextEta = upcoming[0]?.railbuddy_predicted_eta ?? mlPrediction?.target_eta ?? null;
  const tone = delayTone(currentDelay);

  const srcName = etaData?.train?.sourceName ?? train.source ?? train.current_station_name;
  const dstName = etaData?.train?.destinationName ?? nextStation;
  const dstCode = etaData?.train?.destinationCode ?? train.next_station;
  const distance = etaData?.train?.distanceKm;

  const destinationNode =
    dstName && upcoming.length > 0 &&
    dstName !== upcoming[upcoming.length - 1]?.station_name
      ? {
          station_name: dstName,
          station_code: dstCode ?? undefined,
          railbuddy_predicted_eta: mlPrediction?.target_eta ?? undefined,
          scheduled_arrival: mlPrediction?.scheduled_arrival ?? undefined,
          predicted_delay_minutes: mlPrediction?.live_adjusted_delay ?? currentDelay,
          is_destination: true as const,
        }
      : null;

  const timelineNodes: TimelineNode[] = [
    ...upcoming.map((u) => ({
      station_code: u.station_code,
      station_name: u.station_name,
      railbuddy_predicted_eta: u.railbuddy_predicted_eta,
      scheduled_arrival: u.scheduled_arrival,
      predicted_delay_minutes: u.predicted_delay_minutes,
      distance_remaining_km: u.distance_remaining_km,
    })),
    ...(destinationNode ? [destinationNode] : []),
  ];

  return (
    <div
      className={`rb-surface-strong w-full pointer-events-auto rounded-xl overflow-hidden text-slate-200 font-sans flex flex-col max-h-[min(70dvh,30rem)] sm:max-h-[min(calc(100dvh-2rem),40rem)] ${
        expanded ? 'rb-anim-scale-in' : 'rb-anim-panel'
      }`}
    >
      {/* ── HEADER ───────────────────────────────────────────── */}
      <div className="px-4 pt-3.5 pb-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="font-mono text-[12px] font-bold text-sky-300 tabular-nums">
                {train.train_number}
              </span>
              {train.type && (
                <span className="text-[9px] font-mono font-semibold px-1.5 py-px rounded bg-white/6 text-slate-400 uppercase tracking-wide">
                  {train.type}
                </span>
              )}
              <span className={`text-[9.5px] font-mono font-bold px-1.5 py-px rounded border ${tone.chip}`}>
                {currentDelay <= 0 ? 'ON TIME' : `+${Math.round(currentDelay)}m`}
              </span>
            </div>
            <h3 className="text-[13.5px] font-semibold text-white leading-snug tracking-tight truncate">
              {train.train_name}
            </h3>
            <div className="flex items-center gap-1 text-[10.5px] text-slate-500 font-mono mt-0.5">
              <span className="truncate">{srcName}</span>
              <ArrowRight className="w-2.5 h-2.5 text-slate-600 shrink-0" />
              <span className="truncate">{dstName}</span>
              {distance && <span className="text-slate-600 shrink-0">• {distance} km</span>}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onLocate}
              title="Centre map on train"
              aria-label="Centre map on train"
              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-white/6 transition-colors"
            >
              <Navigation className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              title="Close panel"
              aria-label="Close panel"
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/6 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── COMPACT VIEW ─────────────────────────────────────── */}
      {!expanded && (
        <div className="shrink-0">
          {/* Running strip */}
          <div className="flex items-stretch justify-between gap-3 px-4 py-2.5 border-y border-white/6 bg-white/1">
            <div className="min-w-0 flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span
                  className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70"
                  style={{ animation: 'rb-breathe 2.4s ease-in-out infinite' }}
                />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <div className="min-w-0">
                <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-300/90">
                  Running
                </div>
                <div className="text-[11px] font-semibold text-slate-200 truncate leading-tight">
                  {currentStation}
                </div>
              </div>
            </div>
            <div className="border-l border-white/6 shrink-0 pl-3 text-right">
              <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">
                Speed
              </div>
              <div className="text-[12px] font-mono font-bold text-slate-100 tabular-nums leading-tight">
                {currentSpeed !== null ? `${Math.round(currentSpeed)}` : '—'}
                <span className="text-[9px] font-normal text-slate-500 ml-0.5">km/h</span>
              </div>
            </div>
          </div>

          {/* Next stop + RailBuddy ETA */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="rb-label mb-0.5">Next stop</div>
              <div className="text-[12px] font-semibold text-sky-200 truncate">{nextStation}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="rb-label mb-0.5">RailBuddy ETA</div>
              <div className="text-[13px] font-mono font-bold text-white tabular-nums leading-tight">
                {nextEta ?? '—'}
              </div>
            </div>
          </div>

          {/* Confidence slim line */}
          {loading ? (
            <div className="px-4 pb-3">
              <div className="rb-loading-bar h-1 rounded-full w-full" />
              <div className="text-[9px] font-mono text-slate-500 mt-1.5">
                Calculating RailBuddy prediction…
              </div>
            </div>
          ) : error ? (
            <div className="px-4 pb-3 flex items-start gap-2 text-[10.5px] font-mono text-amber-300/90">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
              <span>ETA temporarily unavailable — {error}</span>
            </div>
          ) : confidencePct !== null ? (
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-[9px] font-mono text-slate-500">
                  <BrainCircuit className="w-2.5 h-2.5 text-sky-300" />
                  RailBuddy confidence
                </span>
                <span className="text-[10px] font-mono font-bold text-sky-300 tabular-nums">
                  {confidencePct}%
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-white/6 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400/70 to-sky-300 transition-all duration-700"
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
            </div>
          ) : null}

          {/* Footer action */}
          <div className="flex items-center gap-2 px-3 pb-3 pt-1">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex-1 h-9 rounded-lg bg-sky-400/12 hover:bg-sky-400/18 border border-sky-400/20 text-sky-200 text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
            >
              <RouteIcon className="w-3.5 h-3.5" />
              View full journey
              <ArrowUpRight className="w-3 h-3 opacity-70" />
            </button>
          </div>
        </div>
      )}

      {/* ── EXPANDED JOURNEY VIEW ────────────────────────────── */}
      {expanded && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* ETA hierarchy card */}
          {mlPrediction && (
            <div className="px-4 py-3 border-b border-white/6 bg-gradient-to-br from-sky-400/[0.07] to-transparent">
              <div className="flex items-center justify-between mb-2.5">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                  <Sparkles className="w-3 h-3 text-sky-300" />
                  RailBuddy prediction
                </span>
                <span className="text-[9px] font-mono text-slate-500">
                  {modelUsed?.split('[')[0].trim() ?? 'Ensemble model'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="rb-label mb-1">RailBuddy ETA</div>
                  <div className="text-[22px] font-mono font-bold text-sky-200 tabular-nums leading-none">
                    {mlPrediction.target_eta ?? '—'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1.5">
                    Scheduled{' '}
                    <span className="text-slate-300 font-semibold">
                      {mlPrediction.scheduled_arrival ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 border-l border-white/6 pl-3">
                  <div>
                    <div className="rb-label mb-0.5">Predicted delay</div>
                    <div className={`text-[13px] font-mono font-bold tabular-nums ${tone.text}`}>
                      {mlPrediction.live_adjusted_delay != null && mlPrediction.live_adjusted_delay > 0
                        ? `+${Math.round(mlPrediction.live_adjusted_delay)}m`
                        : '0m'}
                    </div>
                  </div>
                  <div>
                    <div className="rb-label mb-0.5">Confidence</div>
                    <div className="text-[13px] font-mono font-bold text-sky-300 tabular-nums">
                      {confidencePct ?? '—'}
                      <span className="text-[9px] text-slate-500 font-normal ml-0.5">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Scroll region with timeline */}
          <div className="rb-scroll flex-1 overflow-y-auto px-4 pt-3 pb-4 min-h-0">
            <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Journey timeline
            </div>

            {/* CURRENT node */}
            <TimelineRow
              kind="current"
              stationCode={etaData?.current_station?.station_code ?? train.current_station}
              stationName={currentStation}
              scheduledTime={undefined}
              delay={null}
              meta={`${currentSpeed !== null ? `${Math.round(currentSpeed)} km/h` : ''}`.trim()}
            />

            {loading && (
              <div className="px-1 py-4">
                <div className="rb-loading-bar h-1 rounded-full w-2/3 mb-2" />
                <div className="text-[10px] font-mono text-slate-500">Resolving stops…</div>
              </div>
            )}

            {!loading && !error && timelineNodes.length === 0 && (
              <div className="px-1 py-4 text-[10.5px] font-mono text-slate-500">
                No upcoming stops available for this service.
              </div>
            )}

            {!loading &&
              timelineNodes.map((st, idx) => {
                const delay = Math.round(st.predicted_delay_minutes ?? 0);
                const isDest = Boolean(st.is_destination);
                return (
                  <TimelineRow
                    key={`${st.station_code ?? idx}-${idx}`}
                    kind={isDest ? 'destination' : idx === 0 ? 'next' : 'stop'}
                    stationCode={st.station_code}
                    stationName={st.station_name}
                    primaryTime={st.railbuddy_predicted_eta ?? undefined}
                    scheduledTime={st.scheduled_arrival ?? undefined}
                    delay={delay}
                    meta={
                      st.distance_remaining_km != null
                        ? `${Math.round(st.distance_remaining_km)} km away`
                        : undefined
                    }
                    isLast={idx === timelineNodes.length - 1}
                  />
                );
              })}
          </div>

          {/* Collapse footer */}
          <div className="px-3 py-2 border-t border-white/6 shrink-0">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="w-full h-8 rounded-lg text-[11px] font-mono text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              Collapse journey
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   Timeline row — progress connector, delay tinting, RailBuddy time
   ───────────────────────────────────────────────────────────── */
const TimelineRow: React.FC<{
  kind: 'current' | 'next' | 'stop' | 'destination';
  stationCode?: string | null;
  stationName: string;
  primaryTime?: string;
  scheduledTime?: string;
  delay?: number | null;
  meta?: string;
  isLast?: boolean;
}> = ({ kind, stationCode, stationName, primaryTime, scheduledTime, delay, meta, isLast }) => {
  const tone = delay !== null && delay !== undefined ? delayTone(delay) : delayTone(0);

  const dot =
    kind === 'current' ? (
      <span className="relative flex h-3 w-3 shrink-0">
        <span
          className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70"
          style={{ animation: 'rb-breathe 2.4s ease-in-out infinite' }}
        />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400 ring-4 ring-emerald-400/10" />
      </span>
    ) : kind === 'next' ? (
      <span className="h-3 w-3 rounded-full bg-sky-300 ring-4 ring-sky-300/12 shrink-0" />
    ) : kind === 'destination' ? (
      <span className="h-3 w-3 rounded-full border-[3px] border-amber-300/80 shrink-0" />
    ) : (
      <span className={`h-2.5 w-2.5 rounded-full ${tone.bar} opacity-70 shrink-0`} />
    );

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        {dot}
        {!isLast && <div className="rb-timeline-line flex-1 my-1" style={{ width: 2 }} aria-hidden />}
      </div>

      <div className="flex-1 min-w-0 pb-5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 min-w-0">
              {kind === 'current' && (
                <span className="text-[8.5px] font-mono font-bold uppercase tracking-wider text-emerald-300 shrink-0">
                  Current
                </span>
              )}
              {kind === 'destination' && (
                <span className="text-[8.5px] font-mono font-bold uppercase tracking-wider text-amber-300 shrink-0">
                  Destination
                </span>
              )}
              <span
                className={`text-[12px] leading-tight truncate ${
                  kind === 'current' ? 'font-semibold text-white' : 'font-medium text-slate-200'
                }`}
              >
                {stationName}
              </span>
              {stationCode && (
                <span className="text-[9px] font-mono text-slate-500 shrink-0">{stationCode}</span>
              )}
            </div>
            {meta && <div className="text-[9.5px] font-mono text-slate-600 mt-0.5">{meta}</div>}
          </div>

          <div className="text-right shrink-0">
            {primaryTime ? (
              <div className="text-[12.5px] font-mono font-bold text-white tabular-nums leading-tight">
                {primaryTime}
              </div>
            ) : (
              <div className="text-[12.5px] font-mono text-slate-500 tabular-nums">—</div>
            )}
            {scheduledTime && (
              <div className="text-[9px] font-mono text-slate-500">
                <span className="opacity-80">sched</span> {scheduledTime}
              </div>
            )}
            {delay !== null && delay !== undefined && (
              <span className={`text-[9px] font-mono font-bold ${tone.text}`}>
                {delay <= 0 ? '0m' : `+${delay}m`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};