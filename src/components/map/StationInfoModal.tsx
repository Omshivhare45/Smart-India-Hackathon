'use client';

import React from 'react';
import {
  X,
  Landmark,
  Layers,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Train as TrainIcon,
  ChevronRight,
} from 'lucide-react';
import { StationDetailResponse, MapLiveTrain } from '../../lib/api';

interface StationInfoModalProps {
  stationData: StationDetailResponse['station'] | null;
  loading: boolean;
  onClose: () => void;
  onSelectTrain: (train: MapLiveTrain) => void;
}

export const StationInfoModal: React.FC<StationInfoModalProps> = ({
  stationData,
  loading,
  onClose,
  onSelectTrain,
}) => {
  if (!stationData && !loading) return null;

  const congestionTone =
    stationData?.congestion === 'Critical'
      ? 'text-rose-300 bg-rose-400/10 border-rose-400/20'
      : stationData?.congestion === 'Congested'
      ? 'text-orange-300 bg-orange-400/10 border-orange-400/20'
      : stationData?.congestion === 'Busy'
      ? 'text-amber-300 bg-amber-400/10 border-amber-400/20'
      : stationData?.congestion === 'Moderate'
      ? 'text-amber-300 bg-amber-400/10 border-amber-400/20'
      : 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20';

  const arriving = stationData?.arriving_trains ?? [];

  return (
    <div className="rb-surface-strong w-[min(19rem,calc(100vw-2rem))] pointer-events-auto rounded-xl overflow-hidden text-slate-200 font-sans rb-anim-fade-up">
      {/* Header */}
      <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300 shrink-0">
            <Landmark className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[12px] font-bold text-emerald-300">
                {stationData?.code || 'STN'}
              </span>
              {stationData?.zone && (
                <span className="text-[8.5px] font-mono font-semibold px-1.5 py-px rounded bg-white/6 text-slate-500 uppercase tracking-wide">
                  {stationData.zone}
                </span>
              )}
            </div>
            <h3 className="text-[13px] font-semibold text-white leading-snug truncate">
              {stationData?.name || 'Loading station…'}
            </h3>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Close station card"
          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/6 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="px-4 pb-4">
          <div className="rb-loading-bar h-1 rounded-full w-full mb-2" />
          <div className="text-[10px] font-mono text-slate-500">Fetching live station telemetry…</div>
        </div>
      ) : stationData ? (
        <div className="px-4 pb-4 space-y-3">
          {/* Activity */}
          <div className="flex items-center gap-1.5">
            <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded border ${congestionTone}`}>
              {stationData.congestion}
            </span>
            <span className="text-[9.5px] font-mono text-slate-500">activity</span>
          </div>

          {/* Quick metrics */}
          <div className="grid grid-cols-3 gap-1.5">
            <MetricCell icon={<Layers className="w-3 h-3 text-slate-400" />} label="Platforms" value={stationData.platforms} />
            <MetricCell icon={<ArrowDownLeft className="w-3 h-3 text-sky-300" />} label="Arrivals" value={arriving.length} />
            <MetricCell icon={<ArrowUpRight className="w-3 h-3 text-slate-400" />} label="Departures" value={stationData.departing_trains?.length ?? 0} />
          </div>

          {/* Inbound trains */}
          {arriving.length > 0 ? (
            <div>
              <div className="rb-label mb-1.5 flex items-center gap-1">
                <Activity className="w-2.5 h-2.5" />
                Inbound now
              </div>
              <div className="space-y-1">
                {arriving.slice(0, 3).map((t) => (
                  <button
                    key={t.train_number}
                    onClick={() => onSelectTrain(t)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 border border-white/6 bg-white/1 hover:bg-white/5 text-left transition-colors"
                  >
                    <span className="flex items-center justify-center w-6 h-6 rounded bg-sky-400/10 border border-sky-400/15 text-sky-300 shrink-0">
                      <TrainIcon className="w-3 h-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[10.5px] font-bold text-sky-200">
                          {t.train_number}
                        </span>
                        <span className="text-[10.5px] text-slate-200 truncate">{t.train_name}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 block truncate">
                        {t.speed !== null ? `${Math.round(t.speed)} km/h` : 'Running'} • {t.current_station_name || t.current_station || 'en route'}
                      </span>
                    </span>
                    <span
                      className={`text-[9px] font-mono font-bold px-1 py-px rounded border shrink-0 ${
                        t.delay_minutes <= 0
                          ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20'
                          : 'bg-amber-400/10 text-amber-300 border-amber-400/20'
                      }`}
                    >
                      {t.delay_minutes <= 0 ? 'ON TIME' : `+${Math.round(t.delay_minutes)}m`}
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-white/6 bg-white/1 px-3 py-2.5 text-center">
              <p className="text-[10.5px] font-mono text-slate-500">
                No inbound services within 50 km radius
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

const MetricCell: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
}> = ({ icon, label, value }) => (
  <div className="rounded-lg border border-white/6 bg-white/1 px-2 py-1.5">
    <div className="flex items-center gap-1 text-[8.5px] font-mono text-slate-500 uppercase tracking-wider">
      {icon}
      <span>{label}</span>
    </div>
    <div className="text-[13px] font-mono font-bold text-slate-100 tabular-nums mt-0.5">{value}</div>
  </div>
);