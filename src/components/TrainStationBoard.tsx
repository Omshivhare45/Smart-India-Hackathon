'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Clock, MapPin } from 'lucide-react';
import { Train, RouteStation } from '../types/train';
import { getDirectionPair } from '../data/trainData';
import { cn } from '../lib/cn';

interface TrainStationBoardProps {
  train: Train;
  onSelectDirection: (train: Train) => void;
}

function StationTable({ train }: { train: Train }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[540px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[#5B6B82] border-b border-[#E3E8EF]">
            <th className="py-2.5 pr-3 font-semibold">Station</th>
            <th className="py-2.5 px-2 font-semibold">Arr</th>
            <th className="py-2.5 px-2 font-semibold">Dep</th>
            <th className="py-2.5 px-2 font-semibold">Halt</th>
            <th className="py-2.5 px-2 font-semibold">PF</th>
            <th className="py-2.5 pl-2 font-semibold text-right">Km</th>
          </tr>
        </thead>
        <tbody>
          {train.route.map((stop: RouteStation, idx) => {
            const isOrigin = idx === 0;
            const isTerminus = idx === train.route.length - 1;
            return (
              <tr
                key={`${train.trainNumber}-${stop.stationCode}-${idx}`}
                className="border-b border-[#F0F3F8] last:border-0 text-sm transition-colors hover:bg-[#F7F9FC]"
              >
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-[#F4F7FB] border border-[#E3E8EF] text-[#101F36]">
                      {stop.stationCode}
                    </span>
                    <div>
                      <div className="font-semibold text-[#101F36] text-xs sm:text-sm">{stop.stationName}</div>
                      <div className="text-[10px] text-[#8B99AD]">
                        Day {stop.day}
                        {isOrigin ? ' • Origin' : isTerminus ? ' • Terminus' : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-2 font-mono text-xs font-semibold text-[#101F36]">
                  {stop.scheduledArrival}
                </td>
                <td className="py-3 px-2 font-mono text-xs font-semibold text-[#101F36]">
                  {stop.scheduledDeparture}
                </td>
                <td className="py-3 px-2 text-xs text-[#5B6B82]">{stop.haltMinutes ? `${stop.haltMinutes} min` : '—'}</td>
                <td className="py-3 px-2">
                  <span className="inline-flex items-center justify-center min-w-7 px-1.5 py-0.5 rounded-md bg-[#EEF3F9] text-[#123A6B] text-xs font-bold">
                    {stop.platform}
                  </span>
                </td>
                <td className="py-3 pl-2 text-right font-mono text-xs font-semibold text-[#5B6B82]">
                  {stop.distanceKm}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const TrainStationBoard: React.FC<TrainStationBoardProps> = ({ train, onSelectDirection }) => {
  const { down, up } = useMemo(() => getDirectionPair(train), [train]);
  const hasPair = down.id !== up.id;
  const [mobileDir, setMobileDir] = useState<'DOWN' | 'UP'>(train.direction);

  const active = mobileDir === 'UP' ? up : down;

  if (train.route.length === 0) {
    return (
      <div className="rb-card p-6">
        <div className="flex items-center gap-2.5">
          <MapPin className="h-5 w-5 text-[#123A6B]" />
          <h3 className="text-lg font-bold text-[#101F36]">Timetable</h3>
        </div>
        <p className="mt-3 rounded-lg bg-[#F4F7FB] border border-dashed border-[#CFD8E4] px-3 py-3 text-xs text-[#5B6B82]">
          The provider has not published a halt list for {train.trainNumber} yet. The live station
          timeline above is served straight from the NTES feed.
        </p>
      </div>
    );
  }

  return (
    <div className="rb-card p-5 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[#E3E8EF]">
        <div>
          <span className="rb-eyebrow">Timetable</span>
          <h3 className="mt-1.5 text-lg font-bold text-[#101F36] flex items-center gap-2">
            <MapPin className="h-4.5 w-4.5 text-[#123A6B]" />
            Station-wise schedule
          </h3>
          <p className="text-xs text-[#5B6B82] mt-1">
            Arrival, departure, halt and platform for every stop on this service
          </p>
        </div>
        {hasPair && (
          <div className="flex items-center gap-2 text-xs font-semibold text-[#5B6B82]">
            <ArrowLeftRight className="h-4 w-4 text-[#123A6B]" />
            {down.trainNumber} ⇄ {up.trainNumber}
          </div>
        )}
      </div>

      {hasPair ? (
        <>
          <div className="lg:hidden flex gap-1.5 p-1 bg-[#F4F7FB] rounded-lg border border-[#E3E8EF] mt-5">
            {(['DOWN', 'UP'] as const).map((dir) => {
              const t = dir === 'DOWN' ? down : up;
              return (
                <button
                  key={dir}
                  onClick={() => {
                    setMobileDir(dir);
                    onSelectDirection(t);
                  }}
                  className={cn(
                    'flex-1 py-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer',
                    mobileDir === dir
                      ? 'bg-white text-[#101F36] shadow-soft border border-[#E3E8EF]'
                      : 'text-[#5B6B82]',
                  )}
                >
                  {dir} · {t.trainNumber}
                </button>
              );
            })}
          </div>

          <div className="lg:hidden mt-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[#101F36]">
                {active.trainNumber} {active.trainName}
              </span>
              <span className="text-xs text-[#5B6B82]">
                {active.sourceCode} → {active.destinationCode}
              </span>
            </div>
            <StationTable train={active} />
          </div>

          <div className="hidden lg:grid grid-cols-2 gap-6 mt-5">
            {[
              { label: 'DOWN', t: down },
              { label: 'UP', t: up },
            ].map(({ label, t }) => (
              <div
                key={t.id}
                className={cn(
                  'rounded-xl border p-4',
                  train.id === t.id ? 'border-[#C9D8EA] bg-[#F7F9FC]' : 'border-[#E3E8EF] bg-white',
                )}
              >
                <button
                  onClick={() => onSelectDirection(t)}
                  className="w-full flex items-center justify-between mb-4 text-left cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#123A6B]">
                        {label}
                      </span>
                      <span className="font-mono text-sm font-bold text-[#101F36]">{t.trainNumber}</span>
                    </div>
                    <div className="text-xs text-[#5B6B82] mt-0.5">
                      {t.sourceName} → {t.destinationName}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-semibold flex items-center gap-1 text-[#5B6B82]">
                    <Clock className="h-3.5 w-3.5 text-[#123A6B]" />
                    {t.departureTime}
                  </span>
                </button>
                <StationTable train={t} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5">
          <StationTable train={train} />
        </div>
      )}
    </div>
  );
};
