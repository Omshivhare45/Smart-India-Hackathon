'use client';

import React from 'react';
import Image from 'next/image';
import {
 BrainCircuit,
 Radio,
 MapPin,
 ShieldCheck,
 Cpu,
 CloudSun,
 Globe,
} from 'lucide-react';
import DashboardCard from '../layout/DashboardCard';

const FEATURES = [
 { icon: Radio, title: 'Live Train Status', desc: 'Real-time NTES running feed with station-by-station scheduled vs actual timeline.' },
 { icon: BrainCircuit, title: 'AI Delay & ETA Forecasting', desc: 'Gradient Boosting ensemble predicts next-stop delay and arrival from 42k+ observations.' },
 { icon: MapPin, title: 'Station & Route Intelligence', desc: 'Terminal departure boards, platform locators and route-level analysis.' },
 { icon: CloudSun, title: 'Weather Awareness', desc: 'Ambient telemetry alongside forecasts so operators can reason about slowdowns.' },
 { icon: ShieldCheck, title: 'Safety Grid', desc: 'Kavach collision shield awareness and on-board telemetry surfaces.' },
];

export const AboutView: React.FC = () => {
 return (
 <div className="max-w-4xl space-y-6">
 <div className="relative overflow-hidden rounded-none border border-[#E2E8F0] bg-white px-6 sm:px-8 py-10 text-center">
 <div className="relative">
 <div className="mx-auto w-24 h-24 rounded-none bg-white border border-[#E2E8F0] shadow-[0_8px_26px_rgba(30,58,138,0.12)] p-2 flex items-center justify-center overflow-hidden">
 <Image
 src="/logo.png"
 alt="RailBuddy"
 width={480}
 height={192}
 className="w-full h-full object-contain"
 />
 </div>
 <h2 className="mt-6 text-3xl font-black text-[#13213E] tracking-tight">
 Rail<span className="text-[#2563EB]">Buddy</span>
 </h2>
 <p className="mt-1 text-sm font-bold text-[#1D4ED8] uppercase tracking-widest">
 AI-Powered Railway Intelligence
 </p>
 <p className="mt-4 text-sm text-[#64748B] max-w-xl mx-auto leading-relaxed">
 A Smart India Hackathon entry — RailBuddy fuses real-time Indian Railways live status with an ML
 delay-forecasting engine to build a unified railway intelligence control room.
 </p>

 <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-mono text-[#64748B]">
 <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-[#E2E8F0] bg-[#FFFFFF]">
 <Cpu className="w-3.5 h-3.5 text-[#2563EB]" /> Next.js 16
 </span>
 <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-[#E2E8F0] bg-[#FFFFFF]">
 <BrainCircuit className="w-3.5 h-3.5 text-[#D97706]" /> FastAPI ML Engine
 </span>
 <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-[#E2E8F0] bg-[#FFFFFF]">
 <Radio className="w-3.5 h-3.5 text-emerald-700" /> NTES Live Feed
 </span>
 <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-[#E2E8F0] bg-[#FFFFFF]">
 <Globe className="w-3.5 h-3.5 text-[#6366F1]" /> ISRO NavIC concepts
 </span>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {FEATURES.map((feature) => {
 const Icon = feature.icon;
 return (
 <DashboardCard key={feature.title} className="p-5">
 <div className="w-10 h-10 rounded-none border border-[#E2E8F0] bg-[#F1F5F9] text-[#2563EB] flex items-center justify-center">
 <Icon className="w-5 h-5" />
 </div>
 <h3 className="mt-3 font-bold text-[#13213E] text-sm">{feature.title}</h3>
 <p className="mt-1 text-xs text-[#64748B] leading-relaxed">{feature.desc}</p>
 </DashboardCard>
 );
 })}
 <DashboardCard className="p-5 border-[#E2E8F0] bg-[#F1F5F9]">
 <div className="flex flex-col items-center justify-center h-full text-center py-6">
 <span className="text-3xl font-black font-mono text-[#2563EB]">SIH</span>
 <p className="mt-1 text-xs font-bold text-[#64748B]">Smart India Hackathon · Railway Track</p>
 <p className="mt-3 text-[11px] text-[#7C8DA8] leading-relaxed max-w-xs">
 Built for live train enquiry: where is my train, when will it arrive, and how late will it run.
 </p>
 </div>
 </DashboardCard>
 </div>

 <footer className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#E2E8F0]">
 <span className="text-xs text-[#7C8DA8]">© 2026 RailBuddy · Smart India Hackathon entry</span>
 <div className="flex items-center gap-5 text-xs font-medium text-[#64748B]">
 <a href="#" className="hover:text-[#1D4ED8] ">Privacy Policy</a>
 <a href="#" className="hover:text-[#1D4ED8] ">Terms of Service</a>
 <a href="#" className="hover:text-[#1D4ED8] ">IRCTC Live API</a>
 <a href="#" className="hover:text-[#1D4ED8] ">CRIS Grid</a>
 </div>
 </footer>
 </div>
 );
};