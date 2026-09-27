'use client';

import React from 'react';
import { Navigation, Layers, Radio, CalendarDays, ArrowRight } from 'lucide-react';
import { Train } from '../types/train';
import { cn } from '../lib/cn';
import { JourneyStrip, RunsOnDays } from './TrainCard';

interface RealTrainCardProps {
  train: Train;
  onTrackLive: (train: Train) => void;
  onOpenCoach: (train: Train) => void;
}

/** Live-running badge derived from the RailRadar status text already on the train. */
function statusBadge(statusText: string) {
  const text = statusText.toLowerCase();
  if (text.includes('cancelled')) return { label: 'Cancelled', tone: 'danger' as const };
  if (text.includes('completed')) return { label: 'Completed', tone: 'success' as const };
  if (text.includes('running from')) return { label: 'Running', tone: 'success' as const };
  return { label: 'Scheduled', tone: 'info' as const };
}

export const RealTrainCard: React.FC<RealTrainCardProps> = ({ train, onTrackLive, onOpenCoach }) => {
  const delay = train.currentStatus.delayMinutes || 0;
  const isLate = delay > 5;
  const badge = statusBadge(train.currentStatus.statusText);
  const badgeLabel =
    badge.label === 'Running' ? (isLate ? `Late ${delay} min` : 'On Time') : badge.label;

  const toneClass = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-[#EEF3F9] text-[#123A6B] border-[#C9D8EA]',
  }[badge.tone];

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

        <div className="flex items-center gap-3">
          <span className="rb-pill border-emerald-200 bg-emerald-50 text-emerald-700">
            <Radio className="h-3 w-3" />
            RailRadar Live
          </span>
          <RunsOnDays train={train} />
        </div>
      </div>

      {/* Origin -> Duration -> Destination */}
      <JourneyStrip train={train} />

      {/* Real-time running status (schedule + live delay from RailRadar) */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider',
              toneClass,
            )}
          >
            {badgeLabel}
          </span>
          <span className="font-medium text-[#101F36]">{train.currentStatus.statusText}</span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8B99AD]">
          <CalendarDays className="h-3 w-3" />
          Day {train.route[0]?.day || 1} → {train.route[1]?.day || 1}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-[#E3E8EF] mt-2">
        <button
          onClick={() => onOpenCoach(train)}
          className="rb-btn rb-btn-secondary rb-btn-sm"
          title="View Coach & Seat Position"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Coaches</span>
        </button>

        <span className="text-[11px] text-[#8B99AD] font-mono hidden md:inline">
          {train.trainNumber} · {train.departureTime} → {train.arrivalTime}
        </span>

        <button onClick={() => onTrackLive(train)} className="rb-btn rb-btn-primary rb-btn-sm ml-auto">
          <Navigation className="h-3.5 w-3.5" />
          <span>Track Live Status</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
