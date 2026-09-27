'use client';

import React from 'react';
import { Navigation, Layers } from 'lucide-react';
import { Train } from '../types/train';
import { cn } from '../lib/cn';

interface TrainCardProps {
  train: Train;
  onTrackLive: (train: Train) => void;
  onOpenCoach: (train: Train) => void;
}

const DAY_CELLS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Shared origin → duration → destination strip used by both train cards. */
export const JourneyStrip: React.FC<{ train: Train }> = ({ train }) => (
  <div className="grid grid-cols-3 items-center text-center sm:text-left py-4 border-y border-[#E3E8EF] my-1">
    <div>
      <span className="text-xl sm:text-2xl font-bold font-mono text-[#101F36]">{train.departureTime}</span>
      <div className="text-xs font-medium text-[#5B6B82] mt-0.5">
        {train.sourceName}{' '}
        <span className="text-[#123A6B] font-mono font-semibold">({train.sourceCode})</span>
      </div>
    </div>

    <div className="flex flex-col items-center justify-center px-2">
      <span className="text-[11px] font-mono text-[#123A6B] font-semibold mb-1.5">{train.duration}</span>
      <div className="w-full flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[#123A6B] shrink-0" />
        <div className="h-px flex-1 bg-[#C9D8EA] relative">
          <span className="absolute -top-[3px] left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-[#E07B2C]" />
        </div>
        <span className="h-2 w-2 rounded-full bg-[#123A6B] shrink-0" />
      </div>
      <span className="text-[10px] font-medium text-[#8B99AD] mt-1.5">{train.distanceKm} km</span>
    </div>

    <div className="text-right">
      <span className="text-xl sm:text-2xl font-bold font-mono text-[#101F36]">{train.arrivalTime}</span>
      <div className="text-xs font-medium text-[#5B6B82] mt-0.5">
        {train.destinationName}{' '}
        <span className="text-[#123A6B] font-mono font-semibold">({train.destinationCode})</span>
      </div>
    </div>
  </div>
);

/** Weekday pills — highlights only the days the service actually runs. */
export const RunsOnDays: React.FC<{ train: Train }> = ({ train }) => (
  <div className="flex items-center gap-1 text-[10px] font-mono">
    <span className="text-[#5B6B82] mr-1 font-sans font-medium hidden sm:inline">Runs on:</span>
    {DAY_CELLS.map((day, i) => {
      const active = train.runsOnDays.includes(day);
      return (
        <span
          key={`${day}-${i}`}
          className={cn(
            'h-5 w-5 rounded-md flex items-center justify-center font-bold',
            active
              ? 'bg-[#EEF3F9] text-[#123A6B] border border-[#C9D8EA]'
              : 'text-[#B9C4D4] bg-[#F4F7FB]',
          )}
        >
          {day}
        </span>
      );
    })}
  </div>
);

export const TrainCard: React.FC<TrainCardProps> = ({ train, onTrackLive, onOpenCoach }) => {
  return (
    <div className="rb-card p-5 sm:p-6 transition-colors hover:border-[#C9D8EA]">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2.5 py-1 rounded-lg bg-[#F4F7FB] text-[#101F36] font-mono text-xs font-bold border border-[#E3E8EF]">
            {train.trainNumber}
          </span>
          <h3 className="font-bold text-base sm:text-lg text-[#101F36] truncate">{train.trainName}</h3>
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#EEF3F9] text-[#123A6B] border border-[#E3E8EF] shrink-0">
            {train.type}
          </span>
        </div>
        <RunsOnDays train={train} />
      </div>

      {/* Origin -> Duration -> Destination */}
      <JourneyStrip train={train} />

      {/* Live running status */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="font-semibold text-[#101F36] truncate">{train.currentStatus.statusText}</span>
        </div>
        <div className="text-[11px] font-mono text-[#8B99AD]">
          Speed {train.currentStatus.currentSpeedKmH} km/h • PF {train.currentStatus.platform}
        </div>
      </div>

      {/* Classes & actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-[#E3E8EF] mt-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {train.classes.map((cls) => (
            <div key={cls.type} className="px-3 py-1.5 rounded-lg bg-[#F4F7FB] border border-[#E3E8EF] text-left shrink-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-xs text-[#101F36]">{cls.type}</span>
                <span className="font-mono text-xs font-bold text-[#123A6B]">₹{cls.price}</span>
              </div>
              <div className="text-[10px] font-semibold text-emerald-700 mt-0.5">{cls.status}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpenCoach(train)}
            className="rb-btn rb-btn-secondary rb-btn-sm"
            title="View Coach & Seat Position"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Coaches</span>
          </button>

          <button onClick={() => onTrackLive(train)} className="rb-btn rb-btn-primary rb-btn-sm">
            <Navigation className="h-3.5 w-3.5" />
            <span>Track Live Status</span>
          </button>
        </div>
      </div>
    </div>
  );
};
