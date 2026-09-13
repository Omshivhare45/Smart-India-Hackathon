'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { TrainFront, Radio, Clock } from 'lucide-react';
import { cn } from '../../lib/cn';

interface NavPill {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_PILLS: NavPill[] = [
  { key: 'trains', label: 'Train Search', icon: TrainFront },
  { key: 'live', label: 'Live Status', icon: Radio },
];

interface AppShellProps {
  active: string;
  onNavigate: (key: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ active, onNavigate, children }) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-[#F8FAFC]/80 backdrop-blur-xl">
        <div className="flex items-center gap-4 px-4 sm:px-6 lg:px-8 h-16">
          {/* Brand */}
          <button
            onClick={() => onNavigate('trains')}
            className="flex items-center shrink-0 group"
            aria-label="RailBuddy home"
          >
            <Image
              src="/logo.jpeg"
              alt="RailBuddy"
              width={480}
              height={192}
              priority
              className="h-10 w-auto object-contain shrink-0"
            />
            <span className="hidden md:block text-left pl-2.5">
              <span className="block text-[10px] font-semibold text-[#7C8DA8] leading-none">
                Live Trains · Delays · ETA
              </span>
            </span>
          </button>

          {/* Nav pills */}
          <nav className="flex items-center gap-1 min-w-0 ml-auto overflow-x-auto scrollbar-none">
            {NAV_PILLS.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  title={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0',
                    isActive
                      ? 'bg-[#EEF4FC] text-[#1D4ED8] border border-[#1D4ED8]/25'
                      : 'border border-transparent text-[#64748B] hover:text-[#13213E] hover:bg-[#F1F5F9] hover:border-[#E2E8F0]',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* IST clock */}
          <div className="hidden sm:flex items-center gap-1.5 pl-3 shrink-0">
            <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="font-mono text-xs font-bold text-[#13213E] tabular-nums">
              {timeStr || '12:00 PM'}
            </span>
            <span className="text-[9px] uppercase font-bold text-[#7C8DA8]">IST</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full relative">{children}</main>
    </div>
  );
};