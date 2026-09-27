'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Train as TrainType, Station } from '../types/train';
import { fetchTrainSearch, RealTrainRef } from '../lib/api';
import { mapTrainRef } from '../lib/realTrains';
import { filterStations, useStationDirectory } from '../lib/useStationDirectory';

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
  travelDate: string;
  setTravelDate: (d: string) => void;
  onSearchStations: () => void;
  onSelectTrain: (train: TrainType) => void;
  searched: boolean;
  /** `hero` renders the landing headline above the card; `plain` renders the card only. */
  variant?: 'hero' | 'plain';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Debounce for the train autocomplete, so each keystroke hits the API once. */
const TRAIN_SEARCH_DEBOUNCE_MS = 300;

export function journeyDateOptions(): string[] {
  return DATE_OPTIONS;
}

/** "Today, 24 Sep 2026" / "Fri, 26 Sep 2026" -> "2026-09-24" (defaults to today). */
export function journeyDateToISO(label: string): string {
  const m = String(label || '').match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  const today = new Date();
  if (!m) return today.toISOString().slice(0, 10);
  const day = m[1].padStart(2, '0');
  const monthName = m[2].charAt(0).toUpperCase() + m[2].slice(1, 3).toLowerCase();
  const monthIdx = MONTHS.indexOf(monthName);
  if (monthIdx === -1) return today.toISOString().slice(0, 10);
  return `${m[3]}-${String(monthIdx + 1).padStart(2, '0')}-${day}`;
}

export const SearchHero: React.FC<SearchHeroProps> = ({
  activeTab,
  setActiveTab,
  sourceCode,
  setSourceCode,
  destCode,
  setDestCode,
  trainQuery,
  setTrainQuery,
  travelDate,
  setTravelDate,
  onSearchStations,
  onSelectTrain,
  searched,
  variant = 'plain',
}) => {
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);
  const [trainDropdownOpen, setTrainDropdownOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');
  const [destFilter, setDestFilter] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  // REAL full Indian Railways station directory (all ~13k stations, MongoDB).
  const { stations, isLive: usingRealStations, loading: stationsLoading, error: stationsError } =
    useStationDirectory();

  const allStations: Station[] = stations;

  const filteredSources = useMemo(
    () => filterStations(allStations, sourceFilter).slice(0, 50),
    [sourceFilter, allStations],
  );

  const filteredDests = useMemo(
    () => filterStations(allStations, destFilter).slice(0, 50),
    [destFilter, allStations],
  );

  // REAL Indian Railways train directory, searched by number or name on demand.
  const [trainResults, setTrainResults] = useState<RealTrainRef[]>([]);
  const [trainSearchLoading, setTrainSearchLoading] = useState<boolean>(false);
  const [trainSearchError, setTrainSearchError] = useState<string | null>(null);
  const [selectedTrainRef, setSelectedTrainRef] = useState<RealTrainRef | null>(null);
  // Label written into the box by pickTrain. Re-querying it would burn provider
  // quota for a result we already have, so the effect skips it.
  const selectedTrainLabelRef = useRef<string | null>(null);

  // Debounced train autocomplete — one provider request per keystroke burst.
  useEffect(() => {
    const q = trainQuery.trim();
    if (!q || q === selectedTrainLabelRef.current) {
      setTrainResults([]);
      setTrainSearchLoading(false);
      setTrainSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setTrainSearchLoading(true);
      setTrainSearchError(null);
      fetchTrainSearch(q, { signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted) return;
          setTrainResults(results);
        })
        .catch((err: unknown) => {
          if ((err as Error).name === 'AbortError') return;
          setTrainResults([]);
          setTrainSearchError((err as Error).message || 'Train directory unavailable.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setTrainSearchLoading(false);
        });
    }, TRAIN_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trainQuery]);

  const handleSwapStations = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const temp = sourceCode;
    setSourceCode(destCode);
    setDestCode(temp);
  };

  const findStation = (code: string) => allStations.find((s) => s.code === code);

  const getStationName = (code: string) => {
    if (!code) return 'Select station';
    const found = findStation(code);
    return found ? found.name : 'Select station';
  };

  const getStationShort = (code: string) => {
    const found = findStation(code);
    if (!found) return 'Station';
    return found.city || found.name;
  };

  const collapseAfterAction = () => {
    if (searched) setIsExpanded(false);
  };

  // Selecting a search result hands a minimal train to the existing tracker,
  // which then pulls the real schedule + live status by train number.
  const pickTrain = (ref: RealTrainRef) => {
    const label = `${ref.number} - ${ref.name}`;
    selectedTrainLabelRef.current = label;
    setSelectedTrainRef(ref);
    setTrainQuery(label);
    setTrainDropdownOpen(false);
    onSelectTrain(mapTrainRef(ref));
    collapseAfterAction();
  };

  // "Search Trains" acts on the chosen result, else the top suggestion.
  const trackTopTrainResult = () => {
    const ref = selectedTrainRef ?? trainResults[0];
    if (ref) pickTrain(ref);
  };

  // ==========================================
  // SEARCHED STATE (COMPACT BAR)
  // ==========================================
  if (searched && !isExpanded) {
    return (
      <section className="px-4 sm:px-6 lg:px-8 max-w-[1280px] mx-auto pt-6">
        <div className="rb-card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {activeTab === 'stations' ? (
              <>
                <span className="text-sm font-semibold text-[#101F36]">
                  {getStationShort(sourceCode)}
                  <span className="ml-1.5 font-mono text-xs text-[#123A6B]">{sourceCode}</span>
                </span>
                <button
                  onClick={handleSwapStations}
                  className="p-1.5 rounded-lg bg-[#F4F7FB] hover:bg-[#EEF3F9] text-[#123A6B] border border-[#E3E8EF] cursor-pointer"
                  title="Swap Stations"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-sm font-semibold text-[#101F36]">
                  {getStationShort(destCode)}
                  <span className="ml-1.5 font-mono text-xs text-[#123A6B]">{destCode}</span>
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold text-[#101F36]">
                <Train className="h-3.5 w-3.5 inline mr-1.5 text-[#123A6B]" />
                {trainQuery || 'Train search'}
              </span>
            )}
            <span className="hidden sm:inline text-[#C9D8EA]">·</span>
            <span className="text-xs font-medium text-[#5B6B82]">{travelDate}</span>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={() => setIsExpanded(true)}
              className="rb-btn rb-btn-secondary rb-btn-sm"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#123A6B]" />
              <span>Modify</span>
            </button>

            <button
              onClick={activeTab === 'stations' ? onSearchStations : trackTopTrainResult}
              className="rb-btn rb-btn-primary rb-btn-sm"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ==========================================
  // FULL CARD: hero headline (home) + search form
  // ==========================================
  return (
    <section
      className={
        variant === 'hero'
          ? 'bg-white border-b border-[#E3E8EF]'
          : 'bg-transparent'
      }
    >
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {variant === 'hero' && (
          <div className="max-w-2xl">
            <span className="rb-eyebrow">Indian Railways · live intelligence</span>
            <h1 className="mt-3 text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-[#101F36] leading-[1.1]">
              Your Next Journey Starts Here
            </h1>
            <p className="mt-3 text-[15px] sm:text-base text-[#5B6B82] leading-relaxed">
              Search trains between stations or look up a specific train for real-time information,
              live running status and AI delay &amp; ETA forecasts.
            </p>
            <div className="mt-5 h-1 w-16 rounded-full bg-[#E07B2C]" />
          </div>
        )}

        {/* Search card */}
        <div className={variant === 'hero' ? 'mt-9 max-w-[880px]' : ''}>
          <div className="rb-card shadow-lift p-5 sm:p-7">
            {/* Search mode toggle */}
            <div className="inline-flex items-center gap-1 rounded-xl bg-[#F4F7FB] border border-[#E3E8EF] p-1">
              <button
                type="button"
                onClick={() => setActiveTab('stations')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold cursor-pointer transition-colors ${
                  activeTab === 'stations'
                    ? 'bg-white text-[#123A6B] shadow-soft'
                    : 'text-[#5B6B82] hover:text-[#101F36]'
                }`}
              >
                <ArrowRightLeft className="h-4 w-4" />
                Between Stations
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('trainNumber')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold cursor-pointer transition-colors ${
                  activeTab === 'trainNumber'
                    ? 'bg-white text-[#123A6B] shadow-soft'
                    : 'text-[#5B6B82] hover:text-[#101F36]'
                }`}
              >
                <Hash className="h-4 w-4" />
                By Train Number
              </button>
            </div>

            {/* Station-to-station search */}
            {activeTab === 'stations' && (
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] md:items-end gap-4">
                  {/* FROM */}
                  <div className="relative">
                    <span className="rb-field-label">From</span>
                    <button
                      type="button"
                      onClick={() => setSourceDropdownOpen(!sourceDropdownOpen)}
                      className="rb-control cursor-pointer text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#101F36] truncate">
                          {sourceCode ? getStationName(sourceCode) : 'Select source station'}
                        </div>
                        <div className="text-[11px] text-[#5B6B82]">
                          {sourceCode ? (
                            <span className="font-mono font-semibold text-[#123A6B]">{sourceCode}</span>
                          ) : (
                            'Station code'
                          )}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 text-[#5B6B82] shrink-0 ml-auto" />
                    </button>

                    {sourceDropdownOpen && (
                      <StationDropdown
                        filter={sourceFilter}
                        setFilter={setSourceFilter}
                        loading={stationsLoading}
                        error={stationsError}
                        isLive={usingRealStations}
                        total={allStations.length}
                        results={filteredSources}
                        emptyLabel={`No station matches “${sourceFilter}”.`}
                        onPick={(code) => {
                          setSourceCode(code);
                          setSourceDropdownOpen(false);
                          setSourceFilter('');
                        }}
                      />
                    )}
                  </div>

                  {/* SWAP */}
                  <div className="flex justify-center md:mb-1 z-10">
                    <button
                      type="button"
                      onClick={handleSwapStations}
                      title="Swap source and destination"
                      className="h-10 w-10 rounded-full bg-[#123A6B] hover:bg-[#0F2F58] text-white flex items-center justify-center shadow-soft cursor-pointer"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                    </button>
                  </div>

                  {/* TO */}
                  <div className="relative">
                    <span className="rb-field-label">To</span>
                    <button
                      type="button"
                      onClick={() => setDestDropdownOpen(!destDropdownOpen)}
                      className="rb-control cursor-pointer text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#101F36] truncate">
                          {destCode ? getStationName(destCode) : 'Select destination station'}
                        </div>
                        <div className="text-[11px] text-[#5B6B82]">
                          {destCode ? (
                            <span className="font-mono font-semibold text-[#123A6B]">{destCode}</span>
                          ) : (
                            'Station code'
                          )}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 text-[#5B6B82] shrink-0 ml-auto" />
                    </button>

                    {destDropdownOpen && (
                      <StationDropdown
                        filter={destFilter}
                        setFilter={setDestFilter}
                        loading={stationsLoading}
                        error={stationsError}
                        isLive={usingRealStations}
                        total={allStations.length}
                        results={filteredDests}
                        emptyLabel={`No station matches “${destFilter}”.`}
                        onPick={(code) => {
                          setDestCode(code);
                          setDestDropdownOpen(false);
                          setDestFilter('');
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Date + Search */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
                  <div className="relative">
                    <span className="rb-field-label">Journey Date</span>
                    <div className="rb-control">
                      <Calendar className="h-4 w-4 text-[#123A6B]" />
                      <select
                        value={travelDate}
                        onChange={(e) => setTravelDate(e.target.value)}
                        className="w-full bg-transparent text-sm font-semibold text-[#101F36] outline-none cursor-pointer appearance-none"
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
                    type="button"
                    onClick={() => {
                      collapseAfterAction();
                      onSearchStations();
                    }}
                    className="rb-btn rb-btn-primary px-7 py-4 text-[15px]"
                  >
                    <Search className="h-4 w-4" />
                    <span>Search Trains</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Train number search */}
            {activeTab === 'trainNumber' && (
              <div className="mt-6 space-y-4">
                <div className="relative">
                  <span className="rb-field-label">Train Number or Name</span>
                  <div className="relative flex items-center">
                    <Search className="absolute left-3.5 h-4 w-4 text-[#8B99AD] pointer-events-none" />
                    <input
                      type="text"
                      value={trainQuery}
                      onChange={(e) => {
                        setTrainQuery(e.target.value);
                        setTrainDropdownOpen(true);
                      }}
                      onFocus={() => setTrainDropdownOpen(true)}
                      placeholder="e.g. 22436, Vande Bharat, Rajdhani…"
                      className="w-full pl-10 pr-4 py-3.5 rounded-[10px] bg-white border border-[#E3E8EF] text-sm font-medium text-[#101F36] placeholder-[#8B99AD] focus:outline-none focus:border-[#1D4E89]"
                    />
                  </div>

                  {trainDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 z-30 mt-2 p-2 rounded-xl bg-white border border-[#E3E8EF] shadow-lift space-y-0.5 max-h-72 overflow-y-auto">
                      {!trainQuery.trim() && (
                        <div className="px-2 py-3 text-[11px] text-[#5B6B82]">
                          Search all Indian Railways trains by number or name — e.g. 12951, Tejas, Rajdhani.
                        </div>
                      )}

                      {trainSearchLoading && (
                        <div className="px-2 py-3 text-[11px] text-[#5B6B82] font-mono flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin text-[#123A6B]" /> Searching trains…
                        </div>
                      )}

                      {trainSearchError && (
                        <div className="px-2 py-3 text-[11px] text-[#B45309] font-medium flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{trainSearchError}</span>
                        </div>
                      )}

                      {!trainSearchLoading && !trainSearchError && trainQuery.trim() && trainResults.length === 0 && (
                        <div className="px-2 py-3 text-[11px] text-[#5B6B82]">
                          No train matches “{trainQuery.trim()}”.
                        </div>
                      )}

                      {trainResults.map((t) => (
                        <button
                          key={t.number}
                          type="button"
                          onClick={() => pickTrain(t)}
                          className="w-full text-left p-2.5 rounded-lg hover:bg-[#F4F7FB] cursor-pointer"
                        >
                          <span className="block text-sm font-semibold text-[#101F36]">
                            <span className="font-mono text-[#123A6B]">{t.number}</span>
                            <span className="text-[#C9D8EA] mx-1.5">·</span>
                            {t.name}
                          </span>
                        </button>
                      ))}

                      {trainResults.length > 0 && (
                        <div className="px-2 py-1.5 text-[10px] font-mono text-[#8B99AD] border-t border-[#E3E8EF] mt-1 pt-2">
                          {trainResults.length} match{trainResults.length === 1 ? '' : 'es'} · RailRadar
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={trackTopTrainResult}
                  className="rb-btn rb-btn-primary w-full py-4 text-[15px]"
                >
                  <Search className="h-4 w-4" />
                  <span>Search Trains</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/* =======================================================================
   Station dropdown — shared by the From / To selectors
   ======================================================================= */

interface StationDropdownProps {
  filter: string;
  setFilter: (value: string) => void;
  loading: boolean;
  error: string | null;
  isLive: boolean;
  total: number;
  results: Station[];
  emptyLabel: string;
  onPick: (code: string) => void;
}

const StationDropdown: React.FC<StationDropdownProps> = ({
  filter,
  setFilter,
  loading,
  error,
  isLive,
  total,
  results,
  emptyLabel,
  onPick,
}) => (
  <div className="absolute top-full left-0 right-0 z-30 mt-2 p-2 rounded-xl bg-white shadow-lift border border-[#E3E8EF] max-h-72 overflow-y-auto">
    <div className="flex items-center gap-2 px-2 py-2 mb-1 border-b border-[#E3E8EF]">
      <MapPin className="h-3.5 w-3.5 text-[#8B99AD]" />
      <input
        type="text"
        placeholder="Search station name or code..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full text-xs outline-none text-[#101F36] placeholder-[#8B99AD] bg-transparent"
        autoFocus
      />
      {loading && <Loader2 className="h-3 w-3 animate-spin text-[#123A6B] shrink-0" />}
    </div>

    {isLive && !loading && (
      <div className="mb-1 px-2 py-1.5 text-[10px] font-mono text-[#0F8A5F] flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {total.toLocaleString()} real IR stations • RailRadar
      </div>
    )}

    {loading && (
      <div className="px-2 py-2 text-[11px] text-[#5B6B82] font-mono flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading all stations…
      </div>
    )}

    {error && (
      <div className="px-2 py-2 text-[11px] text-[#B45309] font-medium flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Real station feed unavailable — using offline catalog.</span>
      </div>
    )}

    <div className="space-y-0.5">
      {results.map((station) => (
        <button
          key={station.code}
          type="button"
          onClick={() => onPick(station.code)}
          className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-[#F4F7FB] flex items-center justify-between cursor-pointer"
        >
          <span className="font-medium text-[#101F36] truncate">
            {station.name}
            {station.city ? <span className="text-[#8B99AD]"> ({station.city})</span> : null}
          </span>
          <span className="font-mono text-[11px] font-semibold text-[#123A6B] shrink-0 ml-2">
            {station.code}
          </span>
        </button>
      ))}
      {!loading && results.length === 0 && (
        <div className="px-2 py-3 text-[11px] text-[#5B6B82]">{emptyLabel}</div>
      )}
    </div>
  </div>
);
