'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  ArrowRightLeft,
  Search,
  MapPin,
  Train as TrainIcon,
  Calendar,
  Radio,
  ChevronDown,
  ArrowRight,
  SlidersHorizontal,
  TrainFront,
  Clock,
} from 'lucide-react';
import { Train } from '../types/train';
import { STATIONS, POPULAR_ROUTES, TRAINS } from '../data/trainData';

export type SearchTab = 'stations' | 'trainNumber';

interface SearchHeroProps {
  activeTab: SearchTab;
  setActiveTab: (tab: SearchTab) => void;
  sourceCode: string;
  setSourceCode: (code: string) => void;
  destCode: string;
  setDestCode: (code: string) => void;
  trainQuery: string;
  setTrainQuery: (q: string) => void;
  onSearchStations: () => void;
  onSelectTrain: (train: Train) => void;
  searched: boolean;
  onModifySearch?: () => void;
}

const DATE_OPTIONS = (() => {
  const opts: string[] = [];
  const today = new Date();
  const labels = ['Today', 'Tomorrow'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const label = i < 2 ? `${labels[i]}, ${day}` : d.toLocaleDateString('en-IN', { weekday: 'short' }) + ', ' + day;
    opts.push(label);
  }
  return opts;
})();

export const SearchHero: React.FC<SearchHeroProps> = ({
  activeTab,
  setActiveTab,
  sourceCode,
  setSourceCode,
  destCode,
  setDestCode,
  trainQuery,
  setTrainQuery,
  onSearchStations,
  onSelectTrain,
  searched,
  onModifySearch,
}) => {
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);
  const [trainDropdownOpen, setTrainDropdownOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');
  const [destFilter, setDestFilter] = useState('');
  const [travelDate, setTravelDate] = useState(DATE_OPTIONS[0]);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const filteredSources = useMemo(() => {
    return STATIONS.filter(
      (s) =>
        s.name.toLowerCase().includes(sourceFilter.toLowerCase()) ||
        s.code.toLowerCase().includes(sourceFilter.toLowerCase()) ||
        s.city.toLowerCase().includes(sourceFilter.toLowerCase())
    );
  }, [sourceFilter]);

  const filteredDests = useMemo(() => {
    return STATIONS.filter(
      (s) =>
        s.name.toLowerCase().includes(destFilter.toLowerCase()) ||
        s.code.toLowerCase().includes(destFilter.toLowerCase()) ||
        s.city.toLowerCase().includes(destFilter.toLowerCase())
    );
  }, [destFilter]);

  const trainSuggestions = useMemo(() => {
    if (!trainQuery.trim()) return TRAINS.slice(0, 5);
    const q = trainQuery.toLowerCase();
    return TRAINS.filter(
      (t) =>
        t.trainNumber.includes(q) ||
        t.trainName.toLowerCase().includes(q) ||
        t.sourceName.toLowerCase().includes(q) ||
        t.destinationName.toLowerCase().includes(q) ||
        t.sourceCode.toLowerCase().includes(q) ||
        t.destinationCode.toLowerCase().includes(q)
    );
  }, [trainQuery]);

  const handleSwapStations = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsSwapping(true);
    const temp = sourceCode;
    setSourceCode(destCode);
    setDestCode(temp);
    setTimeout(() => setIsSwapping(false), 300);
  };

  const getStationName = (code: string) => {
    const found = STATIONS.find((s) => s.code === code);
    return found ? `${found.name} (${found.code})` : code;
  };

  const getStationShort = (code: string) => {
    const found = STATIONS.find((s) => s.code === code);
    return found ? found.city : code;
  };

  const collapseAfterAction = () => {
    if (searched) setIsExpanded(false);
  };

  // ==========================================
  // CASE 1: SEARCHED STATE (COMPACT TOP BAR)
  // ==========================================
  if (searched && !isExpanded) {
    return (
      <section className="pt-4 pb-4 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-soft border border-[#E2E8F0] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[#EEF4FC] text-[#1D4ED8] flex items-center justify-center font-bold text-xs">
                {sourceCode}
              </span>
              <span className="text-sm font-bold text-[#13213E]">{getStationShort(sourceCode)}</span>
            </div>

            <button
              onClick={handleSwapStations}
              className={`p-1.5 rounded-full bg-[#F8FAFC] hover:bg-[#EEF4FC] text-[#1D4ED8] border border-[#E2E8F0] transition-transform ${
                isSwapping ? 'rotate-180' : ''
              }`}
              title="Swap Stations"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[#EEF4FC] text-[#1D4ED8] flex items-center justify-center font-bold text-xs">
                {destCode}
              </span>
              <span className="text-sm font-bold text-[#13213E]">{getStationShort(destCode)}</span>
            </div>

            <span className="text-[#B6C2D4] hidden sm:inline">•</span>

            <span className="text-xs font-medium text-[#64748B] bg-[#F8FAFC] px-3 py-1 rounded-full border border-[#E2E8F0]">
              {travelDate}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={() => setIsExpanded(true)}
              className="px-4 py-2 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#13213E] text-xs font-bold border border-[#E2E8F0] hover:border-[#1D4ED8]/40 transition-all flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span>Modify Route</span>
            </button>

            <button
              onClick={onSearchStations}
              className="px-5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-xs font-bold shadow-[0_8px_20px_-6px_rgba(29,78,216,0.4)] transition-all flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Refresh Trains</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ==========================================
  // CASE 2: FULL HORIZONTAL HERO (search left / image right)
  // ==========================================
  return (
    <section
      className={`relative overflow-hidden ${
        searched ? 'pt-6 pb-8' : 'pt-10 pb-14 sm:pt-14 sm:pb-16'
      }`}
    >
      {/* Soft light backdrop */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#EFF6FF] via-[#F8FAFC] to-[#F8FAFC]" />
      <div className="absolute -top-32 -right-24 w-[480px] h-[480px] rounded-full bg-[#2563EB]/[0.06] blur-3xl -z-10" />
      <div className="absolute -bottom-40 -left-24 w-[420px] h-[420px] rounded-full bg-[#0E7490]/[0.05] blur-3xl -z-10" />

      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* ================= LEFT: SEARCH COLUMN ================= */}
          <div>
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-white text-[#1D4ED8] border border-[#E2E8F0] shadow-xs mb-5">
              <Radio className="w-3.5 h-3.5 text-[#1D4ED8]" />
              Train Search &amp; Live Status
            </div>

            {/* Headline — on the open background */}
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-[#13213E] tracking-tight leading-tight">
              Plan your journey across
              <span className="block text-[#1D4ED8]">Indian Railways.</span>
            </h1>
            <p className="text-sm sm:text-base text-[#64748B] mt-3 max-w-md">
              Search trains between any two stations, check live running status and
              get platform details for your next trip.
            </p>

            {/* Search panel */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_16px_48px_-16px_rgba(30,58,138,0.18)] border border-[#E2E8F0] mt-8">
              {/* Tabs: Find Trains | Find Train */}
              <div className="flex items-center gap-1.5 p-1.5 bg-[#F1F5F9] rounded-2xl border border-[#E2E8F0] mb-5">
                <button
                  onClick={() => setActiveTab('stations')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
                    activeTab === 'stations'
                      ? 'bg-white text-[#1D4ED8] shadow-soft border border-[#E2E8F0]'
                      : 'text-[#64748B] hover:text-[#13213E]'
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4 text-[#1D4ED8]" />
                  <span>Find Trains</span>
                </button>

                <button
                  onClick={() => setActiveTab('trainNumber')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
                    activeTab === 'trainNumber'
                      ? 'bg-white text-[#1D4ED8] shadow-soft border border-[#E2E8F0]'
                      : 'text-[#64748B] hover:text-[#13213E]'
                  }`}
                >
                  <TrainIcon className="w-4 h-4 text-[#1D4ED8]" />
                  <span>Find Train</span>
                </button>
              </div>

              {/* TAB 1: FIND TRAINS (source → destination) */}
              {activeTab === 'stations' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] md:items-end gap-3">
                    {/* FROM STATION */}
                    <div className="relative">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1.5">
                        From Station
                      </label>
                      <div
                        onClick={() => setSourceDropdownOpen(!sourceDropdownOpen)}
                        className="flex items-center justify-between p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1D4ED8]/50 cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 shrink-0 rounded-xl bg-[#EEF4FC] flex items-center justify-center text-[#1D4ED8]">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#13213E] truncate">{getStationName(sourceCode)}</div>
                            <div className="text-xs text-[#64748B]">{getStationShort(sourceCode)}</div>
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-[#94A3B8] ml-2 shrink-0" />
                      </div>

                      <AnimatePresence>
                        {sourceDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="absolute top-full left-0 right-0 z-30 mt-2 p-3 bg-white rounded-2xl shadow-card-hover border border-[#E2E8F0] max-h-60 overflow-y-auto"
                          >
                            <input
                              type="text"
                              placeholder="Type station name or code..."
                              value={sourceFilter}
                              onChange={(e) => setSourceFilter(e.target.value)}
                              className="w-full px-3 py-2 text-xs rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] focus:outline-none focus:border-[#1D4ED8] mb-2 text-[#13213E]"
                              autoFocus
                            />
                            <div className="space-y-1">
                              {filteredSources.map((station) => (
                                <button
                                  key={station.code}
                                  onClick={() => {
                                    setSourceCode(station.code);
                                    setSourceDropdownOpen(false);
                                    setSourceFilter('');
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-[#F4F7FB] flex items-center justify-between group transition-colors cursor-pointer"
                                >
                                  <span className="font-semibold text-[#13213E] group-hover:text-[#1D4ED8]">
                                    {station.name} ({station.city})
                                  </span>
                                  <span className="font-mono font-bold text-[#64748B]">{station.code}</span>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* SWAP BUTTON */}
                    <div className="flex justify-center md:mb-[10px] z-10">
                      <button
                        onClick={handleSwapStations}
                        title="Swap Origin and Destination"
                        className={`w-11 h-11 rounded-full bg-[#1D4ED8] text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(29,78,216,0.4)] hover:bg-[#2563EB] active:scale-95 transition-all duration-300 cursor-pointer border-4 border-white ${
                          isSwapping ? 'rotate-180' : ''
                        }`}
                      >
                        <ArrowRightLeft className="w-4.5 h-4.5" />
                      </button>
                    </div>

                    {/* TO STATION */}
                    <div className="relative">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1.5">
                        To Station
                      </label>
                      <div
                        onClick={() => setDestDropdownOpen(!destDropdownOpen)}
                        className="flex items-center justify-between p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1D4ED8]/50 cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 shrink-0 rounded-xl bg-[#EEF4FC] flex items-center justify-center text-[#1D4ED8]">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#13213E] truncate">{getStationName(destCode)}</div>
                            <div className="text-xs text-[#64748B]">{getStationShort(destCode)}</div>
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-[#94A3B8] ml-2 shrink-0" />
                      </div>

                      <AnimatePresence>
                        {destDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="absolute top-full left-0 right-0 z-30 mt-2 p-3 bg-white rounded-2xl shadow-card-hover border border-[#E2E8F0] max-h-60 overflow-y-auto"
                          >
                            <input
                              type="text"
                              placeholder="Type destination station or code..."
                              value={destFilter}
                              onChange={(e) => setDestFilter(e.target.value)}
                              className="w-full px-3 py-2 text-xs rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] focus:outline-none focus:border-[#1D4ED8] mb-2 text-[#13213E]"
                              autoFocus
                            />
                            <div className="space-y-1">
                              {filteredDests.map((station) => (
                                <button
                                  key={station.code}
                                  onClick={() => {
                                    setDestCode(station.code);
                                    setDestDropdownOpen(false);
                                    setDestFilter('');
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-[#F4F7FB] flex items-center justify-between group transition-colors cursor-pointer"
                                >
                                  <span className="font-semibold text-[#13213E] group-hover:text-[#1D4ED8]">
                                    {station.name} ({station.city})
                                  </span>
                                  <span className="font-mono font-bold text-[#64748B]">{station.code}</span>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Date + Search */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 pt-1">
                    <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-[#1D4ED8]" />
                      <div className="flex-1">
                        <span className="block text-[10px] uppercase font-bold text-[#64748B]">Journey Date</span>
                        <select
                          value={travelDate}
                          onChange={(e) => setTravelDate(e.target.value)}
                          className="w-full bg-transparent text-xs font-bold text-[#13213E] outline-none cursor-pointer appearance-none"
                        >
                          {DATE_OPTIONS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        collapseAfterAction();
                        onSearchStations();
                      }}
                      className="sm:w-auto px-8 py-3.5 rounded-2xl bg-[#1D4ED8] hover:bg-[#2563EB] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_rgba(29,78,216,0.5)] active:scale-[0.99] transition-all duration-200 cursor-pointer"
                    >
                      <Search className="w-4 h-4" />
                      <span>Find Trains</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: FIND TRAIN (number / name) */}
              {activeTab === 'trainNumber' && (
                <div className="space-y-4">
                  <div className="relative">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1.5">
                      Train Number or Train Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#1D4ED8]">
                        <Search className="w-5 h-5" />
                      </div>
                      <input
                        type="text"
                        value={trainQuery}
                        onChange={(e) => {
                          setTrainQuery(e.target.value);
                          setTrainDropdownOpen(true);
                        }}
                        onFocus={() => setTrainDropdownOpen(true)}
                        placeholder="e.g. 22436, Vande Bharat, Rajdhani, 12951..."
                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#13213E] placeholder-[#94A3B8] text-sm font-semibold focus:outline-none focus:border-[#1D4ED8] transition-all"
                      />
                    </div>

                    {trainDropdownOpen && trainSuggestions.length > 0 && (
                      <div className="mt-2 p-2 bg-white rounded-2xl border border-[#E2E8F0] shadow-card-hover space-y-1">
                        {trainSuggestions.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => {
                              onSelectTrain(t);
                              setTrainQuery(`${t.trainNumber} - ${t.trainName}`);
                              setTrainDropdownOpen(false);
                              collapseAfterAction();
                            }}
                            className="w-full text-left p-3 rounded-xl hover:bg-[#F4F7FB] transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs font-bold px-2 py-1 rounded-md bg-[#EEF4FC] text-[#1D4ED8]">
                                {t.trainNumber}
                              </span>
                              <div>
                                <div className="text-sm font-bold text-[#13213E] group-hover:text-[#1D4ED8]">
                                  {t.trainName}
                                </div>
                                <div className="text-xs text-[#64748B]">
                                  {t.sourceName} → {t.destinationName}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-2">
                      Popular Trains
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {TRAINS.slice(0, 4).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            onSelectTrain(t);
                            collapseAfterAction();
                          }}
                          className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1D4ED8] text-left transition-all group flex items-center justify-between cursor-pointer"
                        >
                          <div>
                            <div className="text-xs font-bold text-[#13213E] group-hover:text-[#1D4ED8]">
                              {t.trainNumber} {t.trainName}
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              {t.sourceCode} → {t.destinationCode}
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#1D4ED8] group-hover:translate-x-1 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick access: trending routes */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#64748B] mr-1">
                <TrainFront className="w-4 h-4 text-[#1D4ED8]" />
                Trending Routes:
              </span>
              {POPULAR_ROUTES.slice(0, 4).map((route, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSourceCode(route.from);
                    setDestCode(route.to);
                    setActiveTab('stations');
                    collapseAfterAction();
                    onSearchStations();
                  }}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white hover:bg-[#EEF4FC] text-[#4A5A79] hover:text-[#1D4ED8] border border-[#E2E8F0] hover:border-[#1D4ED8]/40 transition-all duration-200 cursor-pointer shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                >
                  {route.label}
                </button>
              ))}
            </div>

            {/* Trust strip */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-semibold text-[#64748B]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#1D4ED8]" />
                Live running status
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#1D4ED8]" />
                Platform &amp; schedule info
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#0E7490]" />
                Regional rail network
              </span>
            </div>
          </div>

          {/* ================= RIGHT: HERO IMAGE ================= */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-3xl overflow-hidden border border-[#E2E8F0] shadow-[0_24px_64px_-24px_rgba(30,58,138,0.35)] aspect-[4/3] min-h-[440px]">
              <Image
                src="/hero.avif"
                alt="High-speed passenger train across the Indian rail network"
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F1E3D]/60 via-transparent to-transparent" />

              {/* Caption chip */}
              <div className="absolute bottom-4 left-4 right-4">
                <div className="inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur border border-white/60 shadow-lg">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <span className="block text-[11px] font-bold text-[#13213E] leading-none">
                      Rail traffic rolling smoothly
                    </span>
                    <span className="block text-[10px] text-[#64748B] mt-0.5 leading-none">
                      Search trains to check status &amp; platforms
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};