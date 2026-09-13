'use client';

import React, { useState, useMemo } from 'react';
import {
  ArrowRightLeft,
  Search,
  MapPin,
  ChevronDown,
  ArrowRight,
  Calendar,
  SlidersHorizontal,
  Train,
  Hash,
} from 'lucide-react';
import { Train as TrainType } from '../types/train';
import { STATIONS, TRAINS } from '../data/trainData';

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
  onSelectTrain: (train: TrainType) => void;
  searched: boolean;
}

const DATE_OPTIONS = (() => {
  const opts: string[] = [];
  const today = new Date();
  const labels = ['Today', 'Tomorrow'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
}) => {
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);
  const [trainDropdownOpen, setTrainDropdownOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');
  const [destFilter, setDestFilter] = useState('');
  const [travelDate, setTravelDate] = useState(DATE_OPTIONS[0]);
  const [isExpanded, setIsExpanded] = useState(true);

  const filteredSources = useMemo(
    () =>
      STATIONS.filter(
        (s) =>
          s.name.toLowerCase().includes(sourceFilter.toLowerCase()) ||
          s.code.toLowerCase().includes(sourceFilter.toLowerCase()) ||
          s.city.toLowerCase().includes(sourceFilter.toLowerCase())
      ),
    [sourceFilter]
  );

  const filteredDests = useMemo(
    () =>
      STATIONS.filter(
        (s) =>
          s.name.toLowerCase().includes(destFilter.toLowerCase()) ||
          s.code.toLowerCase().includes(destFilter.toLowerCase()) ||
          s.city.toLowerCase().includes(destFilter.toLowerCase())
      ),
    [destFilter]
  );

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
    const temp = sourceCode;
    setSourceCode(destCode);
    setDestCode(temp);
  };

  const getStationName = (code: string) => {
    const found = STATIONS.find((s) => s.code === code);
    return found ? `${found.name} (${found.code})` : 'Select station';
  };

  const getStationShort = (code: string) => {
    const found = STATIONS.find((s) => s.code === code);
    return found ? found.city : 'Station';
  };

  const collapseAfterAction = () => {
    if (searched) setIsExpanded(false);
  };

  // ==========================================
  // SEARCHED STATE (COMPACT BAR)
  // ==========================================
  if (searched && !isExpanded) {
    return (
      <section className="pt-4 pb-4 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-none p-4 border border-[#E2E8F0] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {activeTab === 'stations' ? (
              <>
                <span className="text-sm font-bold text-[#13213E]">{getStationShort(sourceCode)}</span>
                <button
                  onClick={handleSwapStations}
                  className="p-1.5 rounded-none bg-[#F8FAFC] hover:bg-[#EEF4FC] text-[#1D4ED8] border border-[#E2E8F0]"
                  title="Swap Stations"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-bold text-[#13213E]">{getStationShort(destCode)}</span>
              </>
            ) : (
              <span className="text-sm font-bold text-[#13213E]">
                <Train className="w-3.5 h-3.5 inline mr-1.5" />
                {trainQuery || 'Train search'}
              </span>
            )}
            <span className="text-[#B6C2D4] hidden sm:inline">·</span>
            <span className="text-xs font-medium text-[#64748B]">{travelDate}</span>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={() => setIsExpanded(true)}
              className="px-4 py-2 rounded-none text-[#13213E] text-xs font-semibold border border-[#E2E8F0] hover:border-[#1D4ED8]/40 flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span>Modify</span>
            </button>

            <button
              onClick={activeTab === 'stations' ? onSearchStations : () => {
                if (trainSuggestions[0]) onSelectTrain(trainSuggestions[0]);
              }}
              className="px-5 py-2 rounded-none bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ==========================================
  // FULL HERO: combined search card + hero image
  // ==========================================
  return (
    <section className="relative min-h-screen flex items-center border-b border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden">
      {/* Full hero background image */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(/hero.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-0 w-full max-w-[1280px] mx-auto">
        <div className="lg:max-w-[700px]">
          {/* Search card */}
          <div className="bg-white rounded-none border border-[#E2E8F0] p-8 sm:p-10 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.3)]">
            {/* Heading */}
            <h1 className="text-2xl sm:text-3xl font-bold text-[#13213E] tracking-tight">
              Your Next Journey Starts Here
            </h1>
            <p className="mt-2 text-[15px] text-[#64748B]">
              Search trains between stations or look up a specific train for real-time information.
            </p>

            {/* Search mode toggle */}
            <div className="mt-6 inline-flex items-center bg-[#F1F5F9] rounded-none p-1 border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setActiveTab('stations')}
                className={`flex items-center gap-2 px-4 py-2 rounded-none text-sm font-semibold ${
                  activeTab === 'stations'
                    ? 'bg-white text-[#1D4ED8] border border-[#E2E8F0]'
                    : 'text-[#64748B] hover:text-[#13213E]'
                }`}
              >
                <ArrowRightLeft className="w-4 h-4" />
                Between Stations
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('trainNumber')}
                className={`flex items-center gap-2 px-4 py-2 rounded-none text-sm font-semibold ${
                  activeTab === 'trainNumber'
                    ? 'bg-white text-[#1D4ED8] border border-[#E2E8F0]'
                    : 'text-[#64748B] hover:text-[#13213E]'
                }`}
              >
                <Hash className="w-4 h-4" />
                By Train Number
              </button>
            </div>

            {/* Station-to-station search */}
            {activeTab === 'stations' && (
              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] md:items-end gap-4">
                  {/* FROM */}
                  <div className="relative">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
                      From
                    </label>
                    <button
                      type="button"
                      onClick={() => setSourceDropdownOpen(!sourceDropdownOpen)}
                      className="w-full flex items-center justify-between gap-2 px-4 py-4 rounded-none bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1D4ED8]/60 cursor-pointer text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#13213E] truncate">
                          {sourceCode ? getStationName(sourceCode) : 'Select source station'}
                        </div>
                        <div className="text-[11px] text-[#64748B]">{getStationShort(sourceCode)}</div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-[#64748B] shrink-0" />
                    </button>

                    {sourceDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 z-30 mt-2 p-2.5 bg-white rounded-none shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] border border-[#E2E8F0] max-h-64 overflow-y-auto">
                        <div className="flex items-center gap-2 px-2 py-2 mb-1 border-b border-[#E2E8F0]">
                          <MapPin className="w-3.5 h-3.5 text-[#64748B]" />
                          <input
                            type="text"
                            placeholder="Search station name or code..."
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                            className="w-full text-xs outline-none text-[#13213E] placeholder-[#94A3B8] bg-transparent"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-0.5">
                          {filteredSources.map((station) => (
                            <button
                              key={station.code}
                              type="button"
                              onClick={() => {
                                setSourceCode(station.code);
                                setSourceDropdownOpen(false);
                                setSourceFilter('');
                              }}
                              className="w-full text-left px-3 py-2 rounded-none text-xs hover:bg-[#F8F9FC] flex items-center justify-between cursor-pointer"
                            >
                              <span className="font-medium text-[#13213E]">
                                {station.name}{' '}
                                <span className="text-[#94A3B8]">({station.city})</span>
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-[#1D4ED8]">
                                {station.code}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SWAP */}
                  <div className="flex justify-center md:mb-1 z-10">
                    <button
                      type="button"
                      onClick={handleSwapStations}
                      title="Swap source and destination"
                      className="w-10 h-10 rounded-none bg-[#1D4ED8] hover:bg-[#2563EB] text-white flex items-center justify-center border-2 border-white"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                    </button>
                  </div>

                  {/* TO */}
                  <div className="relative">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
                      To
                    </label>
                    <button
                      type="button"
                      onClick={() => setDestDropdownOpen(!destDropdownOpen)}
                      className="w-full flex items-center justify-between gap-2 px-4 py-4 rounded-none bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1D4ED8]/60 cursor-pointer text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#13213E] truncate">
                          {destCode ? getStationName(destCode) : 'Select destination station'}
                        </div>
                        <div className="text-[11px] text-[#64748B]">{getStationShort(destCode)}</div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-[#64748B] shrink-0" />
                    </button>

                    {destDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 z-30 mt-2 p-2.5 bg-white rounded-none shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] border border-[#E2E8F0] max-h-64 overflow-y-auto">
                        <div className="flex items-center gap-2 px-2 py-2 mb-1 border-b border-[#E2E8F0]">
                          <MapPin className="w-3.5 h-3.5 text-[#64748B]" />
                          <input
                            type="text"
                            placeholder="Search station name or code..."
                            value={destFilter}
                            onChange={(e) => setDestFilter(e.target.value)}
                            className="w-full text-xs outline-none text-[#13213E] placeholder-[#94A3B8] bg-transparent"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-0.5">
                          {filteredDests.map((station) => (
                            <button
                              key={station.code}
                              type="button"
                              onClick={() => {
                                setDestCode(station.code);
                                setDestDropdownOpen(false);
                                setDestFilter('');
                              }}
                              className="w-full text-left px-3 py-2 rounded-none text-xs hover:bg-[#F8F9FC] flex items-center justify-between cursor-pointer"
                            >
                              <span className="font-medium text-[#13213E]">
                                {station.name}{' '}
                                <span className="text-[#94A3B8]">({station.city})</span>
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-[#1D4ED8]">
                                {station.code}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Date + Search */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
                  <div className="relative">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
                      Journey Date
                    </label>
                    <div className="flex items-center gap-2.5 px-4 py-4 rounded-none bg-[#F8FAFC] border border-[#E2E8F0]">
                      <Calendar className="w-4 h-4 text-[#1D4ED8]" />
                      <select
                        value={travelDate}
                        onChange={(e) => setTravelDate(e.target.value)}
                        className="w-full bg-transparent text-sm font-semibold text-[#13213E] outline-none cursor-pointer appearance-none"
                      >
                        {DATE_OPTIONS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      collapseAfterAction();
                      onSearchStations();
                    }}
                    className="flex items-center justify-center gap-2 px-8 py-4 rounded-none bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-base font-semibold cursor-pointer"
                  >
                    <Search className="w-4 h-4" />
                    <span>Search Trains</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Train number search */}
            {activeTab === 'trainNumber' && (
              <div className="mt-6 space-y-5">
                <div className="relative">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
                    Train Number or Name
                  </label>
                  <div className="relative flex items-center">
                    <Search className="absolute left-3.5 w-4 h-4 text-[#64748B] pointer-events-none" />
                    <input
                      type="text"
                      value={trainQuery}
                      onChange={(e) => {
                        setTrainQuery(e.target.value);
                        setTrainDropdownOpen(true);
                      }}
                      onFocus={() => setTrainDropdownOpen(true)}
                      placeholder="e.g. 22436, Vande Bharat, Rajdhani…"
                      className="w-full pl-10 pr-4 py-4 rounded-none bg-[#F8FAFC] border border-[#E2E8F0] text-sm font-medium text-[#13213E] placeholder-[#94A3B8] focus:outline-none focus:border-[#1D4ED8]/60"
                    />
                  </div>

                  {trainDropdownOpen && trainSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-30 mt-2 p-2 bg-white rounded-none border border-[#E2E8F0] shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] space-y-0.5 max-h-72 overflow-y-auto">
                      {trainSuggestions.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onSelectTrain(t);
                            setTrainQuery(`${t.trainNumber} - ${t.trainName}`);
                            setTrainDropdownOpen(false);
                            collapseAfterAction();
                          }}
                          className="w-full text-left p-2.5 rounded-none hover:bg-[#F8F9FC] cursor-pointer"
                        >
                          <span className="block text-sm font-semibold text-[#13213E]">
                            {t.trainNumber} · {t.trainName}
                          </span>
                          <span className="block text-xs text-[#64748B] mt-0.5">
                            {t.sourceName} → {t.destinationName}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    collapseAfterAction();
                    if (trainSuggestions[0]) onSelectTrain(trainSuggestions[0]);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-none bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-base font-semibold cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>Search Trains</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
