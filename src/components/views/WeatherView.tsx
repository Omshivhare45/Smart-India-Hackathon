'use client';

import React, { useMemo } from 'react';
import { CloudSun, Thermometer, Wind, Sun, Info, CloudRain, CloudFog } from 'lucide-react';
import DashboardCard from '../layout/DashboardCard';
import { STATIONS } from '../../data/trainData';

const CONDITIONS = ['Clear Sky', 'Partly Cloudy', 'Light Haze', 'Overcast', 'Drizzle'] as const;

function seededCondition(code: string) {
 let hash = 0;
 for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
 return CONDITIONS[hash % CONDITIONS.length];
}

function seededTemp(code: string) {
 let hash = 0;
 for (let i = 0; i < code.length; i++) hash = (hash * 33 + code.charCodeAt(i)) >>> 0;
 return 18 + (hash % 15);
}

function seededWind(code: string) {
 let hash = 0;
 for (let i = 0; i < code.length; i++) hash = (hash * 37 + code.charCodeAt(i)) >>> 0;
 return 4 + (hash % 18);
}

const conditionMeta: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
 'Clear Sky': { icon: Sun, color: '#F59E0B' },
 'Partly Cloudy': { icon: CloudSun, color: '#1C4E8F' },
 'Light Haze': { icon: CloudFog, color: '#8B99AD' },
 Overcast: { icon: CloudFog, color: '#5B6B82' },
 Drizzle: { icon: CloudRain, color: '#1C4E8F' },
};

export const WeatherView: React.FC = () => {
 const stations = useMemo(() => STATIONS.slice(0, 12), []);

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div>
 <h2 className="text-2xl font-black text-[#101F36] tracking-tight">Weather Analysis</h2>
 <p className="text-sm text-[#5B6B82] mt-1">Route &amp; terminal weather telemetry across monitored stations</p>
 </div>
 <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 text-[11px] font-bold">
 <Info className="w-3.5 h-3.5" />
 Demo telemetry · NTES does not expose weather
 </div>
 </div>

 <DashboardCard className="p-5 border-[#1C4E8F]/20 bg-[#F4F7FB]">
 <div className="flex items-start gap-3">
 <div className="w-10 h-10 shrink-0 rounded-xl bg-[#1C4E8F]/15 text-[#123A6B] flex items-center justify-center">
 <CloudSun className="w-5 h-5" />
 </div>
 <p className="text-sm text-[#5B6B82] leading-relaxed">
 Weather conditions influence delay propagation — dense fog, heavy rain and heat trigger reduced
 speed restrictions on sections. RailBuddy surfaces ambient telemetry alongside the ML delay forecast
 so operators can reason about slowdowns. Labels below are simulated, matching the app demo feed.
 </p>
 </div>
 </DashboardCard>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
 {stations.map((station) => {
 const condition = seededCondition(station.code);
 const temp = seededTemp(station.code);
 const wind = seededWind(station.code);
 const meta = conditionMeta[condition];
 const Icon = meta.icon;
 return (
 <DashboardCard key={station.code} hover className="p-5">
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2">
 <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-xl bg-[#1C4E8F]/10 text-[#123A6B] border border-[#1C4E8F]/25">
 {station.code}
 </span>
 <span className="text-[10px] text-[#8B99AD] font-bold uppercase">{station.state}</span>
 </div>
 <h3 className="mt-2 font-bold text-[#101F36] text-sm">{station.name}</h3>
 <p className="text-xs text-[#5B6B82]">{station.city}</p>
 </div>
 <div className="w-9 h-9 rounded-xl border border-[#E3E8EF] bg-[#F4F7FB] flex items-center justify-center" style={{ color: meta.color }}>
 <Icon className="w-4 h-4" />
 </div>
 </div>

 <div className="mt-4 flex items-end gap-1.5">
 <span className="font-mono text-3xl font-black text-[#101F36] leading-none">{temp}°</span>
 <span className="text-xs font-bold text-[#5B6B82] mb-1">C · {condition}</span>
 </div>

 <div className="mt-3 pt-3 border-t border-[#E3E8EF] flex items-center gap-4 text-xs text-[#5B6B82]">
 <span className="inline-flex items-center gap-1.5">
 <Thermometer className="w-3.5 h-3.5" style={{ color: meta.color }} />
 {temp + 2}°C max
 </span>
 <span className="inline-flex items-center gap-1.5">
 <Wind className="w-3.5 h-3.5 text-[#1C4E8F]" />
 {wind} km/h
 </span>
 </div>
 </DashboardCard>
 );
 })}
 </div>
 </div>
 );
};