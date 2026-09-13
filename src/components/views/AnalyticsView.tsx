'use client';

import React, { useMemo } from 'react';
import { BarChart3, PieChart, TrendingUp, Train as TrainIcon, Gauge, Clock, ArrowRight } from 'lucide-react';
import DashboardCard from '../layout/DashboardCard';
import { TRAINS } from '../../data/trainData';
import { cn } from '../../lib/cn';

interface AnalyticsViewProps {
  onNavigate: (key: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ onNavigate }) => {
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    TRAINS.forEach((t) => map.set(t.type, (map.get(t.type) || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  const maxTypeCount = Math.max(...byType.map(([, n]) => n), 1);

  const byDelay = useMemo(() => {
    return [...TRAINS]
      .sort((a, b) => b.currentStatus.delayMinutes - a.currentStatus.delayMinutes)
      .map((t) => ({
        train: t,
        delay: t.currentStatus.delayMinutes,
      }));
  }, []);

  const maxDelay = Math.max(...byDelay.map((d) => d.delay), 1);

  const onTime = TRAINS.filter((t) => t.currentStatus.delayMinutes === 0).length;
  const delayed = TRAINS.length - onTime;
  const avgDelay = TRAINS.reduce((a, t) => a + t.currentStatus.delayMinutes, 0) / TRAINS.length;
  const totalDistance = TRAINS.reduce((a, t) => a + t.distanceKm, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-[#13213E] tracking-tight">Network Analytics</h2>
        <p className="text-sm text-[#64748B] mt-1">
          Computed live from the tracked service dataset and ML model telemetry.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard className="p-5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#7C8DA8]">Services tracked</span>
          <div className="mt-1 font-mono text-3xl font-black text-[#13213E]">{TRAINS.length}</div>
        </DashboardCard>
        <DashboardCard className="p-5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#7C8DA8]">On time</span>
          <div className="mt-1 font-mono text-3xl font-black text-emerald-700">{onTime}</div>
          <div className="text-[11px] text-[#64748B]">of {TRAINS.length} services</div>
        </DashboardCard>
        <DashboardCard className="p-5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#7C8DA8]">Running late</span>
          <div className="mt-1 font-mono text-3xl font-black text-amber-700">{delayed}</div>
          <div className="text-[11px] text-[#64748B]">avg delay {avgDelay.toFixed(1)} min</div>
        </DashboardCard>
        <DashboardCard className="p-5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#7C8DA8]">Coverage</span>
          <div className="mt-1 font-mono text-3xl font-black text-[#2563EB]">{totalDistance.toLocaleString()} km</div>
          <div className="text-[11px] text-[#64748B]">combined route distance</div>
        </DashboardCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Delay ranking */}
        <DashboardCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#D97706]/15 text-[#D97706] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-[#13213E]">Current delay ranking</h3>
          </div>
          <div className="space-y-3">
            {byDelay.map(({ train, delay }) => (
              <div key={train.id} className="flex items-center gap-3">
                <span className="w-16 shrink-0 font-mono text-xs font-bold text-[#64748B]">{train.trainNumber}</span>
                <div className="flex-1 h-2.5 rounded-full bg-[#E2E8F0] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(4, (delay / maxDelay) * 100)}%`,
                      backgroundColor: delay === 0 ? '#059669' : delay <= 10 ? '#F59E0B' : '#1D4ED8',
                    }}
                  />
                </div>
                <span className={cn('w-14 shrink-0 text-right font-mono text-xs font-black', delay === 0 ? 'text-emerald-700' : 'text-amber-700')}>
                  {delay}m
                </span>
              </div>
            ))}
          </div>
        </DashboardCard>

        {/* Services by type */}
        <DashboardCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#2563EB]/15 text-[#2563EB] flex items-center justify-center">
              <PieChart className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-[#13213E]">Services by train type</h3>
          </div>
          <div className="space-y-3">
            {byType.map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs font-bold text-[#64748B]">{type}</span>
                <div className="flex-1 h-3 rounded-full bg-[#E2E8F0] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#2563EB] transition-all duration-700"
                    style={{ width: `${(count / maxTypeCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-xs font-black text-[#13213E]">{count}</span>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>

      {/* On-time / delayed breakdown */}
      <DashboardCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#059669]/15 text-[#059669] flex items-center justify-center">
            <Gauge className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-[#13213E]">On-time performance breakdown</h3>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-xs font-bold mb-1.5">
              <span className="text-emerald-700">On time</span>
              <span className="text-[#64748B] font-mono">{Math.round((onTime / TRAINS.length) * 100)}%</span>
            </div>
            <div className="h-3 rounded-full bg-[#E2E8F0] overflow-hidden flex">
              <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${(onTime / TRAINS.length) * 100}%` }} />
              <div className="h-full bg-amber-400/80 transition-all duration-700" style={{ width: `${(delayed / TRAINS.length) * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs font-bold mt-1.5">
              <span className="text-[#64748B]">0 min</span>
              <span className="text-amber-700">{delayed} delayed</span>
            </div>
          </div>
          <div className="w-28 shrink-0 text-center rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] py-3">
            <TrendingUp className="w-4 h-4 text-[#2563EB] mx-auto" />
            <div className="font-mono text-lg font-black text-[#13213E] mt-1">
              {Math.round((onTime / TRAINS.length) * 100)}%
            </div>
            <div className="text-[10px] text-[#7C8DA8]">punctual</div>
          </div>
        </div>
      </DashboardCard>

      <div className="flex items-center justify-center">
        <button
          onClick={() => onNavigate('live')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border border-[#2563EB]/30 bg-[#2563EB]/10 text-[#1D4ED8] hover:bg-[#2563EB]/20 transition-all"
        >
          <TrainIcon className="w-4 h-4" />
          Go to live tracking
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};