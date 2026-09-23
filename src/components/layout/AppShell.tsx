'use client';

import React from 'react';
import Image from 'next/image';
import { MapPin } from 'lucide-react';
import { cn } from '../../lib/cn';

interface NavLink {
 key: string;
 label: string;
 icon?: React.ComponentType<{ className?: string }>;
 highlight?: boolean;
}

const NAV_LINKS: NavLink[] = [
 { key: 'trains', label: 'Home' },
 { key: 'trains', label: 'Trains' },
 { key: 'station', label: 'Stations' },
 { key: 'live', label: 'Schedule' },
 { key: 'map', label: 'Live Map', icon: MapPin, highlight: true },
];

interface AppShellProps {
 active: string;
 onNavigate: (key: string) => void;
 children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ active, onNavigate, children }) => {
 return (
 <div className="min-h-screen bg-[#F8FAFC]">
 <header className="sticky top-0 z-30 bg-[#F8FAFC] border-b border-[#E2E8F0]">
 <div className="flex items-center justify-between gap-6 px-4 sm:px-6 lg:px-8 h-20 max-w-[1280px] mx-auto">
 {/* Brand */}
 <button
 onClick={() => onNavigate('trains')}
 className="flex items-center shrink-0"
 aria-label="RailBuddy home"
 >
<Image
  src="/logo.png"
  alt="RailBuddy"
 width={480}
 height={192}
 priority
 className="h-14 w-auto object-contain shrink-0"
 />
 </button>

 {/* Center nav */}
 <nav className="hidden md:flex items-center gap-8">
 {NAV_LINKS.map((link) => {
 const isActive = active === link.key;
 const Icon = link.icon;
 if (link.highlight) {
 return (
 <button
 key={`${link.key}-${link.label}`}
 onClick={() => onNavigate(link.key)}
 aria-current={isActive ? 'page' : undefined}
 className={cn(
 'relative flex items-center gap-1.5 px-4 py-2 rounded-none text-[14px] font-bold cursor-pointer border transition-all',
 isActive
 ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
 : 'bg-[#EEF4FC] text-[#1D4ED8] border-[#1D4ED8]/40 hover:bg-[#1D4ED8] hover:text-white hover:border-[#1D4ED8]'
 )}
 >
 {Icon && <Icon className="w-3.5 h-3.5" />}
 <span className="relative flex items-center gap-1">
 {link.label}
 <span className="ml-1 px-1.5 py-0.5 rounded-none bg-emerald-500 text-white text-[9px] font-mono font-black leading-none animate-pulse">
 LIVE
 </span>
 </span>
 </button>
 );
 }
 return (
 <button
 key={`${link.key}-${link.label}`}
 onClick={() => onNavigate(link.key)}
 aria-current={isActive ? 'page' : undefined}
 className={cn(
 'relative text-[16px] font-semibold cursor-pointer',
 isActive ? 'text-[#1D4ED8]' : 'text-[#4A5A79] hover:text-[#13213E]'
 )}
 >
 {link.label}
 {isActive && (
 <span className="absolute -bottom-[28px] left-0 right-0 h-1 bg-[#1D4ED8]" />
 )}
 </button>
 );
 })}
 </nav>

 {/* Right actions */}
 <div className="flex items-center gap-4">
 <button
 onClick={() => onNavigate('about')}
className="hidden sm:inline-flex text-[16px] font-semibold text-[#4A5A79] hover:text-[#13213E] cursor-pointer"
  >
  Help
  </button>
  <button
  type="button"
  className="px-7 py-3 rounded-none bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-[16px] font-semibold cursor-pointer"
  >
 Sign In
 </button>
 </div>
 </div>
 </header>

 <main className="flex-1 w-full relative">{children}</main>
 </div>
 );
};