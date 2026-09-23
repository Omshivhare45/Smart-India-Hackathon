'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Train as TrainIcon, Landmark, X, ArrowRight, CornerDownRight } from 'lucide-react';
import { MapLiveTrain, MapStation, fetchMapStations } from '../../lib/api';

const FALLBACK_STATIONS: MapStation[] = [
  { code: 'NDLS', name: 'New Delhi', lat: 28.64177, lng: 77.22027, rank: 'major' },
  { code: 'CNB', name: 'Kanpur Central', lat: 26.4542, lng: 80.3507, rank: 'major' },
  { code: 'PRYJ', name: 'Prayagraj Jn', lat: 25.4484, lng: 81.834, rank: 'major' },
  { code: 'BSB', name: 'Varanasi Jn', lat: 25.32701, lng: 82.986, rank: 'major' },
  { code: 'BPL', name: 'Bhopal Jn', lat: 23.2599, lng: 77.4126, rank: 'major' },
  { code: 'RKMP', name: 'Rani Kamlapati', lat: 23.2081, lng: 77.4372 },
  { code: 'GWL', name: 'Gwalior Jn', lat: 26.2163, lng: 78.1884, rank: 'major' },
  { code: 'AGC', name: 'Agra Cantt', lat: 27.1593, lng: 78.0064, rank: 'major' },
  { code: 'MMCT', name: 'Mumbai Central', lat: 18.9696, lng: 72.8193, rank: 'major' },
  { code: 'CSMT', name: 'CSMT Mumbai', lat: 18.9402, lng: 72.8356, rank: 'major' },
  { code: 'HWH', name: 'Howrah Jn', lat: 22.5839, lng: 88.3434, rank: 'major' },
  { code: 'PNBE', name: 'Patna Jn', lat: 25.6022, lng: 85.1376, rank: 'major' },
  { code: 'MAS', name: 'Chennai Central', lat: 13.0827, lng: 80.2755, rank: 'major' },
  { code: 'SBC', name: 'KSR Bengaluru', lat: 12.9781, lng: 77.5696, rank: 'major' },
  { code: 'ADI', name: 'Ahmedabad Jn', lat: 23.0238, lng: 72.6009, rank: 'major' },
];

interface TrainSearchBarProps {
  trains: MapLiveTrain[];
  selectedTrainNumber: string | null;
  onSelectTrain: (train: MapLiveTrain) => void;
  onSelectStation: (code: string) => void;
  className?: string;
}

const MAX_TRAIN_RESULTS = 6;
const MAX_STATION_RESULTS = 6;

export const TrainSearchBar: React.FC<TrainSearchBarProps> = ({
  trains,
  selectedTrainNumber,
  onSelectTrain,
  onSelectStation,
  className = '',
}) => {
  const [query, setQuery] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [stations, setStations] = useState<MapStation[]>(FALLBACK_STATIONS);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    fetchMapStations()
      .then((res) => {
        if (mounted && res.success && Array.isArray(res.stations) && res.stations.length > 0) {
          setStations(res.stations);
        }
      })
      .catch(() => {/* keep fallback catalogue */});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;

  const filteredTrains = useMemo(() => {
    if (!hasQuery) return trains.slice(0, MAX_TRAIN_RESULTS);
    return trains
      .filter(
        (t) =>
          t.train_number.toLowerCase().includes(q) ||
          t.train_name.toLowerCase().includes(q) ||
          t.current_station.toLowerCase().includes(q) ||
          t.next_station.toLowerCase().includes(q),
      )
      .slice(0, MAX_TRAIN_RESULTS);
  }, [trains, q, hasQuery]);

  const filteredStations = useMemo(() => {
    if (!hasQuery) {
      return stations
        .slice()
        .sort((a, b) => (a.rank === 'major' ? -1 : 1) - (b.rank === 'major' ? -1 : 1))
        .slice(0, MAX_STATION_RESULTS);
    }
    return stations
      .filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, MAX_STATION_RESULTS);
  }, [stations, q, hasQuery]);

  const resultsCount = filteredTrains.length + filteredStations.length;

  const handleSelectTrain = (train: MapLiveTrain) => {
    onSelectTrain(train);
    setQuery(`${train.train_number} — ${train.train_name}`);
    setIsOpen(false);
    setFocusedIdx(-1);
  };

  const handleSelectStation = (st: MapStation) => {
    onSelectStation(st.code);
    setQuery(`${st.code} — ${st.name}`);
    setIsOpen(false);
    setFocusedIdx(-1);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    setFocusedIdx(-1);
    (containerRef.current?.querySelector('input') as HTMLInputElement | null)?.focus();
  };

  const showTrainsSection = filteredTrains.length > 0;
  const showStationsSection = filteredStations.length > 0;
  const showDropdown = !hasQuery || showTrainsSection || showStationsSection;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || !showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((p) => (p + 1) % Math.max(resultsCount, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((p) => (p - 1 < 0 ? resultsCount - 1 : p - 1));
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault();
      const all: Array<{ kind: 'train' | 'station'; item: MapLiveTrain | MapStation }> = [
        ...filteredTrains.map((t) => ({ kind: 'train' as const, item: t })),
        ...filteredStations.map((s) => ({ kind: 'station' as const, item: s })),
      ];
      const pick = all[focusedIdx];
      if (pick?.kind === 'train') handleSelectTrain(pick.item as MapLiveTrain);
      else if (pick?.kind === 'station') handleSelectStation(pick.item as MapStation);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative z-30 pointer-events-auto ${className}`}>
      {/* Search Input Box */}
      <div className="rb-surface-strong flex items-center gap-2.5 h-11 pl-3.5 pr-2 rounded-full focus-within:border-sky-400/40 transition-colors duration-150">
        <Search className="w-4 h-4 text-slate-500 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setFocusedIdx(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search train, station or train number…"
          className="w-full bg-transparent text-[13px] text-slate-100 placeholder-slate-500 focus:outline-none min-w-0"
        />
        <kbd className="hidden md:inline-flex items-center px-1.5 h-5 rounded border border-slate-700/70 text-[9px] font-mono text-slate-600 bg-white/2 shrink-0">
          {query ? 'esc' : '⌘K'}
        </kbd>
        {query && (
          <button
            onClick={handleClear}
            aria-label="Clear search"
            className="p-1 rounded-full text-slate-500 hover:text-white hover:bg-white/8 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Unified Results Dropdown (trains + stations) */}
      {isOpen && showDropdown && (
        <div className="rb-surface-strong absolute left-0 right-0 mt-2 max-h-[22rem] overflow-y-auto rounded-xl rb-scroll rb-anim-fade-up">
          {showTrainsSection && (
            <div>
              <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1.5">
                <span className="rb-label">{hasQuery ? 'Trains' : 'Recently Active'}</span>
                <span className="h-px flex-1 bg-white/6" />
                <span className="text-[9px] font-mono text-slate-600">{filteredTrains.length}</span>
              </div>
              {filteredTrains.map((train, idx) => {
                const isSelected = selectedTrainNumber === train.train_number;
                const isFocused = focusedIdx === idx;
                const delayTone =
                  train.delay_minutes <= 0
                    ? { chip: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20', label: 'ON TIME' }
                    : train.delay_minutes <= 20
                    ? { chip: 'text-amber-300 bg-amber-400/10 border-amber-400/20', label: `+${Math.round(train.delay_minutes)}m` }
                    : { chip: 'text-rose-300 bg-rose-400/10 border-rose-400/20', label: `+${Math.round(train.delay_minutes)}m` };
                return (
                  <button
                    key={train.train_number}
                    onClick={() => handleSelectTrain(train)}
                    className={`w-full px-3.5 py-2 text-left flex items-center gap-3 transition-colors ${
                      isFocused ? 'bg-white/6' : 'hover:bg-white/4'
                    } ${isSelected ? 'bg-sky-400/5' : ''}`}
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-400/10 border border-sky-400/15 text-sky-300 shrink-0">
                      <TrainIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2 min-w-0">
                        <span className="font-mono text-[11.5px] font-bold text-sky-300 tabular-nums">
                          {train.train_number}
                        </span>
                        <span className="text-[12px] font-medium text-slate-200 truncate">
                          {train.train_name}
                        </span>
                      </span>
                      <span className="text-[10.5px] text-slate-500 flex items-center gap-1.5 mt-px font-mono truncate">
                        <span className="truncate">{train.current_station_name || train.current_station || 'Route'}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                        <span className="truncate">{train.next_station_name || train.next_station || 'Next'}</span>
                        {train.speed !== null && (
                          <span className="text-slate-600 shrink-0">• {Math.round(train.speed)} km/h</span>
                        )}
                      </span>
                    </span>
                    <span
                      className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${delayTone.chip}`}
                    >
                      {delayTone.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {showStationsSection && (
            <div>
              <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1.5">
                <span className="rb-label">Stations</span>
                <span className="h-px flex-1 bg-white/6" />
                <span className="text-[9px] font-mono text-slate-600">{filteredStations.length}</span>
              </div>
              {filteredStations.map((st, idx) => {
                const isFocused = focusedIdx === filteredTrains.length + idx;
                return (
                  <button
                    key={st.code}
                    onClick={() => handleSelectStation(st)}
                    className={`w-full px-3.5 py-2 text-left flex items-center gap-3 transition-colors ${
                      isFocused ? 'bg-white/6' : 'hover:bg-white/4'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-400/10 border border-emerald-400/15 text-emerald-300 shrink-0">
                      <Landmark className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[11.5px] font-bold text-emerald-300">
                          {st.code}
                        </span>
                        <span className="text-[12px] font-medium text-slate-200 truncate">
                          {st.name}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-600 mt-px block">
                        {st.rank === 'major' ? 'Major hub' : 'Station'}
                      </span>
                    </span>
                    <CornerDownRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {hasQuery && !showTrainsSection && !showStationsSection && (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-slate-400 font-medium">No matching trains or stations</p>
              <p className="text-[10px] font-mono text-slate-600 mt-1">
                Try a train number like 22436 or a station code
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};