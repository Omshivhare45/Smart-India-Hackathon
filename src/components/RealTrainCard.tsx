'use client';

import React from 'react';
import { ArrowRight, Navigation, Layers, Radio, CalendarDays } from 'lucide-react';
import { Train } from '../types/train';
import { cn } from '../lib/cn';

const DAY_CELLS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface RealTrainCardProps {
  train: Train;
  onTrackLive: (train: Train) => void;
  onOpenCoach: (train: Train) => void;
}

export const RealTrainCard: React.FC<RealTrainCardProps> = ({ train, onTrackLive, onOpenCoach }) => {
  const delay = train.currentStatus.delayMinutes || 0;
  const isLate = delay > 5;
  const liveType = (
    train.currentStatus.statusText.toLowerCase().includes('cancelled')
      ? 'cancelled'
      : train.currentStatus.statusText.toLowerCase().includes('running from')
      ? 'running'
      : train.currentStatus.statusText.toLowerCase().includes('completed')
      ? 'completed'
      : 'scheduled'
  );

  return (
    <div className="bg-[#FFFFFF] rounded-none p-5 sm:p-6 shadow-soft border border-[#E2E8F0] hover:border-[#1D4ED8]/40 relative overflow-hidden">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-3 py-1 rounded-none bg-[#F1F5F9] text-[#13213E] font-mono text-xs font-bold border border-[#E2E8F0]">
            {train.trainNumber}
          </span>
          <h3 className="font-bold text-base sm:text-lg text-[#13213E] truncate">{train.trainName}</h3>
          <span className="px-2.5 py-0.5 rounded-none text-[10px] font-extrabold uppercase tracking-wider bg-[#EEF4FC] text-[#1D4ED8] border border-[#1D4ED8]/20 shrink-0">
            {train.type}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-none bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
            <Radio className="w-3 h-3" />
            RailRadar Live
          </span>
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className="text-[#64748B] mr-1 font-sans font-medium hidden sm:inline">Runs on:</span>
            {DAY_CELLS.map((day, i) => {
              const active = train.runsOnDays.includes(day);
              return (
                <span
                  key={i}
                  className={cn(
                    'w-5 h-5 rounded-none flex items-center justify-center font-bold',
                    active
                      ? 'bg-[#1D4ED8]/10 text-[#1D4ED8] border border-[#1D4ED8]/30'
                      : 'text-[#7C8DA8] bg-[#F1F5F9]',
                  )}
                >
                  {day}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Origin -> Duration -> Destination Bar */}
      <div className="grid grid-cols-3 items-center text-center sm:text-left py-3 border-y border-[#E2E8F0] my-2">
        <div>
          <span className="text-xl sm:text-2xl font-black font-mono text-[#13213E]">{train.departureTime}</span>
          <div className="text-xs font-semibold text-[#64748B] mt-0.5">
            {train.sourceName} <span className="text-[#1D4ED8] font-mono">({train.sourceCode})</span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-2">
          <span className="text-[11px] font-mono text-[#1D4ED8] font-bold mb-1">{train.duration}</span>
          <div className="w-full flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-none bg-[#2563EB] shrink-0" />
            <div className="h-[2px] flex-1 bg-[#1D4ED8] relative">
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-none bg-[#1D4ED8]" />
            </div>
            <span className="w-2.5 h-2.5 rounded-none bg-[#1D4ED8] shrink-0" />
          </div>
          <span className="text-[10px] font-medium text-[#64748B] mt-1">{train.distanceKm} km</span>
        </div>

        <div className="text-right">
          <span className="text-xl sm:text-2xl font-black font-mono text-[#13213E]">{train.arrivalTime}</span>
          <div className="text-xs font-semibold text-[#64748B] mt-0.5">
            {train.destinationName} <span className="text-[#1D4ED8] font-mono">({train.destinationCode})</span>
          </div>
        </div>
      </div>

      {/* Real-time running status (schedule + live delay from RailRadar) */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none border text-[10px] font-black uppercase tracking-wider',
              liveType === 'cancelled'
                ? 'bg-rose-500/10 text-rose-700 border-rose-500/30'
                : liveType === 'running'
                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                : liveType === 'completed'
                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                : 'bg-[#EEF4FC] text-[#1D4ED8] border-[#1D4ED8]/25',
            )}
          >
            {liveType === 'running'
              ? isLate
                ? `Late ${delay} min`
                : 'On Time'
              : liveType}
          </span>
          <span className="font-semibold text-[#13213E]">{train.currentStatus.statusText}</span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#64748B]">
          <CalendarDays className="w-3 h-3" />
          Schedule day {train.route[0]?.day || 1} → day {train.route[1]?.day || 1}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 pt-3 border-t border-[#E2E8F0] mt-1">
        <button
          onClick={() => onOpenCoach(train)}
          className="px-3.5 py-2.5 rounded-none bg-[#F1F5F9] hover:bg-[#EEF4FC] text-[#13213E] hover:text-[#1D4ED8] border border-[#E2E8F0] text-xs font-bold shadow-xs flex items-center gap-1.5"
          title="View Coach & Seat Position"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Coaches</span>
        </button>

        <span className="text-[11px] text-[#7C8DA8] font-mono hidden md:inline">
          {train.trainNumber} · {train.departureTime} → {train.arrivalTime}
        </span>

        <button
          onClick={() => onTrackLive(train)}
          className="ml-auto px-4 py-2.5 rounded-none bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Track Live Status</span>
          <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
        </button>
      </div>
    </div>
  );
};