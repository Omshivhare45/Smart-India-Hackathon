'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Menu, X, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { NAV_ALL, NAV_MAIN, NAV_MORE } from './navConfig';

interface AppShellProps {
  active: string;
  onNavigate: (key: string) => void;
  children: React.ReactNode;
}

const MORE_TRIGGER_LABEL = 'More';

export const AppShell: React.FC<AppShellProps> = ({ active, onNavigate, children }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Any navigation closes every transient menu.
  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
  }, [active]);

  // Click-away + Escape handling for the desktop "More" popover.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  const go = (key: string) => {
    setMenuOpen(false);
    setMoreOpen(false);
    onNavigate(key);
  };

  const isMoreActive = NAV_MORE.some((item) => item.key === active);

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E3E8EF]">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4 lg:gap-6">
            {/* Brand */}
            <button
              onClick={() => go('home')}
              className="flex items-center gap-2.5 shrink-0 cursor-pointer"
              aria-label="RailBuddy home"
            >
              <Image
                src="/logo.png"
                alt="RailBuddy"
                width={1254}
                height={1254}
                priority
                className="h-9 w-9 object-contain shrink-0"
              />
              <span className="text-[19px] font-extrabold tracking-tight text-[#101F36]">
                Rail<span className="text-[#123A6B]">Buddy</span>
              </span>
            </button>

            {/* Desktop navigation */}
            <nav className="hidden lg:flex items-center gap-0.5 h-full">
              {NAV_MAIN.map((link) => {
                const isActive = active === link.key;
                const Icon = link.icon;
                return (
                  <button
                    key={link.key}
                    onClick={() => go(link.key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex h-full items-center gap-1.5 px-3 text-[14px] font-semibold cursor-pointer transition-colors',
                      isActive ? 'text-[#123A6B]' : 'text-[#5B6B82] hover:text-[#101F36]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
                    {link.highlight && (
                      <span className="rb-live-badge">
                        <span className="rb-live-dot animate-pulse" />
                        Live
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#123A6B]" />
                    )}
                  </button>
                );
              })}

              {/* Overflow destinations */}
              <div ref={moreRef} className="relative flex h-full items-center">
                <button
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  className={cn(
                    'relative flex h-full items-center gap-1 px-3 text-[14px] font-semibold cursor-pointer transition-colors',
                    isMoreActive ? 'text-[#123A6B]' : 'text-[#5B6B82] hover:text-[#101F36]',
                  )}
                >
                  <span>{MORE_TRIGGER_LABEL}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', moreOpen && 'rotate-180')} />
                  {isMoreActive && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#123A6B]" />
                  )}
                </button>

                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%-1px)] w-60 rounded-xl border border-[#E3E8EF] bg-white p-1.5 shadow-[0_18px_40px_-24px_rgba(16,31,54,0.45)]"
                  >
                    {NAV_MORE.map((link) => {
                      const Icon = link.icon;
                      const isActive = active === link.key;
                      return (
                        <button
                          key={link.key}
                          role="menuitem"
                          onClick={() => go(link.key)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-semibold cursor-pointer transition-colors',
                            isActive
                              ? 'bg-[#EEF3F9] text-[#123A6B]'
                              : 'text-[#5B6B82] hover:bg-[#F4F7FB] hover:text-[#101F36]',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {link.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </nav>

            {/* Right actions — mobile menu trigger */}
            <div className="flex items-center gap-3">
              <span className="hidden xl:inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8B99AD]">
                <span className="rb-live-dot" />
                Live data · public access
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-label="Toggle navigation menu"
                className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E3E8EF] text-[#101F36] hover:bg-[#EEF3F9] cursor-pointer"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="lg:hidden border-t border-[#E3E8EF] bg-white">
            <nav className="mx-auto max-w-[1280px] px-4 sm:px-6 py-3 flex flex-col">
              {NAV_ALL.map((link) => {
                const isActive = active === link.key;
                const Icon = link.icon;
                return (
                  <button
                    key={link.key}
                    onClick={() => go(link.key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-3 text-left text-[15px] font-semibold cursor-pointer',
                      isActive
                        ? 'bg-[#EEF3F9] text-[#123A6B]'
                        : 'text-[#5B6B82] hover:bg-[#F4F7FB] hover:text-[#101F36]',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {link.label}
                    {link.highlight && (
                      <span className="rb-live-badge ml-auto">
                        <span className="rb-live-dot animate-pulse" />
                        Live
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1 w-full relative">{children}</main>

      <footer className="border-t border-[#E3E8EF] bg-white">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="RailBuddy"
              width={1254}
              height={1254}
              className="h-7 w-7 object-contain"
            />
            <span className="text-sm font-bold text-[#101F36]">RailBuddy</span>
          </div>
          <p className="text-xs text-[#8B99AD] max-w-xl leading-relaxed">
            Live running status, timetables and delay forecasts are served by NTES and RailRadar. PNR
            lookup, telemetry and coach layouts on this site are demonstration data only.
          </p>
        </div>
      </footer>
    </div>
  );
};
