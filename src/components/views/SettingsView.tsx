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
 <h2 className="text-2xl font-black text-[#13213E] tracking-tight">Settings</h2>
 <p className="text-sm text-[#64748B] mt-1">Backend connectivity, audio and platform configuration</p>
 </div>

 {/* ML engine / backend */}
 <DashboardCard className="p-6">
 <div className="flex items-center gap-3 mb-5">
 <div className="w-10 h-10 rounded-none bg-[#2563EB]/15 text-[#1D4ED8] flex items-center justify-center">
 <Server className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-bold text-[#13213E]">ML Engine Backend</h3>
 <p className="text-xs text-[#64748B]">FastAPI service powering live NTES fetch + delay/ETA predictions</p>
 </div>
 </div>

 <div className="space-y-3">
 <div className="flex items-center justify-between p-3 rounded-none border border-[#E2E8F0] bg-[#F1F5F9]">
 <span className="text-xs font-bold text-[#64748B] flex items-center gap-2">
 <Activity className="w-3.5 h-3.5 text-[#2563EB]" />
 API Base URL
 </span>
 <code className="font-mono text-xs font-bold text-[#13213E]">{getApiBaseUrl()}</code>
 </div>

 <div className="flex items-center justify-between p-3 rounded-none border border-[#E2E8F0] bg-[#F1F5F9]">
 <span className="text-xs font-bold text-[#64748B] flex items-center gap-2">
 <BrainCircuit className="w-3.5 h-3.5 text-[#D97706]" />
 Model
 </span>
 <span className="text-xs font-bold text-[#13213E]">{MODEL_META.best_model}</span>
 </div>

 <div className="flex items-center justify-between p-3 rounded-none border border-[#E2E8F0] bg-[#F1F5F9]">
 <span className="text-xs font-bold text-[#64748B] flex items-center gap-2">
 <Database className="w-3.5 h-3.5 text-[#059669]" />
 Training rows
 </span>
 <span className="font-mono text-xs font-bold text-[#13213E]">{MODEL_META.train_rows.toLocaleString()} · test {MODEL_META.test_rows.toLocaleString()}</span>
 </div>

 <div className="flex items-center justify-between p-3 rounded-none border border-[#E2E8F0] bg-[#F1F5F9]">
 <span className="text-xs font-bold text-[#64748B] flex items-center gap-2">
 <Cpu className="w-3.5 h-3.5 text-[#6366F1]" />
 Hold-out metrics
 </span>
 <span className="font-mono text-xs font-bold text-[#13213E]">R² {MODEL_META.r2} · MAE {MODEL_META.mae} min</span>
 </div>
 </div>

 <div className="mt-4 flex flex-wrap items-center gap-3">
 <button
 onClick={runHealthCheck}
 disabled={checking}
 className="inline-flex items-center gap-2 px-4 py-2.5 rounded-none text-xs font-bold bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] "
 >
 <RefreshCw className={cn('w-3.5 h-3.5', checking && '')} />
 {checking ? 'Checking…' : 'Re-check backend health'}
 </button>
 <span
 className={cn(
 'inline-flex items-center gap-2 px-3 py-2 rounded-none border font-mono text-xs font-bold',
 health === 'online'
 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
 : health === 'offline'
 ? 'border-rose-500/30 bg-rose-500/10 text-rose-700'
 : 'border-amber-500/30 bg-amber-500/10 text-amber-800',
 )}
 >
 <span className={cn('w-2 h-2 rounded-none', health === 'online' ? 'bg-emerald-400' : health === 'offline' ? 'bg-rose-400' : 'bg-amber-400 ')} />
 {health}
 </span>
 </div>
 </DashboardCard>

 {/* Audio */}
 <DashboardCard className="p-6">
 <div className="flex items-center gap-3 mb-5">
 <div className="w-10 h-10 rounded-none bg-[#1D4ED8]/15 text-[#2563EB] flex items-center justify-center">
 <Volume2 className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-bold text-[#13213E]">Railway Audio</h3>
 <p className="text-xs text-[#64748B]">IR chimes, locomotive horn and station announcements</p>
 </div>
 </div>
 <button
 onClick={toggleSound}
 className="inline-flex items-center gap-2.5 px-4 py-3 rounded-none border border-[#E2E8F0] bg-[#F1F5F9] hover:border-[#2563EB]/40 text-xs font-bold"
 >
 {soundActive ? (
 <Volume2 className="w-4 h-4 text-[#2563EB]" />
 ) : (
 <VolumeX className="w-4 h-4 text-[#7C8DA8]" />
 )}
 <span className="text-[#13213E]">{soundActive ? 'Enabled' : 'Muted'}</span>
 </button>
 </DashboardCard>

 {/* Appearance */}
 <DashboardCard className="p-6">
 <div className="flex items-center gap-3 mb-4">
 <div className="w-10 h-10 rounded-none bg-[#6366F1]/15 text-[#818CF8] flex items-center justify-center">
 <Palette className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-bold text-[#13213E]">Appearance</h3>
 <p className="text-xs text-[#64748B]">Control room dark theme</p>
 </div>
 </div>
 <div className="flex items-center gap-2 px-3 py-1.5 rounded-none border border-[#E2E8F0] bg-[#F1F5F9] text-xs font-bold text-[#13213E]">
 <span className="w-3 h-3 rounded-sm bg-[#1D4ED8] border border-[#1D4ED8]/40" />
 Bright · railway blue actions
 </div>
 </DashboardCard>
 </div>
 );
};