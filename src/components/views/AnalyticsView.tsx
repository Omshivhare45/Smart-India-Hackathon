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
 <h2 className="text-2xl font-black text-[#101F36] tracking-tight">Network Analytics</h2>
 <p className="text-sm text-[#5B6B82] mt-1">
 Computed live from the tracked service dataset and ML model telemetry.
 </p>
 </div>

 {/* Summary strip */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
 <DashboardCard className="p-5">
 <span className="text-[10px] uppercase font-bold tracking-wider text-[#8B99AD]">Services tracked</span>
 <div className="mt-1 font-mono text-3xl font-black text-[#101F36]">{TRAINS.length}</div>
 </DashboardCard>
 <DashboardCard className="p-5">
 <span className="text-[10px] uppercase font-bold tracking-wider text-[#8B99AD]">On time</span>
 <div className="mt-1 font-mono text-3xl font-black text-emerald-700">{onTime}</div>
 <div className="text-[11px] text-[#5B6B82]">of {TRAINS.length} services</div>
 </DashboardCard>
 <DashboardCard className="p-5">
 <span className="text-[10px] uppercase font-bold tracking-wider text-[#8B99AD]">Running late</span>
 <div className="mt-1 font-mono text-3xl font-black text-amber-700">{delayed}</div>
 <div className="text-[11px] text-[#5B6B82]">avg delay {avgDelay.toFixed(1)} min</div>
 </DashboardCard>
 <DashboardCard className="p-5">
 <span className="text-[10px] uppercase font-bold tracking-wider text-[#8B99AD]">Coverage</span>
 <div className="mt-1 font-mono text-3xl font-black text-[#1C4E8F]">{totalDistance.toLocaleString()} km</div>
 <div className="text-[11px] text-[#5B6B82]">combined route distance</div>
 </DashboardCard>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* Delay ranking */}
 <DashboardCard className="p-5">
 <div className="flex items-center gap-2 mb-4">
 <div className="w-8 h-8 rounded-xl bg-[#D97706]/15 text-[#D97706] flex items-center justify-center">
 <Clock className="w-4 h-4" />
 </div>
 <h3 className="font-bold text-[#101F36]">Current delay ranking</h3>
 </div>
 <div className="space-y-3">
 {byDelay.map(({ train, delay }) => (
 <div key={train.id} className="flex items-center gap-3">
 <span className="w-16 shrink-0 font-mono text-xs font-bold text-[#5B6B82]">{train.trainNumber}</span>
 <div className="flex-1 h-2.5 rounded-xl bg-[#E3E8EF] overflow-hidden">
 <div
 className="h-full rounded-xl "
 style={{
 width: `${Math.max(4, (delay / maxDelay) * 100)}%`,
 backgroundColor: delay === 0 ? '#059669' : delay <= 10 ? '#F59E0B' : '#123A6B',
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
 <div className="w-8 h-8 rounded-xl bg-[#1C4E8F]/15 text-[#1C4E8F] flex items-center justify-center">
 <PieChart className="w-4 h-4" />
 </div>
 <h3 className="font-bold text-[#101F36]">Services by train type</h3>
 </div>
 <div className="space-y-3">
 {byType.map(([type, count]) => (
 <div key={type} className="flex items-center gap-3">
 <span className="w-28 shrink-0 text-xs font-bold text-[#5B6B82]">{type}</span>
 <div className="flex-1 h-3 rounded-xl bg-[#E3E8EF] overflow-hidden">
 <div
 className="h-full rounded-xl bg-[#1C4E8F]"
 style={{ width: `${(count / maxTypeCount) * 100}%` }}
 />
 </div>
 <span className="w-6 text-right font-mono text-xs font-black text-[#101F36]">{count}</span>
 </div>
 ))}
 </div>
 </DashboardCard>
 </div>

 {/* On-time / delayed breakdown */}
 <DashboardCard className="p-5">
 <div className="flex items-center gap-2 mb-4">
 <div className="w-8 h-8 rounded-xl bg-[#059669]/15 text-[#059669] flex items-center justify-center">
 <Gauge className="w-4 h-4" />
 </div>
 <h3 className="font-bold text-[#101F36]">On-time performance breakdown</h3>
 </div>
 <div className="flex items-end gap-3">
 <div className="flex-1">
 <div className="flex justify-between text-xs font-bold mb-1.5">
 <span className="text-emerald-700">On time</span>
 <span className="text-[#5B6B82] font-mono">{Math.round((onTime / TRAINS.length) * 100)}%</span>
 </div>
 <div className="h-3 rounded-xl bg-[#E3E8EF] overflow-hidden flex">
 <div className="h-full bg-emerald-400 " style={{ width: `${(onTime / TRAINS.length) * 100}%` }} />
 <div className="h-full bg-amber-400/80 " style={{ width: `${(delayed / TRAINS.length) * 100}%` }} />
 </div>
 <div className="flex justify-between text-xs font-bold mt-1.5">
 <span className="text-[#5B6B82]">0 min</span>
 <span className="text-amber-700">{delayed} delayed</span>
 </div>
 </div>
 <div className="w-28 shrink-0 text-center rounded-xl border border-[#E3E8EF] bg-[#F4F7FB] py-3">
 <TrendingUp className="w-4 h-4 text-[#1C4E8F] mx-auto" />
 <div className="font-mono text-lg font-black text-[#101F36] mt-1">
 {Math.round((onTime / TRAINS.length) * 100)}%
 </div>
 <div className="text-[10px] text-[#8B99AD]">punctual</div>
 </div>
 </div>
 </DashboardCard>

 <div className="flex items-center justify-center">
 <button
 onClick={() => onNavigate('live')}
 className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border border-[#1C4E8F]/30 bg-[#1C4E8F]/10 text-[#123A6B] hover:bg-[#1C4E8F]/20 "
 >
 <TrainIcon className="w-4 h-4" />
 Go to live tracking
 <ArrowRight className="w-4 h-4" />
 </button>
 </div>
 </div>
 );
};