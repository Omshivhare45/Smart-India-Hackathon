'use client';

import React, { useState } from 'react';
import {
 Server,
 Cpu,
 Volume2,
 VolumeX,
 Database,
 Palette,
 BrainCircuit,
 Activity,
 RefreshCw,
} from 'lucide-react';
import DashboardCard from '../layout/DashboardCard';
import { getApiBaseUrl, fetchApiHealth } from '../../lib/api';
import { railAudio } from '../../utils/audio';
import { cn } from '../../lib/cn';

const MODEL_META = {
 best_model: 'GradientBoosting (ensemble of GBR · RF · LGBM)',
 r2: 0.834,
 mae: 2.877,
 train_rows: 42408,
 test_rows: 14136,
};

export const SettingsView: React.FC = () => {
 const [soundActive, setSoundActive] = useState<boolean>(true);
 const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
 const [checking, setChecking] = useState<boolean>(false);

 const runHealthCheck = async () => {
 setChecking(true);
 setHealth('checking');
 const ok = await fetchApiHealth();
 setHealth(ok ? 'online' : 'offline');
 setChecking(false);
 };

 const toggleSound = () => {
 const next = !soundActive;
 setSoundActive(next);
 railAudio.setSoundEnabled(next);
 if (next) railAudio.playIRChime();
 };

 return (
 <div className="max-w-3xl space-y-6">
 <div>
 <h2 className="text-2xl font-black text-[#101F36] tracking-tight">Settings</h2>
 <p className="text-sm text-[#5B6B82] mt-1">Backend connectivity, audio and platform configuration</p>
 </div>

 {/* ML engine / backend */}
 <DashboardCard className="p-6">
 <div className="flex items-center gap-3 mb-5">
 <div className="w-10 h-10 rounded-xl bg-[#1C4E8F]/15 text-[#123A6B] flex items-center justify-center">
 <Server className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-bold text-[#101F36]">ML Engine Backend</h3>
 <p className="text-xs text-[#5B6B82]">FastAPI service powering live NTES fetch + delay/ETA predictions</p>
 </div>
 </div>

 <div className="space-y-3">
 <div className="flex items-center justify-between p-3 rounded-xl border border-[#E3E8EF] bg-[#F4F7FB]">
 <span className="text-xs font-bold text-[#5B6B82] flex items-center gap-2">
 <Activity className="w-3.5 h-3.5 text-[#1C4E8F]" />
 API Base URL
 </span>
 <code className="font-mono text-xs font-bold text-[#101F36]">{getApiBaseUrl()}</code>
 </div>

 <div className="flex items-center justify-between p-3 rounded-xl border border-[#E3E8EF] bg-[#F4F7FB]">
 <span className="text-xs font-bold text-[#5B6B82] flex items-center gap-2">
 <BrainCircuit className="w-3.5 h-3.5 text-[#D97706]" />
 Model
 </span>
 <span className="text-xs font-bold text-[#101F36]">{MODEL_META.best_model}</span>
 </div>

 <div className="flex items-center justify-between p-3 rounded-xl border border-[#E3E8EF] bg-[#F4F7FB]">
 <span className="text-xs font-bold text-[#5B6B82] flex items-center gap-2">
 <Database className="w-3.5 h-3.5 text-[#059669]" />
 Training rows
 </span>
 <span className="font-mono text-xs font-bold text-[#101F36]">{MODEL_META.train_rows.toLocaleString()} · test {MODEL_META.test_rows.toLocaleString()}</span>
 </div>

 <div className="flex items-center justify-between p-3 rounded-xl border border-[#E3E8EF] bg-[#F4F7FB]">
 <span className="text-xs font-bold text-[#5B6B82] flex items-center gap-2">
 <Cpu className="w-3.5 h-3.5 text-[#1C4E8F]" />
 Hold-out metrics
 </span>
 <span className="font-mono text-xs font-bold text-[#101F36]">R² {MODEL_META.r2} · MAE {MODEL_META.mae} min</span>
 </div>
 </div>

 <div className="mt-4 flex flex-wrap items-center gap-3">
 <button
 onClick={runHealthCheck}
 disabled={checking}
 className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1C4E8F] hover:bg-[#123A6B] text-[#F4F7FB] "
 >
 <RefreshCw className={cn('w-3.5 h-3.5', checking && '')} />
 {checking ? 'Checking…' : 'Re-check backend health'}
 </button>
 <span
 className={cn(
 'inline-flex items-center gap-2 px-3 py-2 rounded-xl border font-mono text-xs font-bold',
 health === 'online'
 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
 : health === 'offline'
 ? 'border-rose-500/30 bg-rose-500/10 text-rose-700'
 : 'border-amber-500/30 bg-amber-500/10 text-amber-800',
 )}
 >
 <span className={cn('w-2 h-2 rounded-xl', health === 'online' ? 'bg-emerald-400' : health === 'offline' ? 'bg-rose-400' : 'bg-amber-400 ')} />
 {health}
 </span>
 </div>
 </DashboardCard>

 {/* Audio */}
 <DashboardCard className="p-6">
 <div className="flex items-center gap-3 mb-5">
 <div className="w-10 h-10 rounded-xl bg-[#123A6B]/15 text-[#1C4E8F] flex items-center justify-center">
 <Volume2 className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-bold text-[#101F36]">Railway Audio</h3>
 <p className="text-xs text-[#5B6B82]">IR chimes, locomotive horn and station announcements</p>
 </div>
 </div>
 <button
 onClick={toggleSound}
 className="inline-flex items-center gap-2.5 px-4 py-3 rounded-xl border border-[#E3E8EF] bg-[#F4F7FB] hover:border-[#1C4E8F]/40 text-xs font-bold"
 >
 {soundActive ? (
 <Volume2 className="w-4 h-4 text-[#1C4E8F]" />
 ) : (
 <VolumeX className="w-4 h-4 text-[#8B99AD]" />
 )}
 <span className="text-[#101F36]">{soundActive ? 'Enabled' : 'Muted'}</span>
 </button>
 </DashboardCard>

 {/* Appearance */}
 <DashboardCard className="p-6">
 <div className="flex items-center gap-3 mb-4">
 <div className="w-10 h-10 rounded-xl bg-[#1C4E8F]/15 text-[#1C4E8F] flex items-center justify-center">
 <Palette className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-bold text-[#101F36]">Appearance</h3>
 <p className="text-xs text-[#5B6B82]">Control room dark theme</p>
 </div>
 </div>
 <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E3E8EF] bg-[#F4F7FB] text-xs font-bold text-[#101F36]">
 <span className="w-3 h-3 rounded-sm bg-[#123A6B] border border-[#123A6B]/40" />
 Bright · railway blue actions
 </div>
 </DashboardCard>
 </div>
 );
};