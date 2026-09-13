'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Navigation, Radio, Layers, CheckCircle2 } from 'lucide-react';
import { Train } from '../types/train';

interface TrainCardProps {
  train: Train;
  onTrackLive: (train: Train) => void;
  onOpenCoach: (train: Train) => void;
}

export const TrainCard: React.FC<TrainCardProps> = ({ train, onTrackLive, onOpenCoach }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className="bg-[#FFFFFF] rounded-3xl p-5 sm:p-6 shadow-soft hover:shadow-card-hover border border-[#E2E8F0] hover:border-[#1D4ED8]/40 transition-all relative overflow-hidden group"
    >
      {/* Top subtle hover glow */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#1D4ED8]/0 group-hover:via-[#1D4ED8] to-transparent transition-all duration-300" />

      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="px-3 py-1 rounded-xl bg-[#F1F5F9] text-[#13213E] font-mono text-xs font-bold border border-[#E2E8F0]">
            {train.trainNumber}
          </span>
          <h3 className="font-bold text-base sm:text-lg text-[#13213E] group-hover:text-[#1D4ED8] transition-colors">
            {train.trainName}
          </h3>
          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-[#EEF4FC] text-[#1D4ED8] border border-[#1D4ED8]/20">
            {train.type}
          </span>
        </div>

        {/* Operating Days */}
        <div className="flex items-center gap-1 text-[10px] font-mono">
          <span className="text-[#64748B] mr-1 font-sans font-medium">Runs on:</span>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
            const active = train.runsOnDays.includes(day);
            return (
              <span
                key={i}
                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold ${
                  active
                    ? 'bg-[#1D4ED8]/10 text-[#1D4ED8] border border-[#1D4ED8]/30'
                    : 'text-[#7C8DA8] bg-[#F1F5F9]'
                }`}
              >
                {day}
              </span>
            );
          })}
        </div>
      </div>

      {/* Origin -> Duration -> Destination Bar */}
      <div className="grid grid-cols-3 items-center text-center sm:text-left py-3 border-y border-[#E2E8F0] my-2">
        {/* Departure */}
        <div>
          <span className="text-xl sm:text-2xl font-black font-mono text-[#13213E]">
            {train.departureTime}
          </span>
          <div className="text-xs font-semibold text-[#64748B] mt-0.5">
            {train.sourceName} <span className="text-[#1D4ED8] font-mono">({train.sourceCode})</span>
          </div>
        </div>

        {/* Duration Track Icon */}
        <div className="flex flex-col items-center justify-center px-2">
          <span className="text-[11px] font-mono text-[#1D4ED8] font-bold mb-1">
            {train.duration}
          </span>
          <div className="w-full flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] shrink-0" />
            <div className="h-[2px] flex-1 bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-[#1D4ED8] relative">
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#1D4ED8] animate-ping" />
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8] shrink-0" />
          </div>
          <span className="text-[10px] font-medium text-[#64748B] mt-1">{train.distanceKm} km</span>
        </div>

        {/* Arrival */}
        <div className="text-right">
          <span className="text-xl sm:text-2xl font-black font-mono text-[#13213E]">
            {train.arrivalTime}
          </span>
          <div className="text-xs font-semibold text-[#64748B] mt-0.5">
            {train.destinationName} <span className="text-[#1D4ED8] font-mono">({train.destinationCode})</span>
          </div>
        </div>
      </div>

      {/* Live Running Telemetry Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500/100"></span>
          </div>
          <span className="font-semibold text-[#13213E]">
            {train.currentStatus.statusText}
          </span>
          <span className="text-[#7C8DA8] hidden sm:inline">•</span>
          <span className="text-[11px] text-[#64748B] hidden sm:inline">
            Speed: {train.currentStatus.currentSpeedKmH} km/h • Platform {train.currentStatus.platform}
          </span>
        </div>

        <div className="text-[11px] font-mono text-[#64748B]">
          ISRO NavIC • Live
        </div>
      </div>

      {/* Available Classes Row & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#E2E8F0] mt-1">
        {/* Classes and Availability */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {train.classes.map((cls) => (
            <div
              key={cls.type}
              className="px-3 py-1.5 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0] text-left shrink-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs text-[#13213E]">{cls.type}</span>
                <span className="font-mono text-xs font-bold text-[#1D4ED8]">₹{cls.price}</span>
              </div>
              <div className="text-[10px] font-bold text-emerald-600 mt-0.5">
                {cls.status}
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpenCoach(train)}
            className="px-3.5 py-2.5 rounded-xl bg-[#F1F5F9] hover:bg-[#EEF4FC] text-[#13213E] hover:text-[#1D4ED8] border border-[#E2E8F0] text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            title="View Coach & Seat Position"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Coaches</span>
          </button>

          <button
            onClick={() => onTrackLive(train)}
            className="px-4 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-bold transition-all shadow-orange-glow flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Track Live Status</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
