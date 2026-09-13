'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  AlarmClock,
  TimerOff,
  Route,
  BrainCircuit,
  ArrowRight,
  Radio,
  Gauge,
  ShieldCheck,
  TrendingUp,
  Clock,
  Cpu,
  Sparkles,
  Train as TrainIcon,
  Landmark,
  CloudSun,
} from 'lucide-react';
import { TRAINS, STATIONS } from '../data/trainData';
import { Train } from '../types/train';
import { fetchApiHealth } from '../lib/api';
import DashboardCard from './layout/DashboardCard';
import { cn } from '../lib/cn';

interface DashboardProps {
  onNavigate: (key: string) => void;
  onTrackTrain: (train: Train) => void;
}

// Real metrics from ml/artifacts/model_meta.json (synthetic demo dataset)
const MODEL_META = {
  best_model: 'GradientBoosting',
  r2: 0.834,
  mae: 2.877,
  train_rows: 42408,
};

const QUICK_ACTIONS = [
  { key: 'trains', label: 'Search Train', desc: 'Find services between stations', icon: Search, accent: 'from-[#2563EB] to-[#2563EB]' },
  { key: 'eta', label: 'Predict ETA', desc: 'AI arrival forecast for next stop', icon: AlarmClock, accent: 'from-[#2563EB] to-[#0EA5E9]' },
  { key: 'delay', label: 'Check Delay', desc: 'Running-late probability score', icon: TimerOff, accent: 'from-[#D97706] to-[#1D4ED8]' },
  { key: 'route', label: 'Analyze Route', desc: 'Station-by-station intelligence', icon: Route, accent: 'from-[#2563EB] to-[#6366F1]' },
];

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onTrackTrain }) => {
  const [backend, setBackend] = useState<'checking' | 'online' | 'offline'>('checking');
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    fetchApiHealth().then((ok) => {
      if (mounted) setBackend(ok ? 'online' : 'offline');
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const delays = TRAINS.map((t) => t.currentStatus.delayMinutes);
  const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
  const onTimePct = (delays.filter((d) => d === 0).length / delays.length) * 100;

  const mostPunctual = [...TRAINS].sort(
    (a, b) => a.currentStatus.delayMinutes - b.currentStatus.delayMinutes,
  )[0];
  const longestRun = [...TRAINS].sort((a, b) => b.distanceKm - a.distanceKm)[0];
  const stationsServed = new Set(
    TRAINS.flatMap((t) => t.route.map((r) => r.stationCode)),
  ).size;

  const stats = [
    { label: 'Active Trains', value: String(TRAINS.length), suffix: 'services', sub: `${stationsServed} stations monitored`, icon: TrainIcon, accent: '#2563EB', note: 'tracked dataset' },
    { label: 'Average Delay', value: avgDelay.toFixed(0), suffix: 'min', sub: 'across current services', icon: Clock, accent: '#D97706', note: 'live snapshot' },
    { label: 'On-Time Performance', value: onTimePct.toFixed(0), suffix: '%', sub: 'zero-delay services', icon: Gauge, accent: '#059669', note: 'live snapshot' },
    { label: 'Prediction Accuracy', value: `R² ${MODEL_META.r2}`, suffix: '', sub: `MAE ${MODEL_META.mae} min · ${MODEL_META.best_model}`, icon: BrainCircuit, accent: '#6366F1', note: 'model metrics' },
  ];

  return (
    <div className="space-y-8">
      {/* WELCOME HEADER */}
      <section className="relative overflow-hidden rounded-3xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] via-[#EFF6FF] to-[#F8FAFC] px-6 sm:px-8 py-8">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#2563EB]/[0.07] blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-[#2563EB]/[0.06] blur-3xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 text-[#1D4ED8] text-[11px] font-bold mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Live Trains · Delays · ETA Intelligence
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#13213E] tracking-tight">
              Plan your journey, track it live.
            </h2>
            <p className="text-sm sm:text-base text-[#64748B] mt-2 max-w-xl">
              Search any two stations and get live running status, platform details and AI
              delay &amp; ETA forecasts across the Indian Railways network.
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-5">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] font-mono text-xs font-bold text-[#13213E]">
                <Radio className="w-3.5 h-3.5 text-[#2563EB] animate-pulse" />
                {timeStr || '--:--:--'} IST
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-xs font-bold',
                  backend === 'online'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                    : backend === 'offline'
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-700'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-800',
                )}
              >
                <span className="relative flex h-2 w-2">
                  {backend === 'online' && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-ping opacity-60" />}
                  <span className={cn('relative inline-flex rounded-full h-2 w-2', backend === 'online' ? 'bg-emerald-400' : backend === 'offline' ? 'bg-rose-400' : 'bg-amber-400 animate-pulse')} />
                </span>
                ML Engine {backend}
              </span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('trains')}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold transition-all active:scale-95 shadow-[0_8px_24px_-6px_rgba(37,99,235,0.45)]"
          >
            <Search className="w-4 h-4" />
            Start Train Enquiry
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* QUICK STATS */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
              >
                <DashboardCard hover className="p-5 h-full">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] flex items-center justify-center" style={{ color: stat.accent }}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#E2E8F0] bg-[#F1F5F9] text-[#7C8DA8]">
                      {stat.note}
                    </span>
                  </div>
                  <div className="mt-4 flex items-end gap-1.5">
                    <span className="font-mono text-3xl font-black text-[#13213E] leading-none">{stat.value}</span>
                    {stat.suffix && <span className="text-xs font-bold text-[#64748B] mb-1">{stat.suffix}</span>}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-[#64748B]">{stat.sub}</p>
                  <div className="mt-3 h-1 rounded-full bg-[#E2E8F0] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${idx === 3 ? 83 : Math.max(15, idx === 1 ? Math.min(100, avgDelay * 10) : idx === 2 ? onTimePct : 100)}%`, backgroundColor: stat.accent }}
                    />
                  </div>
                </DashboardCard>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <section>
        <SectionHeading icon={Radio} title="Quick Actions" subtitle="Jump straight into an enquiry" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <DashboardCard key={action.key} hover onClick={() => onNavigate(action.key)} className="p-5 group h-full">
                <div className={cn('w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-[#F8FAFC] shadow-lg transition-transform group-hover:scale-105', action.accent)}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-bold text-[#13213E] text-sm">{action.label}</h3>
                <p className="mt-1 text-xs text-[#64748B] leading-relaxed">{action.desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] opacity-0 group-hover:opacity-100 transition-opacity">
                  Open <ArrowRight className="w-3 h-3" />
                </span>
              </DashboardCard>
            );
          })}
        </div>
      </section>

      {/* RECENT PREDICTIONS + AI INSIGHTS */}
      <section className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Recent train predictions */}
        <div className="xl:col-span-3 space-y-4">
          <SectionHeading icon={TrendingUp} title="Recent Train Predictions" subtitle="Live snapshot of tracked services on the network" />
          <div className="space-y-3">
            <AnimatePresence>
              {TRAINS.slice(0, 5).map((train, idx) => (
                <motion.div
                  key={train.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <DashboardCard hover className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-[#1D4ED8]/40 to-[#1D4ED8]/40 border border-[#2563EB]/20 flex items-center justify-center text-[#1D4ED8]">
                          <TrainIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-md bg-[#1D4ED8]/10 text-[#2563EB] border border-[#1D4ED8]/25">
                              {train.trainNumber}
                            </span>
                            <span className="text-sm font-bold text-[#13213E] truncate">{train.trainName}</span>
                          </div>
                          <p className="text-[11px] text-[#64748B] truncate mt-0.5">
                            {train.sourceName} → {train.destinationName} • {train.distanceKm} km
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <span className="block text-[10px] uppercase font-bold text-[#7C8DA8]">Delay</span>
                          <span className={cn('font-mono text-lg font-black leading-none', train.currentStatus.delayMinutes > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                            {train.currentStatus.delayMinutes}
                            <span className="text-[10px] text-[#7C8DA8] font-bold">m</span>
                          </span>
                        </div>

                        <button
                          onClick={() => onTrackTrain(train)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold border border-[#2563EB]/30 bg-[#2563EB]/10 text-[#1D4ED8] hover:bg-[#2563EB]/20 transition-all inline-flex items-center gap-1.5"
                        >
                          Track <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </DashboardCard>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* AI insights */}
        <div className="xl:col-span-2 space-y-4">
          <SectionHeading icon={BrainCircuit} title="AI Insights" subtitle="Signals computed from the ML engine" />

          <div className="space-y-3">
            <DashboardCard className="p-5 border-[#2563EB]/20 bg-gradient-to-br from-[#1D4ED8]/15 to-[#FFFFFF]">
              <div className="flex items-center gap-2 text-[#1D4ED8] text-xs font-bold uppercase tracking-wider">
                <Cpu className="w-4 h-4" /> ML Engine Status
              </div>
              <p className="mt-2 text-sm font-bold text-[#13213E]">
                {MODEL_META.best_model} ensemble · R² {MODEL_META.r2} on hold-out test set
              </p>
              <p className="mt-1 text-xs text-[#64748B] leading-relaxed">
                Trained on {MODEL_META.train_rows.toLocaleString()} delay observations. Feed real NTES telemetry to forecast next-station delay.
              </p>
              <button
                onClick={() => onNavigate('live')}
                className="mt-3 text-xs font-bold text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-1"
              >
                Open live forecast <ArrowRight className="w-3 h-3" />
              </button>
            </DashboardCard>

            <InsightRow icon={ShieldCheck} accent="#D97706" label="Most punctual service" value={`${mostPunctual.trainNumber} · ${mostPunctual.trainName}`} sub={`${mostPunctual.currentStatus.delayMinutes} min current delay`} />
            <InsightRow icon={Route} accent="#2563EB" label="Longest monitored run" value={`${longestRun.trainNumber} · ${longestRun.trainName}`} sub={`${longestRun.distanceKm} km end-to-end`} />
            <InsightRow icon={Landmark} accent="#2563EB" label="Stations under coverage" value={`${stationsServed} across ${STATIONS.length} hubs`} sub="routed train dataset" />
            <InsightRow icon={CloudSun} accent="#6366F1" label="Weather telemetry" value="Demo feed available" sub="NTES does not expose weather" />

            <button
              onClick={() => onNavigate('analytics')}
              className="w-full py-3 rounded-xl border border-dashed border-[#D6E0EC] text-xs font-bold text-[#64748B] hover:text-[#1D4ED8] hover:border-[#2563EB]/40 transition-all inline-flex items-center justify-center gap-1.5"
            >
              View full analytics <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] flex items-center justify-center text-[#2563EB]">
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div>
        <h3 className="text-base font-bold text-[#13213E]">{title}</h3>
        <p className="text-xs text-[#7C8DA8]">{subtitle}</p>
      </div>
    </div>
  );
}

function InsightRow({
  icon: Icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <DashboardCard className="p-5">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 shrink-0 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] flex items-center justify-center"
          style={{ color: accent }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <span className="block text-[11px] uppercase font-bold tracking-wider text-[#7C8DA8]">{label}</span>
          <span className="block text-sm font-bold text-[#13213E] mt-0.5 truncate">{value}</span>
          <span className="block text-xs text-[#64748B] mt-0.5">{sub}</span>
        </div>
      </div>
    </DashboardCard>
  );
}