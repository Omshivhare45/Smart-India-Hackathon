'use client';

import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Crosshair,
  RotateCcw,
  Layers,
  Train as TrainIcon,
  Landmark,
  Route as RouteIcon,
  Activity,
  RefreshCw,
  Map as MapIcon,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   LIVE STATUS CHIP — compact, sits beside the command/search bar
   ───────────────────────────────────────────────────────────── */
interface MapStatusChipProps {
  trainCount: number;
  lastUpdatedSecondsAgo: number;
  isRefreshing: boolean;
  onRefreshNow: () => void;
  isDemo: boolean;
  isConnectionIssue: boolean;
}

export const MapStatusChip: React.FC<MapStatusChipProps> = ({
  trainCount,
  lastUpdatedSecondsAgo,
  isRefreshing,
  onRefreshNow,
  isDemo,
  isConnectionIssue,
}) => {
  const updateText =
    lastUpdatedSecondsAgo === 0
      ? 'just now'
      : lastUpdatedSecondsAgo < 60
      ? `${lastUpdatedSecondsAgo}s ago`
      : `${Math.floor(lastUpdatedSecondsAgo / 60)}m ago`;

  const tone = isConnectionIssue
    ? { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400/25', label: 'Connection Issue' }
    : isDemo
    ? { dot: 'bg-violet-400', text: 'text-violet-300', border: 'border-violet-400/25', label: 'Demo Data' }
    : { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-400/25', label: 'LIVE' };

  return (
    <div
      className={`rb-surface pointer-events-auto select-none flex items-center gap-2.5 rounded-full pl-3 pr-1.5 h-10 border ${tone.border} rb-anim-fade-in`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {!isConnectionIssue && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${tone.dot} opacity-60`}
            style={{ animation: 'rb-breathe 2s ease-in-out infinite' }}
          />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${tone.dot}`} />
      </span>

      <div className="flex flex-col leading-none">
        <span className={`text-[10px] font-mono font-bold tracking-widest ${tone.text}`}>
          {isConnectionIssue ? 'CONNECTION ISSUE' : isDemo ? 'DEMO DATA' : 'LIVE'}
        </span>
        <span className="text-[9px] font-mono text-slate-500 mt-0.5">
          {isConnectionIssue ? `Last success ${updateText}` : `Updated ${updateText}`}
        </span>
      </div>

      {!isConnectionIssue && trainCount > 0 && (
        <span className="hidden sm:flex items-baseline gap-1 border-l border-slate-700/60 pl-2.5 ml-0.5 leading-none">
          <span className="text-[11px] font-bold font-mono text-slate-200 tabular-nums">
            {trainCount.toLocaleString()}
          </span>
          <span className="text-[9px] font-mono text-slate-500">trains</span>
        </span>
      )}

      <button
        onClick={onRefreshNow}
        disabled={isRefreshing}
        title="Refresh live train positions"
        aria-label="Refresh live train positions"
        className="p-1.5 rounded-full text-slate-500 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-40"
      >
        <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
      </button>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   VERTICAL CONTROL GROUP + LAYER PANEL
   ───────────────────────────────────────────────────────────── */
interface MapControlsProps {
  trainCount: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocateSelected: () => void;
  onResetView: () => void;
  showTrains: boolean;
  onToggleTrains: () => void;
  showStations: boolean;
  onToggleStations: () => void;
  showRoutes: boolean;
  onToggleRoutes: () => void;
  showCongestion: boolean;
  onToggleCongestion: () => void;
  showRailwayNetwork: boolean;
  onToggleRailwayNetwork: () => void;
  hasSelectedTrain: boolean;
  lastUpdatedSecondsAgo: number;
  isRefreshing: boolean;
  onRefreshNow: () => void;
  isDemo: boolean;
  isConnectionIssue: boolean;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onLocateSelected,
  onResetView,
  showTrains,
  onToggleTrains,
  showStations,
  onToggleStations,
  showRoutes,
  onToggleRoutes,
  showCongestion,
  onToggleCongestion,
  showRailwayNetwork,
  onToggleRailwayNetwork,
  hasSelectedTrain,
}) => {
  const [layersOpen, setLayersOpen] = useState(false);

  return (
    <div className="pointer-events-auto relative select-none">
      {/* Layer panel — opens left of the control group, avoids clipping */}
      {layersOpen && (
        <div className="rb-surface-strong absolute right-full mr-2 top-1/2 -translate-y-1/2 w-60 rounded-xl overflow-hidden rb-anim-fade-in">
          <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
            <span className="rb-label">Layers</span>
            <span className="text-[9px] font-mono text-slate-600">map overlay</span>
          </div>
          <div className="px-2 pb-2 space-y-0.5">
            <LayerRow
              icon={<TrainIcon className="w-3.5 h-3.5" />}
              label="Live Trains"
              accent="text-sky-300"
              active={showTrains}
              onClick={onToggleTrains}
            />
            <LayerRow
              icon={<RouteIcon className="w-3.5 h-3.5" />}
              label="Railway Network"
              accent="text-slate-300"
              active={showRailwayNetwork}
              onClick={onToggleRailwayNetwork}
            />
            <LayerRow
              icon={<Landmark className="w-3.5 h-3.5" />}
              label="Stations"
              accent="text-emerald-300"
              active={showStations}
              onClick={onToggleStations}
            />
            <LayerRow
              icon={<MapIcon className="w-3.5 h-3.5" />}
              label="Route Labels"
              accent="text-amber-300"
              active={showRoutes}
              onClick={onToggleRoutes}
            />
            <LayerRow
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Congestion"
              accent="text-rose-300"
              active={showCongestion}
              onClick={onToggleCongestion}
            />
          </div>
        </div>
      )}

      {/* Vertical control group */}
      <div className="rb-surface-strong flex flex-col rounded-xl overflow-hidden divide-y divide-white/6">
        <ControlButton label="Zoom in" onPress={onZoomIn}>
          <ZoomIn className="w-4 h-4" />
        </ControlButton>
        <ControlButton label="Zoom out" onPress={onZoomOut}>
          <ZoomOut className="w-4 h-4" />
        </ControlButton>
        <ControlButton
          label={hasSelectedTrain ? 'Locate selected train' : 'Select a train first'}
          onPress={onLocateSelected}
          disabled={!hasSelectedTrain}
          accent={hasSelectedTrain}
        >
          <Crosshair className="w-4 h-4" />
        </ControlButton>
        <ControlButton label="Reset India view" onPress={onResetView}>
          <RotateCcw className="w-4 h-4" />
        </ControlButton>
        <div className="h-px bg-white/6" />
        <ControlButton
          label={layersOpen ? 'Hide layers' : 'Layers'}
          onPress={() => setLayersOpen((p) => !p)}
          accent={layersOpen}
        >
          <Layers className="w-4 h-4" />
        </ControlButton>
      </div>
    </div>
  );
};

/* ── Single control button with a left tooltip ──────────────── */
const ControlButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}> = ({ label, onPress, disabled = false, accent = false, children }) => (
  <button
    type="button"
    onClick={onPress}
    disabled={disabled}
    aria-label={label}
    className="group relative rb-control-btn"
  >
    <span
      className={accent ? 'text-sky-300' : disabled ? 'text-slate-700 disabled:text-slate-700' : ''}
    >
      {children}
    </span>
    <span className="rb-tooltip left-full ml-2 top-1/2 -translate-y-1/2 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100">
      {label}
    </span>
  </button>
);

/* ── Layer toggle row with a compact switch ─────────────────── */
const LayerRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  accent: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, accent, active, onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={active}
    onClick={onClick}
    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/4"
  >
    <span className={`${active ? accent : 'text-slate-600'} transition-colors`}>{icon}</span>
    <span
      className={`flex-1 text-[11.5px] font-medium transition-colors ${
        active ? 'text-slate-200' : 'text-slate-500'
      }`}
    >
      {label}
    </span>
    <span
      className={`relative w-7 h-[15px] rounded-full transition-colors duration-200 ${
        active ? 'bg-sky-500/70' : 'bg-slate-700/70'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[11px] w-[11px] rounded-full bg-white shadow transition-all duration-200 ${
          active ? 'left-[14px]' : 'left-[2px]'
        }`}
      />
    </span>
  </button>
);