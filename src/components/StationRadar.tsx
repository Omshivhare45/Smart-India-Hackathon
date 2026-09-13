'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Radio, Train as TrainIcon, Clock, ArrowUpRight, Volume2, ShieldCheck, MapPin } from 'lucide-react';
import { TRAINS, STATIONS } from '../data/trainData';
import { Train } from '../types/train';
import { railAudio } from '../utils/audio';

interface StationRadarProps {
  stationCode: string;
  onSelectTrain: (train: Train) => void;
}

export const StationRadar: React.FC<StationRadarProps> = ({ stationCode, onSelectTrain }) => {
  const [timeWindow, setTimeWindow] = useState<'2' | '4' | '8'>('4');
  const stationInfo = STATIONS.find((s) => s.code === stationCode) || STATIONS[0];

  // Find all trains passing through or originating/terminating at this station
  const stationTrains = TRAINS.filter((t) =>
    t.route.some((r) => r.stationCode === stationCode) ||
    t.sourceCode === stationCode ||
    t.destinationCode === stationCode
  );

  const handlePlayStationChime = (train: Train, platform: number | string) => {
    railAudio.speakAnnouncement(train.trainNumber, train.trainName, stationInfo.name, platform);
  };

  return (
    <div className="bg-[#FFFFFF] rounded-3xl p-6 sm:p-8 shadow-soft border border-[#E2E8F0] relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-[#1D4ED8] text-white font-mono text-xs font-bold shadow-orange-glow">
              {stationInfo.code}
            </span>
            <h3 className="text-xl sm:text-2xl font-black text-[#13213E]">
              {stationInfo.name} Live Terminal Board
            </h3>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Real-time platform board, arriving & departing services in next {timeWindow} hours
          </p>
        </div>

        {/* Time Window Tabs */}
        <div className="flex items-center gap-1 bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl p-1 text-xs">
          {(['2', '4', '8'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all ${
                timeWindow === w
                  ? 'bg-[#1D4ED8] text-white shadow-orange-glow'
                  : 'text-[#64748B] hover:text-[#13213E]'
              }`}
            >
              Next {w}h
            </button>
          ))}
        </div>
      </div>

      {/* Train Radar Table / Cards */}
      {stationTrains.length === 0 ? (
        <div className="text-center py-12 text-[#64748B] text-sm">
          No services scheduled in this time window. Showing all major network trains below.
        </div>
      ) : (
        <div className="space-y-3">
          {stationTrains.map((train) => {
            const stop = train.route.find((r) => r.stationCode === stationCode) || train.route[0];
            const isOrigin = train.sourceCode === stationCode;
            const isTerminus = train.destinationCode === stationCode;

            return (
              <motion.div
                key={train.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#F1F5F9] hover:bg-[#EEF4FC] border border-[#E2E8F0] hover:border-[#1D4ED8]/40 transition-all group"
              >
                <div className="flex items-center gap-4">
                  {/* Platform Indicator */}
                  <div className="w-12 h-12 rounded-2xl bg-[#FFFFFF] border border-[#E2E8F0] shadow-xs flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] uppercase font-bold text-[#64748B]">PF</span>
                    <span className="text-base font-black text-[#1D4ED8] leading-none">
                      {stop.platform || 1}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#13213E]">
                        {train.trainNumber}
                      </span>
                      <h4 className="font-bold text-sm text-[#13213E] group-hover:text-[#1D4ED8] transition-colors">
                        {train.trainName}
                      </h4>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-[#FFFFFF] border border-[#E2E8F0] text-[#64748B]">
                        {train.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#64748B] mt-1 font-medium">
                      <span>{train.sourceName}</span>
                      <span>➔</span>
                      <span>{train.destinationName}</span>
                      <span className="text-[#D6E0EC]">•</span>
                      <span className="font-mono text-emerald-600 font-bold">
                        {isOrigin ? 'Originating' : isTerminus ? 'Terminating' : `${stop.haltMinutes}m halt`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Times & Action */}
                <div className="flex items-center justify-between sm:justify-end gap-5">
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-[#64748B]">ETA</span>
                      <span className="text-base font-black font-mono text-[#13213E]">
                        {stop.scheduledArrival}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600 block">
                      {stop.delayMinutes === 0 ? 'On Time' : `+${stop.delayMinutes}m delay`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePlayStationChime(train, stop.platform)}
                      className="p-2 rounded-xl bg-[#FFFFFF] hover:bg-[#EEF4FC] text-[#64748B] hover:text-[#1D4ED8] border border-[#E2E8F0] shadow-xs transition-colors"
                      title="Play Station Audio Announcement"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onSelectTrain(train)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-bold shadow-orange-glow transition-all flex items-center gap-1"
                    >
                      <span>Track</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
