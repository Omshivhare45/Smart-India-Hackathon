'use client';

import React, { useState } from 'react';
import { Train as TrainIcon, ArrowUpRight, Volume2, Clock } from 'lucide-react';
import { TRAINS, STATIONS } from '../data/trainData';
import { Train } from '../types/train';
import { railAudio } from '../utils/audio';
import { cn } from '../lib/cn';

interface StationRadarProps {
  stationCode: string;
  onSelectTrain: (train: Train) => void;
}

export const StationRadar: React.FC<StationRadarProps> = ({ stationCode, onSelectTrain }) => {
  const [timeWindow, setTimeWindow] = useState<'2' | '4' | '8'>('4');
  const stationInfo = STATIONS.find((s) => s.code === stationCode) || STATIONS[0];

  // Find all trains passing through or originating/terminating at this station
  const stationTrains = TRAINS.filter(
    (t) =>
      t.route.some((r) => r.stationCode === stationCode) ||
      t.sourceCode === stationCode ||
      t.destinationCode === stationCode,
  );

  return (
    <div className="rb-card p-5 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E3E8EF]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-[#123A6B] text-white font-mono text-xs font-bold">
              {stationInfo.code}
            </span>
            <h3 className="text-xl sm:text-2xl font-bold text-[#101F36] tracking-tight">
              {stationInfo.name}
            </h3>
          </div>
          <p className="text-xs text-[#5B6B82] mt-1.5">
            Terminal board · arriving &amp; departing services in the next {timeWindow} hours
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#F4F7FB] border border-[#E3E8EF] rounded-lg p-1 text-xs w-fit">
          {(['2', '4', '8'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={cn(
                'px-3.5 py-1.5 rounded-md font-semibold transition-colors cursor-pointer',
                timeWindow === w ? 'bg-[#123A6B] text-white' : 'text-[#5B6B82] hover:text-[#101F36]',
              )}
            >
              Next {w}h
            </button>
          ))}
        </div>
      </div>

      {stationTrains.length === 0 ? (
        <div className="py-10 text-center text-[#5B6B82] text-sm">
          No services scheduled in this time window. Showing all major network trains below.
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {stationTrains.map((train) => {
            const stop = train.route.find((r) => r.stationCode === stationCode) || train.route[0];
            const isOrigin = train.sourceCode === stationCode;
            const isTerminus = train.destinationCode === stationCode;

            return (
              <div
                key={train.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#F7F9FC] border border-[#E3E8EF] transition-colors hover:border-[#C9D8EA] hover:bg-white"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-12 w-12 rounded-xl bg-white border border-[#E3E8EF] shadow-soft flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] uppercase font-bold text-[#8B99AD]">PF</span>
                    <span className="text-base font-bold text-[#123A6B] leading-none">
                      {stop.platform || 1}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#101F36]">{train.trainNumber}</span>
                      <span className="font-bold text-sm text-[#101F36]">{train.trainName}</span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-white border border-[#E3E8EF] text-[#5B6B82]">
                        {train.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#5B6B82] mt-1 font-medium flex-wrap">
                      <span>{train.sourceName}</span>
                      <span className="text-[#C9D8EA]">→</span>
                      <span>{train.destinationName}</span>
                      <span className="text-[#C9D8EA]">•</span>
                      <span className="font-mono text-emerald-700 font-semibold">
                        {isOrigin ? 'Originating' : isTerminus ? 'Terminating' : `${stop.haltMinutes}m halt`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-5">
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Clock className="h-3.5 w-3.5 text-[#8B99AD]" />
                      <span className="text-base font-bold font-mono text-[#101F36]">
                        {stop.scheduledArrival}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'block text-[11px] font-semibold',
                        stop.delayMinutes === 0 ? 'text-emerald-700' : 'text-amber-700',
                      )}
                    >
                      {stop.delayMinutes === 0 ? 'On Time' : `+${stop.delayMinutes}m delay`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        railAudio.speakAnnouncement(
                          train.trainNumber,
                          train.trainName,
                          stationInfo.name,
                          stop.platform,
                        )
                      }
                      className="h-9 w-9 rounded-lg bg-white hover:bg-[#EEF3F9] text-[#5B6B82] hover:text-[#123A6B] border border-[#E3E8EF] flex items-center justify-center cursor-pointer"
                      title="Play station announcement"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => onSelectTrain(train)}
                      className="rb-btn rb-btn-primary rb-btn-sm"
                    >
                      <TrainIcon className="h-3.5 w-3.5" />
                      <span>Track</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
