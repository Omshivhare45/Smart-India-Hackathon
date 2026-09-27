'use client';

import React, { useMemo, useState } from 'react';
import { Search, MapPin, Loader2, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { filterStations, useStationDirectory } from '../lib/useStationDirectory';

interface StationDirectoryProps {
  /** Station whose terminal board is currently open. */
  selectedCode: string;
  onSelect: (code: string) => void;
}

const PAGE_SIZE = 60;

export const StationDirectory: React.FC<StationDirectoryProps> = ({ selectedCode, onSelect }) => {
  const { stations, isLive, loading, error } = useStationDirectory();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const matches = useMemo(() => filterStations(stations, query), [stations, query]);
  const visible = useMemo(() => matches.slice(0, limit), [matches, limit]);

  return (
    <section className="rb-card p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#E3E8EF]">
        <div>
          <span className="rb-eyebrow">Station directory</span>
          <h2 className="mt-1.5 text-lg font-bold text-[#101F36]">Search Indian Railways stations</h2>
          <p className="mt-1 text-xs text-[#5B6B82]">
            Station name, code, city or state — served by the MongoDB-backed catalogue.
          </p>
        </div>
        <span className="rb-pill w-fit border-emerald-200 bg-emerald-50 text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {isLive ? `${stations.length.toLocaleString()} stations · live` : 'Offline catalogue'}
        </span>
      </div>

      <div className="mt-5 rb-control">
        <Search className="h-4 w-4 text-[#8B99AD] shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE_SIZE);
          }}
          placeholder="Search by station name, code, city or state…"
          className="w-full bg-transparent text-sm font-medium text-[#101F36] placeholder-[#8B99AD] outline-none"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[#123A6B] shrink-0" />}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Live station feed unavailable — showing the offline catalogue.</span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-[11px] font-mono text-[#8B99AD]">
        <span>
          {query.trim() ? `${matches.length.toLocaleString()} match${matches.length === 1 ? '' : 'es'}` : `${stations.length.toLocaleString()} stations`}
        </span>
        {visible.length < matches.length && (
          <span>
            showing {visible.length} of {matches.length.toLocaleString()}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {visible.map((station) => {
          const isSelected = station.code === selectedCode;
          return (
            <button
              key={station.code}
              type="button"
              onClick={() => onSelect(station.code)}
              className={`group flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'border-[#C9D8EA] bg-[#EEF3F9]'
                  : 'border-[#E3E8EF] bg-white hover:border-[#C9D8EA] hover:bg-[#FCFDFF]'
              }`}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-[#123A6B]">{station.code}</span>
                  {station.state ? (
                    <span className="text-[10px] uppercase font-semibold text-[#8B99AD]">{station.state}</span>
                  ) : null}
                </span>
                <span className="block mt-0.5 text-sm font-semibold text-[#101F36] truncate">
                  {station.name}
                </span>
                {station.city ? (
                  <span className="block text-[11px] text-[#5B6B82] truncate">{station.city}</span>
                ) : null}
              </span>
              {isSelected ? (
                <MapPin className="h-4 w-4 shrink-0 text-[#123A6B]" />
              ) : (
                <ArrowUpRight className="h-4 w-4 shrink-0 text-[#C9D8EA] group-hover:text-[#123A6B] transition-colors" />
              )}
            </button>
          );
        })}
      </div>

      {!loading && visible.length === 0 && (
        <p className="mt-4 rounded-lg bg-[#F4F7FB] border border-dashed border-[#CFD8E4] px-3 py-3 text-xs text-[#5B6B82]">
          No station matches “{query.trim()}”.
        </p>
      )}

      {visible.length < matches.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="rb-btn rb-btn-secondary rb-btn-sm mt-4 w-full"
        >
          Show more stations
        </button>
      )}
    </section>
  );
};
