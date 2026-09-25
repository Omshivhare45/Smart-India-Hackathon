'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  TrendingUp,
  Radio,
  ShieldCheck,
  Navigation,
  TimerOff,
  AlarmClock,
  Route,
  Radar,
  Sparkles,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { VIEW_META } from '../components/layout/navConfig';
import { SearchHero, journeyDateOptions, journeyDateToISO } from '../components/SearchHero';
import { Services } from '../components/Services';
import { TrainCard } from '../components/TrainCard';
import { RealTrainCard } from '../components/RealTrainCard';
import { LiveTrainTracker } from '../components/LiveTrainTracker';
import { StationRadar } from '../components/StationRadar';
import { CoachSeatModal } from '../components/CoachSeatModal';
import { PNRStatusCard } from '../components/PNRStatusCard';
import { Dashboard } from '../components/Dashboard';
import { AnalyticsView } from '../components/views/AnalyticsView';
import { WeatherView } from '../components/views/WeatherView';
import { SettingsView } from '../components/views/SettingsView';
import { AboutView } from '../components/views/AboutView';
import { TRAINS, STATIONS } from '../data/trainData';
import { Train } from '../types/train';
import { fetchTrainsBetween } from '../lib/api';
import { mapTrainsBetween } from '../lib/realTrains';

const RailwayMap = dynamic(
  () => import('../components/map/RailwayMap').then((mod) => mod.RailwayMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[700px] bg-[#161D26] flex items-center justify-center text-slate-400 font-mono text-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading railway map…</span>
        </div>
      </div>
    ),
  },
);

type AppView = keyof typeof VIEW_META;

const TRACKING_VIEWS: AppView[] = ['live', 'eta', 'delay', 'route'];

export default function Home() {
 const [activeView, setActiveView] = useState<AppView>('trains');

// Navigation & Search State
 const [activeTab, setActiveTab] = useState<'stations' | 'trainNumber'>('stations');
 const [sourceCode, setSourceCode] = useState<string>('NDLS');
 const [destCode, setDestCode] = useState<string>('BSB');
 const [trainQuery, setTrainQuery] = useState<string>('');
 const [travelDate, setTravelDate] = useState<string>(journeyDateOptions()[0]);
 const [selectedStationRadar, setSelectedStationRadar] = useState<string>('NDLS');

 // Active Live Train selection for modal/tracker
 const [selectedLiveTrain, setSelectedLiveTrain] = useState<Train | null>(null);
 const [coachModalTrain, setCoachModalTrain] = useState<Train | null>(null);

 // SEARCHED STATE: Initially false so the user only sees the Source to Destination layout!
 const [searched, setSearched] = useState<boolean>(false);

 // REAL trains between the searched source/destination (RailRadar via Express backend)
 const [realTrains, setRealTrains] = useState<Train[]>([]);
 const [trainsLoading, setTrainsLoading] = useState<boolean>(false);
 const [trainsError, setTrainsError] = useState<string | null>(null);
 const [searchKey, setSearchKey] = useState<string | null>(null);
 const searchSeqRef = useRef<number>(0);

 // Filtered Trains for Station Search (fallback catalog)
 const matchingTrains = useMemo(() => {
 return TRAINS.filter((t) => {
 const matchSource = t.sourceCode === sourceCode || t.route.some((r) => r.stationCode === sourceCode);
 const matchDest = t.destinationCode === destCode || t.route.some((r) => r.stationCode === destCode);
 return matchSource && matchDest;
 });
 }, [sourceCode, destCode]);

 // Real trains when a search has completed; otherwise fall back to the catalog.
 const usingRealTrains = searchKey !== null && !trainsLoading && realTrains.length > 0;
 const displayTrains = usingRealTrains ? realTrains : matchingTrains.length > 0 ? matchingTrains : TRAINS.slice(0, 3);

const handleSearchStations = () => {
 setSearched(true);
 const dateISO = journeyDateToISO(travelDate);
 const key = `${sourceCode}|${destCode}|${dateISO}`;
 setSearchKey(key);
 setTrainsLoading(true);
 setTrainsError(null);
 const seq = ++searchSeqRef.current;

 fetchTrainsBetween(sourceCode, destCode, { date: dateISO, live: true })
 .then((data) => {
 if (seq !== searchSeqRef.current) return;
 const mapped = mapTrainsBetween(data);
 setRealTrains(mapped);
 if (mapped.length > 0) {
 setSelectedLiveTrain((prev) => prev ?? mapped[0]);
 }
 })
 .catch((err: unknown) => {
 if (seq !== searchSeqRef.current) return;
 setRealTrains([]);
 setTrainsError((err as Error).message || 'Could not fetch real trains.');
 setSelectedLiveTrain((prev) => prev ?? (matchingTrains[0] || TRAINS[0]));
 })
 .finally(() => {
 if (seq === searchSeqRef.current) setTrainsLoading(false);
 });

 // Smoothly scroll down to train details
 setTimeout(() => {
 const resultsEl = document.getElementById('journey-details');
 if (resultsEl) {
 resultsEl.scrollIntoView({ behavior: 'smooth' });
 }
 }, 150);
};

 const scrollToElement = (id: string) => {
 setTimeout(() => {
 const el = document.getElementById(id);
 if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
 }, 180);
 };

 const handleSelectTrain = (train: Train) => {
 setSearched(true);
 setSelectedLiveTrain(train);
 setActiveView('live');
 scrollToElement('tracking');
 };

 const handleDashboardTrack = (train: Train) => {
 setSearched(true);
 setSelectedLiveTrain(train);
 setActiveView('live');
 scrollToElement('tracking');
 };

 // Focus the relevant section when a tracking view is active.
 useEffect(() => {
 if (!selectedLiveTrain || !TRACKING_VIEWS.includes(activeView)) return;
 const target =
 activeView === 'eta' || activeView === 'delay' ? 'ai-forecast' : 'tracking';
 scrollToElement(target);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [activeView]);

 // Reset scroll on non-tracking view changes.
 useEffect(() => {
 if (!TRACKING_VIEWS.includes(activeView)) {
 window.scrollTo({ top: 0, behavior: 'smooth' });
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [activeView]);

 const isTrackingView = TRACKING_VIEWS.includes(activeView);
 const showDetails = isTrackingView || searched;

 const meta = VIEW_META[activeView];

 return (
 <AppShell active={activeView} onNavigate={(key) => setActiveView(key as AppView)}>

 <div className="relative z-10">
 {activeView === 'dashboard' && (
 <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] mx-auto">
 <Dashboard onNavigate={(key) => setActiveView(key as AppView)} onTrackTrain={handleDashboardTrack} />
 </div>
 )}

 {activeView === 'map' && (
 <div className="relative w-full h-[calc(100vh-70px)] min-h-[640px] overflow-hidden">
 <RailwayMap
   initialTrainNumber={selectedLiveTrain?.trainNumber || null}
   onSelectTrainExternal={(mapTrain) => {
     const match = TRAINS.find((t) => t.trainNumber === mapTrain.train_number);
     if (match) setSelectedLiveTrain(match);
   }}
 />
 </div>
 )}

 {activeView === 'station' && (
 <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
 <div className="flex flex-wrap items-center gap-2">
 <Radar className="w-4 h-4 text-[#2563EB]" />
 <h2 className="text-lg font-bold text-[#13213E]">Select Railway Terminal</h2>
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-w-[900px]">
 {STATIONS.slice(0, 8).map((st) => (
 <button
 key={st.code}
 onClick={() => setSelectedStationRadar(st.code)}
 className={`p-3 rounded-none border text-left cursor-pointer ${
 selectedStationRadar === st.code
 ? 'bg-[#1D4ED8]/30 text-[#1D4ED8] border-[#2563EB]/50'
 : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#13213E] hover:border-[#2563EB]/40'
 }`}
 >
 <span className="block font-mono text-xs font-bold">{st.code}</span>
 <span className="text-xs font-semibold line-clamp-1">{st.name}</span>
 </button>
 ))}
 </div>
 <StationRadar
 stationCode={selectedStationRadar || sourceCode}
 onSelectTrain={handleSelectTrain}
 />
 </div>
 )}

 {activeView === 'analytics' && (
 <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1200px] mx-auto">
 <AnalyticsView onNavigate={(key) => setActiveView(key as AppView)} />
 </div>
 )}

 {activeView === 'weather' && (
 <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1200px] mx-auto">
 <WeatherView />
 </div>
 )}

 {activeView === 'settings' && (
 <div className="px-4 sm:px-6 lg:px-8 py-6">
 <SettingsView />
 </div>
 )}

 {activeView === 'about' && (
 <div className="px-4 sm:px-6 lg:px-8 py-6">
 <AboutView />
 </div>
 )}

 {(activeView === 'trains' || isTrackingView) && (
 <div className="pb-20">
 {/* FOCUSED SOURCE TO DESTINATION HERO */}
 <SearchHero
 activeTab={activeTab}
 setActiveTab={setActiveTab}
 sourceCode={sourceCode}
 setSourceCode={setSourceCode}
 destCode={destCode}
 setDestCode={setDestCode}
trainQuery={trainQuery}
  setTrainQuery={setTrainQuery}
  travelDate={travelDate}
  setTravelDate={setTravelDate}
  onSearchStations={handleSearchStations}
 onSelectTrain={(t) => {
 setSearched(true);
 setSelectedLiveTrain(t);
 setActiveView('live');
 scrollToElement('tracking');
 }}
 searched={searched}
 />

 {/* Services quick access (landing) */}
 {!searched && (
 <Services
 onFindTrains={() => {
 setActiveTab('stations');
 setActiveView('trains');
 }}
 onFindTrain={() => {
 setActiveTab('trainNumber');
 setActiveView('trains');
 }}
 onSchedule={() => setActiveView('live')}
 onStations={() => setActiveView('station')}
 />
 )}

 {/* Feature banner for tracking-focused views */}
 {isTrackingView && (
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
 <div className="flex items-center gap-3 rounded-none border border-[#2563EB]/25 bg-[#EEF4FC] px-5 py-4">
 <div className="w-10 h-10 shrink-0 rounded-none bg-[#2563EB]/15 text-[#1D4ED8] flex items-center justify-center">
 {activeView === 'eta' && <AlarmClock className="w-5 h-5" />}
 {activeView === 'delay' && <TimerOff className="w-5 h-5" />}
 {activeView === 'route' && <Route className="w-5 h-5" />}
 {activeView === 'live' && <Radio className="w-5 h-5 " />}
 </div>
 <div>
 <h2 className="font-bold text-[#13213E]">{meta.title}</h2>
 <p className="text-xs text-[#64748B] mt-0.5">
 {activeView === 'eta' && 'AI arrival forecast toward the next stoppage, computed by the RailBuddy ML engine.'}
 {activeView === 'delay' && 'Predicted running delay toward the next stop with model confidence.'}
 {activeView === 'route' && 'Station-by-station scheduled vs actual timeline for the tracked service.'}
 {activeView === 'live' && 'Real-time NTES running feed with live delay, platform and station sequence.'}
 </p>
 </div>
 </div>
 </div>
 )}

 {!searched && isTrackingView && (
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
 <div className="flex items-center gap-3 rounded-none border border-[#E2E8F0] bg-[#FFFFFF] px-5 py-4">
 <Sparkles className="w-5 h-5 text-[#D97706] shrink-0" />
 <p className="text-sm text-[#4A5A79]">
 Select a train below or run a search to start <strong className="text-[#13213E]">live tracking</strong> and the AI forecast.
 </p>
 </div>
 </div>
 )}

{/* ============================================================== */}
{/* SCROLLING JOURNEY & TRAIN DETAILS (REVEALED AFTER SEARCH) */}
{/* ============================================================== */}
{showDetails && (
 <div id="journey-details" className="space-y-12">
 {/* SECTION 1: AVAILABLE TRAINS LIST */}
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-6">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
  <div>
  <div className="flex items-center gap-2">
  <span className="w-2.5 h-2.5 rounded-none bg-[#1D4ED8]" />
  <h3 className="text-2xl font-extrabold text-[#13213E]">
  Available Trains: <span className="text-[#2563EB]">{sourceCode}</span> ➔ <span className="text-[#13213E]">{destCode}</span>
  </h3>
  </div>
  <p className="text-xs text-[#64748B] mt-1 font-medium">
  {trainsLoading
  ? 'Fetching real-time trains from the rail network…'
  : `${usingRealTrains ? realTrains.length : displayTrains.length} Services Found • Click "Track Live Status" to view real-time status &amp; station timeline below`}
  </p>
  </div>

  <div className="flex items-center gap-2 text-xs text-[#13213E] font-mono bg-[#FFFFFF] px-3.5 py-1.5 rounded-none border border-[#E2E8F0] shadow-xs">
  {trainsLoading ? (
  <>
  <RefreshCw className="w-3 h-3 text-[#1D4ED8] animate-spin" />
  <span>Fetching RailRadar…</span>
  </>
  ) : usingRealTrains ? (
  <>
  <span className="w-2 h-2 rounded-none bg-emerald-500 animate-pulse"></span>
  <span>Live source: RailRadar / IRCTC</span>
  </>
  ) : (
  <>
  <span className="w-2 h-2 rounded-none bg-amber-400 "></span>
  <span>Source: demo catalog</span>
  </>
  )}
  </div>
  </div>

  {/* Real-data loading state */}
  {trainsLoading && (
  <div className="border border-dashed border-[#B9C4D4] bg-[#F8FAFC] p-6 text-sm text-[#64748B] font-medium flex items-center gap-3">
  <div className="w-5 h-5 border-2 border-[#2563EB] border-t-transparent rounded-none animate-spin" />
  Fetching all real trains between {sourceCode} and {destCode} from the RailRadar live feed…
  </div>
  )}

  {/* Real-data error state — falls back to the demo catalog */}
  {!trainsLoading && trainsError && (
  <div className="rounded-none bg-[#EEF4FC] border border-[#1D4ED8]/30 p-4 flex items-start gap-3">
  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
  <div className="text-xs text-[#13213E]">
  <span className="font-bold">Could not fetch real trains.</span> {trainsError} Showing the local demo catalog below instead. Start the Express backend (<code className="font-mono text-[#1D4ED8] bg-white px-1 py-0.5 border border-[#E2E8F0]">npm run dev</code> in <code className="font-mono text-[#1D4ED8]">backend/</code>) with <code className="font-mono text-[#1D4ED8]">RAILRADAR_API_KEY</code> set.
  </div>
  </div>
  )}

 {/* Feature hint for ETA / Delay predictions before tracked */}
 {isTrackingView && !selectedLiveTrain && (
 <div className="space-y-3">
 {displayTrains.map((train) => (
 <div
 key={train.id}
 className="rounded-none border border-[#E2E8F0] bg-[#FFFFFF] p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
 >
 <div className="flex items-center gap-3 min-w-0">
 <span className="font-mono text-xs font-bold px-2 py-1 rounded-none bg-[#1D4ED8]/10 text-[#2563EB] border border-[#1D4ED8]/25">
 {train.trainNumber}
 </span>
 <div className="min-w-0">
 <div className="text-sm font-bold text-[#13213E] truncate">{train.trainName}</div>
 <div className="text-xs text-[#64748B]">
 {train.sourceName} ➔ {train.destinationName}
 </div>
 </div>
 </div>
 <button
 onClick={() => handleSelectTrain(train)}
 className="px-4 py-2.5 rounded-none bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
 >
 <Navigation className="w-3.5 h-3.5" />
 Track Live
 </button>
 </div>
 ))}
 </div>
 )}

 {/* Full train cards — real RailRadar trains when available, demo catalog otherwise */}
 {!isTrackingView && (
 <div className="space-y-4">
 {displayTrains.map((train) =>
 usingRealTrains ? (
 <RealTrainCard
 key={train.id}
 train={train}
 onTrackLive={handleSelectTrain}
 onOpenCoach={(t) => setCoachModalTrain(t)}
 />
 ) : (
 <TrainCard
 key={train.id}
 train={train}
 onTrackLive={handleSelectTrain}
 onOpenCoach={(t) => setCoachModalTrain(t)}
 />
 ),
 )}
 </div>
 )}
 </div>

 {/* SECTION 2: LIVE TRAIN TRACKER & VERTICAL TIMELINE (Where Is My Train) */}
 {selectedLiveTrain && (
 <div className="pt-4">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-2 mb-2">
 <span className="text-xs font-mono font-bold text-[#2563EB] flex items-center gap-1.5">
 <Navigation className="w-3.5 h-3.5 " />
 REAL-TIME NTES STATUS &amp; STATION TIMELINE
 </span>
 <span className="text-xs font-medium text-[#64748B]">
 Currently Tracking: <strong className="text-[#13213E]">{selectedLiveTrain.trainNumber} - {selectedLiveTrain.trainName}</strong>
 </span>
 </div>

 <LiveTrainTracker
 train={selectedLiveTrain}
 onOpenCoachLayout={() => setCoachModalTrain(selectedLiveTrain)}
 />
 </div>
 )}

 {/* SECTION 3: STATION RADAR BOARD */}
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <StationRadar
 stationCode={selectedStationRadar || sourceCode}
 onSelectTrain={handleSelectTrain}
 />
 </div>

 {/* SECTION 4: TELEMETRY STATS & PNR LOOKUP */}
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
 <div className="bg-[#FFFFFF] rounded-none p-6 flex items-center gap-4 border border-[#E2E8F0] shadow-soft ">
 <div className="w-12 h-12 rounded-none bg-[#EEF4FC] border border-[#1D4ED8]/20 flex items-center justify-center text-[#1D4ED8] shrink-0">
 <TrendingUp className="w-6 h-6" />
 </div>
 <div>
 <span className="text-[11px] font-mono font-bold text-[#64748B] uppercase">Average Punctuality (demo)</span>
 <div className="text-xl font-black text-[#13213E] font-mono mt-0.5">
 98.2% <span className="text-emerald-700 text-xs font-sans font-bold">On Time</span>
 </div>
 </div>
 </div>

 <div className="bg-[#FFFFFF] rounded-none p-6 flex items-center gap-4 border border-[#E2E8F0] shadow-soft ">
 <div className="w-12 h-12 rounded-none bg-[#EEF4FC] border border-[#1D4ED8]/20 flex items-center justify-center text-[#1D4ED8] shrink-0">
 <Radio className="w-6 h-6 " />
 </div>
 <div>
 <span className="text-[11px] font-mono font-bold text-[#64748B] uppercase">ISRO NavIC Telemetry (demo)</span>
 <div className="text-lg font-black text-[#13213E] font-mono mt-0.5">
 Demo <span className="text-amber-700 text-xs font-sans font-bold">no live GPS feed</span>
 </div>
 </div>
 </div>

 <div className="bg-[#FFFFFF] rounded-none p-6 flex items-center gap-4 border border-[#E2E8F0] shadow-soft ">
 <div className="w-12 h-12 rounded-none bg-[#EEF4FC] border border-[#E2E8F0] flex items-center justify-center">
 <ShieldCheck className="w-6 h-6 text-emerald-700" />
 </div>
 <div>
 <span className="text-[11px] font-mono font-bold text-[#64748B] uppercase">Kavach Safety Grid (demo)</span>
 <div className="text-xl font-black text-[#13213E] font-mono mt-0.5">
 Demo
 </div>
 </div>
 </div>
 </div>

{/* PNR Status Lookup Simulator */}
<div id="pnr">
 <PNRStatusCard onTrackTrainByNumber={(num) => {
 const found = TRAINS.find((t) => t.trainNumber === num);
 if (found) handleSelectTrain(found);
 }} />
</div>
</div>
  </div>
  )}
  </div>
  )}
  </div>

{/* Interactive Coach & Seat Modal */}
{coachModalTrain && (
 <CoachSeatModal
 train={coachModalTrain}
 onClose={() => setCoachModalTrain(null)}
 />
)}
</AppShell>
 );
}