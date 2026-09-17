'use client';

import React, { useState, useEffect } from 'react';
import {
 Train as TrainIcon,
 Navigation,
 Clock,
 MapPin,
 Volume2,
 Share2,
 Layers,
 Gauge,
 Zap,
 CheckCircle2,
 AlertTriangle,
 BrainCircuit,
 Radio,
 Sparkles,
 ArrowRight,
 ShieldCheck,
 ChevronRight,
 RefreshCw,
 Eye,
 EyeOff,
 Flag,
 CloudSun,
 Cpu,
 Flame,
} from 'lucide-react';
import { Train } from '../types/train';
import { railAudio } from '../utils/audio';
import { fetchLiveTrain, fetchFullPrediction, predictDelay, PredictionResponse, FullPredictionResponse } from '../lib/api';
import { buildLiveTimeline, LiveStopView, LiveTimeline } from '../lib/liveTimeline';

interface LiveTrainTrackerProps {
 train: Train;
 onOpenCoachLayout: () => void;
}

export const LiveTrainTracker: React.FC<LiveTrainTrackerProps> = ({ train, onOpenCoachLayout }) => {
 const [currentSpeed, setCurrentSpeed] = useState<number>(train.currentStatus.currentSpeedKmH || 128);
 const [simulatedDelay, setSimulatedDelay] = useState<number>(train.currentStatus.delayMinutes || 0);
 const [activeStationIdx, setActiveStationIdx] = useState<number>(1);
 const [isAnnouncing, setIsAnnouncing] = useState<boolean>(false);
 const [copied, setCopied] = useState<boolean>(false);
 const [showIntermediate, setShowIntermediate] = useState<boolean>(false);
 const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

 // REAL NTES live data (GET /api/live/train/{train_number})
 const [live, setLive] = useState<LiveTimeline | null>(null);
 const [liveError, setLiveError] = useState<string | null>(null);
 const [liveLoading, setLiveLoading] = useState<boolean>(true);
 const [liveRefresh, setLiveRefresh] = useState<number>(0);

 // AI delay & ETA prediction state
 const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
 const [predictionLoading, setPredictionLoading] = useState<boolean>(false);
 const [predictionError, setPredictionError] = useState<string | null>(null);
 const [forecastAttempt, setForecastAttempt] = useState<number>(0);

// Real-Time Dynamic ETA state (polls /api/trains/{no}/prediction every 30s)
const [fullPred, setFullPred] = useState<FullPredictionResponse | null>(null);
const [fullPredLoading, setFullPredLoading] = useState<boolean>(false);
const [fullPredError, setFullPredError] = useState<string | null>(null);
const [lastUpdatedAgo, setLastUpdatedAgo] = useState<number>(0);
const fullPredLastUpdatedRef = React.useRef<number>(0);
const hasFullPredRef = React.useRef<boolean>(false);

 // Demote the mock route to an explicit DEMO/SIMULATED timeline used ONLY
 // when the NTES live feed is unavailable.
 const mockStops = React.useMemo<LiveStopView[]>(() => {
 return train.route.map((rs) => ({
 stationCode: rs.stationCode,
 stationName: rs.stationName,
 platform: String(rs.platform),
 scheduledArrival: rs.scheduledArrival,
 scheduledDeparture: rs.scheduledDeparture,
 actualArrival: rs.actualArrival,
 actualDeparture: rs.actualDeparture,
 distanceKm: rs.distanceKm,
 haltMinutes: rs.haltMinutes,
 status: rs.status === 'approaching' ? 'upcoming' : rs.status,
 delayMinutes: rs.delayMinutes,
 arrived: rs.status === 'passed',
 departed: rs.status === 'passed' || rs.status === 'current',
 }));
 }, [train.route]);

 const liveActive = live !== null && liveError === null;
 const displayStops: LiveStopView[] = liveActive ? live.stops : mockStops;

 // Realistic live speed fluctuation — DEMO ONLY. Never shown as real data.
 useEffect(() => {
 const interval = setInterval(() => {
 const delta = (Math.random() - 0.5) * 3;
 setCurrentSpeed((prev) => {
 const next = Math.round(prev + delta);
 return Math.min(Math.max(next, 0), 160);
 });
 }, 2500);
 return () => clearInterval(interval);
 }, []);

 // Fetch REAL NTES live data from the RailBuddy backend.
 useEffect(() => {
 const controller = new AbortController();
 setLiveLoading(true);
 fetchLiveTrain(train.trainNumber, controller.signal)
 .then((payload) => {
 if (controller.signal.aborted) return;
 if (!payload.success) {
 const failed = (payload.pipeline || []).filter((s) => !s.success);
 const reason = failed.length
 ? `Stage "${failed.map((f) => f.step).join('", "')}" failed: ${failed
 .map((f) => f.detail)
 .join('; ')}`
 : payload.error || 'Live railway data temporarily unavailable';
 setLive(null);
 setLiveError(reason);
 return;
 }
 const timeline = buildLiveTimeline(payload);
 if (timeline) {
 setLive(timeline);
 setLiveError(null);
 } else {
 setLive(null);
 setLiveError('Live payload missing schedule/live_status');
 }
 })
 .catch((err: unknown) => {
 if ((err as Error).name === 'AbortError') return;
 setLive(null);
 setLiveError((err as Error).message || 'Live railway data temporarily unavailable');
 })
 .finally(() => {
 if (!controller.signal.aborted) setLiveLoading(false);
 });
 return () => controller.abort();
 }, [train.trainNumber, liveRefresh]);

 // AI delay & ETA forecast — calls the RailBuddy ML backend based on the
 // current (live if available, otherwise demo) station.
 useEffect(() => {
 const controller = new AbortController();
 const station = displayStops.find((s) => s.status !== 'passed') ?? displayStops[0];
 const next = station ? displayStops[displayStops.indexOf(station) + 1] : undefined;

 const runForecast = async () => {
 setPredictionLoading(true);
 setPredictionError(null);
 try {
 const result = await predictDelay(
 {
 train_number: train.trainNumber,
 station_code: station.stationCode,
 delay_current_minutes: liveActive ? live.delayMinutes : (station?.delayMinutes ?? 0),
 // NTES provides no GPS speed; this only feeds the ML input features.
 current_speed_kmh: liveActive ? 90 : currentSpeed,
 distance_covered_km: station?.distanceKm || undefined,
 target: next?.stationCode,
 },
 controller.signal,
 );
 setPrediction(result);
 } catch (err) {
 if ((err as Error).name === 'AbortError') return;
 setPrediction(null);
 setPredictionError((err as Error).message || 'Could not reach the AI engine');
 } finally {
 if (!controller.signal.aborted) setPredictionLoading(false);
 }
 };

 runForecast();
 return () => controller.abort();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [train.trainNumber, live, liveError, activeStationIdx, forecastAttempt]);

 // Real-Time Dynamic ETA: polls every 30 s (starts when live status is known)
 useEffect(() => {
  const controller = new AbortController();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let mounted = true;

  const fetchNow = async () => {
  if (!mounted) return;
  setFullPredLoading(!hasFullPredRef.current);
  setFullPredError(null);
  try {
   const result = await fetchFullPrediction(
   train.trainNumber,
   {
    journey_date: live?.journeyDate ?? undefined,
   },
   controller.signal,
   );
   if (!mounted || controller.signal.aborted) return;
   setFullPred(result);
   hasFullPredRef.current = true;
   fullPredLastUpdatedRef.current = Date.now();
   setLastUpdatedAgo(0);
  } catch (err) {
   if ((err as Error).name === 'AbortError' || !mounted) return;
   setFullPred(null);
   hasFullPredRef.current = false;
   setFullPredError((err as Error).message || 'Dynamic ETA unavailable');
  } finally {
   if (mounted && !controller.signal.aborted) setFullPredLoading(false);
  }
  };

  fetchNow();
  intervalId = setInterval(fetchNow, 30_000);

  return () => {
  mounted = false;
  if (intervalId) clearInterval(intervalId);
  controller.abort();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [train.trainNumber, live?.journeyDate]);

 // "X seconds ago" ticker (1 s cadence; resets when fullPred updates)
 useEffect(() => {
  const id = setInterval(() => {
  if (fullPredLastUpdatedRef.current > 0) {
   setLastUpdatedAgo(
   Math.floor((Date.now() - fullPredLastUpdatedRef.current) / 1000),
   );
  }
  }, 1_000);
  return () => clearInterval(id);
 }, []);

 const currentIdx = displayStops.findIndex((s) => s.status === 'current');
 const hasCurrent = currentIdx >= 0;
 // The single symbolic train marker is inserted after this stop row index.
 const markerIndex = liveActive ? live.position.insertIndex : null;
 const currentStation = liveActive
 ? displayStops[currentIdx >= 0 ? currentIdx : 0]
 : displayStops[activeStationIdx] || displayStops[0];
 const nextStation = liveActive
 ? displayStops[currentIdx + 1] || displayStops[displayStops.length - 1]
 : displayStops[activeStationIdx + 1] || displayStops[displayStops.length - 1];

 const handleSpeakAnnouncement = async () => {
 setIsAnnouncing(true);
 await railAudio.speakAnnouncement(
 train.trainNumber,
 train.trainName,
 currentStation.stationName,
 currentStation.platform ?? '—'
 );
 setIsAnnouncing(false);
 };

const handleShareStatus = () => {
 setCopied(true);
 setTimeout(() => setCopied(false), 2500);
};

 const handleAdvanceSimulation = () => {
 if (activeStationIdx < train.route.length - 1) {
 setActiveStationIdx((prev) => prev + 1);
 railAudio.playTrainHorn();
 } else {
 setActiveStationIdx(0);
 }
 };

 const handleRefreshLive = () => {
 setIsRefreshing(true);
 setLiveRefresh((n) => n + 1);
 setTimeout(() => {
 setIsRefreshing(false);
 }, 800);
 };

 return (
 <div id="tracking" className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
 
{/* 1. HERO LIVE STATUS BANNER (Where is my train signature header) */}
<div className="bg-[#FFFFFF] rounded-none p-6 sm:p-8 shadow-soft border border-[#E2E8F0] relative overflow-hidden">

{/* Top subtle accent stripe */}
<div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1D4ED8]" />

 <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
 <div>
 <div className="flex flex-wrap items-center gap-2.5 mb-2">
 <span className="px-3 py-1 rounded-none bg-[#1D4ED8] text-white font-mono text-sm font-black ">
 {train.trainNumber}
 </span>
 <h2 className="text-2xl sm:text-3xl font-black text-[#13213E] tracking-tight">
 {train.trainName}
 </h2>
 <span className="px-2.5 py-0.5 rounded-none text-xs font-bold uppercase tracking-wider bg-[#EEF4FC] text-[#1D4ED8] border border-[#1D4ED8]/20">
 {train.type}
 </span>
 </div>

 <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#64748B] font-medium">
 <span>{train.sourceName} ({train.sourceCode})</span>
 <ArrowRight className="w-3.5 h-3.5 text-[#1D4ED8]" />
 <span>{train.destinationName} ({train.destinationCode})</span>
 <span className="text-[#D6E0EC]">•</span>
 <span className="font-mono">{train.distanceKm} km</span>
 <span className="text-[#D6E0EC]">•</span>
 <span>{train.duration}</span>
 </div>
 </div>

 {/* Quick Action Buttons */}
 <div className="flex flex-wrap items-center gap-2.5">
 {/* Speedometer Badge — NTES provides no GPS speed */}
 <div className="flex items-center gap-2 px-3.5 py-2 rounded-none bg-[#F1F5F9] border border-[#E2E8F0] text-[#13213E]">
 <Gauge className="w-4 h-4 text-[#1D4ED8]" />
 <div>
 <span className="block text-[9px] uppercase font-bold text-[#64748B]">Speed</span>
 {liveActive ? (
 <span className="font-mono text-sm font-bold text-[#64748B]">— Unavailable</span>
 ) : (
 <span className="font-mono text-sm font-bold text-[#13213E]">
 {currentSpeed} <span className="text-xs text-[#64748B]">km/h</span>{' '}
 <span className="text-[10px] text-amber-600 font-black">SIM</span>
 </span>
 )}
 </div>
 </div>

 {/* Audio Announcement Button */}
 <button
 onClick={handleSpeakAnnouncement}
 disabled={isAnnouncing}
 className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-none bg-[#F1F5F9] hover:bg-[#EEF4FC] text-[#13213E] hover:text-[#1D4ED8] border border-[#E2E8F0] text-xs font-bold shadow-xs"
 title="Speak Station Announcement"
 >
 <Volume2 className={`w-4 h-4 ${isAnnouncing ? ' text-[#1D4ED8]' : 'text-[#64748B]'}`} />
 <span>{isAnnouncing ? 'Announcing...' : 'Announce'}</span>
 </button>

 {/* Refresh NTES Live Button */}
 <button
 onClick={handleRefreshLive}
 className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-none bg-[#F1F5F9] hover:bg-[#EEF4FC] text-[#13213E] hover:text-[#1D4ED8] border border-[#E2E8F0] text-xs font-bold shadow-xs"
 title="Refresh NTES Live Feed"
 >
 <RefreshCw className={`w-4 h-4 ${isRefreshing ? ' text-[#1D4ED8]' : 'text-[#64748B]'}`} />
 <span>Refresh</span>
 </button>

 {/* Advance Demo Simulation Button — only in DEMO/SIM mode */}
 {!liveActive && (
 <button
 onClick={handleAdvanceSimulation}
 className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-none bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-bold "
 title="Simulate Next Station Movement (demo)"
 >
 <Navigation className="w-3.5 h-3.5" />
 <span>Move Next Stop</span>
 </button>
 )}

 {/* Share Button */}
 <button
 onClick={handleShareStatus}
 className="p-2.5 rounded-none bg-[#F1F5F9] hover:bg-[#EEF4FC] text-[#64748B] hover:text-[#1D4ED8] border border-[#E2E8F0] shadow-xs"
 title="Share Live Status"
 >
 <Share2 className="w-4 h-4" />
 </button>
 </div>
 </div>

 {/* Live Running Status Ribbon */}
 <div className="mt-6 pt-5 border-t border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div className="flex items-start gap-3">
 <div className="mt-0.5 relative flex h-3.5 w-3.5">
 {liveActive ? (
 <>
 <span className=" absolute inline-flex h-full w-full rounded-none bg-emerald-400 opacity-75"></span>
 <span className="relative inline-flex rounded-none h-3.5 w-3.5 bg-emerald-500/100"></span>
 </>
 ) : (
 <span className="relative inline-flex rounded-none h-3.5 w-3.5 bg-amber-400"></span>
 )}
 </div>
 <div>
 <div className="text-sm font-bold text-[#13213E] flex flex-wrap items-center gap-2">
 {liveActive ? (
 live.isBetweenStations ? (
 <span>
 Live: between <strong>{live.currentStation.name || '—'}</strong> and{' '}
 <strong>{live.nextStoppage.name || '—'}</strong>
 </span>
 ) : (
 <span>Current halt: {currentStation.stationName}</span>
 )
 ) : (
 <span>DEMO: Departed {currentStation.stationName}</span>
 )}
 <span
 className={`text-xs font-mono px-2 py-0.5 rounded-none font-bold border ${
 liveActive
 ? live.punctual
 ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
 : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
 : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
 }`}
 >
 {liveActive
 ? live.punctual || live.delayMinutes <= 0
 ? 'On Time'
 : `${live.delayMinutes} min late`
 : 'SIMULATED'}
 </span>
 {liveActive && (
 <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-none bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
 NTES Live
 </span>
 )}
 </div>
 {liveActive ? (
 <p className="text-xs text-[#64748B] mt-1">
 Next stoppage:{' '}
 <strong className="text-[#13213E]">
 {live.nextStoppage.name || '—'} ({live.nextStoppage.code || '—'})
 </strong>{' '}
 • last update <span className="font-mono">{live.lastUpdate || '—'}</span>
 </p>
 ) : (
 <p className="text-xs text-[#64748B] mt-1">
 Next stop:{' '}
 <strong className="text-[#13213E]">
 {nextStation.stationName} ({nextStation.stationCode})
 </strong>{' '}
 • Platform {nextStation.platform} • ETA {nextStation.scheduledArrival}
 </p>
 )}
 </div>
 </div>

 <div className="text-right text-xs font-mono text-[#64748B]">
 {liveActive ? (
 <>
 Source: <span className="text-[#1D4ED8] font-bold">NTES Live</span> • journey{' '}
 {live.journeyDate || '—'}
 </>
 ) : (
 <>
 Source: <span className="text-amber-600 font-bold">DEMO / SIMULATED</span> • not live
 </>
 )}
 </div>
 </div>

 {/* NTES loading / failure states — never silently fall back to fake live data */}
 {liveLoading && !liveError && (
 <div className="mt-4 text-xs text-[#7C8DA8] font-mono flex items-center gap-2">
 <RefreshCw className="w-3 h-3 " /> Fetching NTES live feed…
 </div>
 )}

 {liveError && (
 <div className="mt-4 rounded-none bg-[#EEF4FC] border border-[#1D4ED8]/30 p-3 flex items-start gap-3">
 <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
 <p className="text-xs text-[#13213E]">
 <span className="font-bold">Live railway data temporarily unavailable.</span>{' '}
 {liveError} Timeline below shows DEMO/SIMULATED data — it is not live.
 </p>
 </div>
 )}

 {copied && (
 <div className="mt-3 text-center text-xs font-bold text-emerald-600 bg-emerald-500/10 py-1.5 rounded-none border border-emerald-500/30">
 ✓ Live Tracking link copied to clipboard!
 </div>
 )}
 </div>

 {/* AI DELAY & ETA FORECAST (live ML prediction from ml/api/main.py) */}
 <div id="ai-forecast" className="bg-[#FFFFFF] rounded-none p-6 sm:p-8 shadow-soft border border-[#E2E8F0] relative overflow-hidden">
 <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1D4ED8]" />

 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
 <div className="flex items-center gap-3">
 <div className="w-11 h-11 rounded-none bg-[#1D4ED8] text-white flex items-center justify-center shrink-0">
 <BrainCircuit className="w-6 h-6" />
 </div>
 <div>
 <h3 className="text-base sm:text-lg font-black text-[#13213E] tracking-tight">
 AI Delay &amp; ETA Forecast
 </h3>
 <p className="text-xs text-[#64748B] font-medium">
 Predicted running delay toward the next stop from the RailBuddy ML engine
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2 self-start sm:self-auto">
 {prediction && !predictionLoading && (
 <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-none bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
 <span className="w-1.5 h-1.5 rounded-none bg-emerald-500/100 " />
 ML Engine Live
 </span>
 )}
 {predictionError && (
 <button
 onClick={() => setForecastAttempt((n) => n + 1)}
 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-none bg-[#EEF4FC] text-[#1D4ED8] border border-[#1D4ED8]/30 hover:bg-[#EFF6FF] "
 >
 <RefreshCw className={`w-3 h-3 ${predictionLoading ? '' : ''}`} />
 Retry AI Forecast
 </button>
 )}
 </div>
 </div>

 {/* LOADING STATE */}
 {predictionLoading && (
 <div className="flex items-center justify-center gap-3 py-6 border border-dashed border-[#E2E8F0] rounded-none bg-[#F1F5F9]">
 <div className="w-5 h-5 rounded-none border-2 border-[#1D4ED8] border-t-transparent " />
 <span className="text-sm font-semibold text-[#64748B]">
 AI engine is computing the delay forecast…
 </span>
 </div>
 )}

 {/* ERROR STATE (backend unavailable — rest of UI stays intact) */}
 {!predictionLoading && predictionError && (
 <div className="rounded-none bg-[#EEF4FC] border border-[#1D4ED8]/30 p-4 flex items-start gap-3">
 <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
 <div className="flex-1">
 <p className="text-sm font-bold text-[#13213E]">
 AI prediction temporarily unavailable
 </p>
 <p className="text-xs text-[#64748B] mt-0.5 break-words">
 {predictionError}. Start the FastAPI backend with{' '}
 <code className="font-mono text-[#1D4ED8] bg-[#FFFFFF] px-1 py-0.5 rounded border border-[#E2E8F0]">
 python -m ml.api.main
 </code>{' '}
 and retry.
 </p>
 <button
 onClick={() => setForecastAttempt((n) => n + 1)}
 className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-bold "
 >
 <RefreshCw className="w-3.5 h-3.5" />
 Retry AI Forecast
 </button>
 </div>
 </div>
 )}

 {/* SUCCESS STATE */}
 {!predictionLoading && !predictionError && prediction && (
 <>
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {/* Predicted Delay */}
 <div className="rounded-none bg-[#F1F5F9] border border-[#E2E8F0] p-4">
 <span className="block text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
 Predicted Delay
 </span>
 <div className={`mt-1 font-mono text-2xl sm:text-3xl font-black ${prediction.predicted_delay_minutes > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
 {prediction.predicted_delay_minutes}<span className="text-sm font-bold text-[#64748B] ml-0.5">min</span>
 </div>
 <span className="text-[11px] text-[#7C8DA8] font-medium mt-0.5 block">
 {prediction.predicted_delay_minutes > 5 ? 'Running later than schedule' : 'Running close to schedule'}
 </span>
 </div>

 {/* Predicted ETA */}
 <div className="rounded-none bg-[#F1F5F9] border border-[#E2E8F0] p-4">
 <span className="block text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
 Predicted ETA
 </span>
 <div className="mt-1 font-mono text-2xl sm:text-3xl font-black text-[#1D4ED8]">
 {prediction.predicted_eta}
 </div>
 <span className="text-[11px] text-[#7C8DA8] font-medium mt-0.5 block break-words">
 Sched. {prediction.scheduled_arrival} at {prediction.target_station}
 </span>
 </div>

 {/* Confidence */}
 <div className="rounded-none bg-[#F1F5F9] border border-[#E2E8F0] p-4 lg:col-span-2">
 <div className="flex items-center justify-between">
 <span className="text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
 AI Confidence
 </span>
 <span className="font-mono text-lg font-black text-[#13213E]">
 {(prediction.confidence * 100).toFixed(0)}%
 </span>
 </div>
 <div className="mt-3 h-2.5 rounded-none bg-[#E2E8F0] overflow-hidden">
 <div
 className="h-full rounded-none bg-[#1D4ED8]"
 style={{ width: `${Math.max(0, Math.min(100, prediction.confidence * 100))}%` }}
 />
 </div>
 <span className="text-[11px] text-[#7C8DA8] font-medium mt-2 block">
 Model certainty based on held-out test accuracy
 </span>
 </div>
 </div>

 {/* Model provenance footer */}
 <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] font-mono text-[#7C8DA8]">
 <span className="flex items-center gap-1.5">
 <Cpu className="w-3 h-3 text-[#1D4ED8]" />
 <span className="text-[#64748B]">Model:</span> {prediction.model_used}
 </span>
 <span>
 Data source: <span className="text-[#64748B] font-bold">{prediction.data_source}</span>
 </span>
 </div>
 </>
 )}
 </div>

 {/* 3. REAL-TIME DYNAMIC ETA (live NTES + trained ML hybrid, auto-refreshes) */}
  <div id="dynamic-eta" className="bg-[#FFFFFF] rounded-none p-6 sm:p-8 shadow-soft border border-[#E2E8F0] relative overflow-hidden">
  <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1D4ED8]" />

  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
  <div className="flex items-center gap-3">
  <div className="w-11 h-11 rounded-none bg-[#13213E] text-white flex items-center justify-center shrink-0">
  <Gauge className="w-6 h-6" />
  </div>
  <div>
  <h3 className="text-base sm:text-lg font-black text-[#13213E] tracking-tight">
  Real-Time Dynamic ETA
  </h3>
  <p className="text-xs text-[#64748B] font-medium">
  Combines the trained ML engine with live NTES position &amp; delay • auto-refreshes every 30 s
  </p>
  </div>
  </div>

  <div className="flex items-center gap-2 self-start sm:self-auto">
  {fullPred && !fullPredError && (
  <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-none bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
  <span className="w-1.5 h-1.5 rounded-none bg-emerald-500/100" />
  LIVE • updated {lastUpdatedAgo}s ago
  </span>
  )}
  {fullPredLoading && fullPred && (
  <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-none bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]">
  <span className="w-3 h-3 rounded-none border-2 border-[#1D4ED8] border-t-transparent" />
  Refreshing…
  </span>
  )}
  </div>
  </div>

  {/* LOADING (first paint only) */}
  {fullPredLoading && !fullPred && !fullPredError && (
  <div className="flex items-center justify-center gap-3 py-6 border border-dashed border-[#E2E8F0] rounded-none bg-[#F1F5F9]">
  <div className="w-5 h-5 rounded-none border-2 border-[#1D4ED8] border-t-transparent" />
  <span className="text-sm font-semibold text-[#64748B]">Computing dynamic ETA…</span>
  </div>
  )}

  {/* ERROR STATE — existing AI forecast still works */}
  {!fullPredLoading && fullPredError && (
  <div className="rounded-none bg-[#EEF4FC] border border-[#1D4ED8]/30 p-4 flex items-start gap-3">
  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
  <div className="flex-1">
  <p className="text-sm font-bold text-[#13213E]">Dynamic ETA temporarily unavailable</p>
  <p className="text-xs text-[#64748B] mt-0.5 break-words">{fullPredError}. The static AI forecast above still uses the trained model.</p>
  </div>
  </div>
  )}

  {/* SUCCESS */}
  {!fullPredError && fullPred && (
  <>
  {/* Live status strip */}
  <div className="flex flex-col md:flex-row md:items-center gap-2 pb-4 mb-4 border-b border-[#E2E8F0] text-xs">
  <span
  className={`inline-flex items-center gap-1.5 font-black uppercase tracking-wider text-[10px] px-2.5 py-1 rounded-none border ${
  fullPred.live_status.live_available
  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
  : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
  }`}
  >
  {fullPred.live_status.live_available ? 'NTES Live Feed' : 'No Live Feed — ML estimate'}
  </span>
  <span className="text-[#64748B]">
  Current:{' '}
  <strong className="text-[#13213E]">
  {fullPred.live_status.current_station_name || fullPred.live_status.current_station || '—'}
  {fullPred.live_status.current_station ? ` (${fullPred.live_status.current_station})` : ''}
  </strong>
  </span>
  <span className="text-[#64748B]">
  Next:{' '}
  <strong className="text-[#13213E]">{fullPred.live_status.next_station || '—'}</strong>
  </span>
  {fullPred.live_status.current_delay_minutes !== null && (
  <span className="text-[#64748B]">
  Now:{' '}
  <strong className={fullPred.live_status.current_delay_minutes > 5 ? 'text-amber-600' : 'text-emerald-600'}>
  {fullPred.live_status.current_delay_minutes} min late
  </strong>
  </span>
  )}
  <span className="md:ml-auto text-[10px] font-mono text-[#7C8DA8]">
  Updated {fullPred.live_status.last_updated || '—'} • generated {fullPred.generated_at}
  </span>
  </div>

  {/* Key stats */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
  <div className="rounded-none bg-[#F1F5F9] border border-[#E2E8F0] p-4">
  <span className="block text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
  ML Base Delay
  </span>
  <div className="mt-1 font-mono text-xl sm:text-2xl font-black text-[#13213E]">
  {fullPred.prediction.ml_base_delay}<span className="text-xs font-bold text-[#64748B] ml-0.5">min</span>
  </div>
  <span className="text-[11px] text-[#7C8DA8] font-medium mt-0.5 block">
  22-feature trained model → next stop
  </span>
  </div>

  <div className="rounded-none bg-[#F1F5F9] border border-[#E2E8F0] p-4">
  <span className="block text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
  Live-Adjusted Delay
  </span>
  <div className={`mt-1 font-mono text-xl sm:text-2xl font-black ${fullPred.prediction.live_adjusted_delay > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
  {fullPred.prediction.live_adjusted_delay}<span className="text-xs font-bold text-[#64748B] ml-0.5">min</span>
  </div>
  <span className="text-[11px] text-[#7C8DA8] font-medium mt-0.5 block">
  After live delay, speed &amp; congestion blending
  </span>
  </div>

  <div className="rounded-none bg-[#F1F5F9] border border-[#E2E8F0] p-4">
  <span className="block text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
  Dest. ETA
  </span>
  <div className="mt-1 font-mono text-xl sm:text-2xl font-black text-[#1D4ED8]">
  {fullPred.prediction.target_eta || '—'}
  </div>
  <span className="text-[11px] text-[#7C8DA8] font-medium mt-0.5 block break-words">
  Sched. {fullPred.prediction.scheduled_arrival} at {fullPred.prediction.target_station}
  </span>
  </div>

  <div className="rounded-none bg-[#F1F5F9] border border-[#E2E8F0] p-4">
  <span className="block text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
  Congestion
  </span>
  <div className="mt-1 flex items-center gap-2">
  <span
  className={`font-mono text-xl sm:text-2xl font-black ${
  fullPred.congestion.level === 'LOW'
  ? 'text-emerald-600'
  : fullPred.congestion.level === 'MEDIUM'
  ? 'text-amber-600'
  : fullPred.congestion.level === 'HIGH'
  ? 'text-red-600'
  : 'text-[#7C8DA8]'
  }`}
  >
  {fullPred.congestion.level || 'UNKNOWN'}
  </span>
  {fullPred.congestion.score !== null && (
  <span className="font-mono text-sm font-black text-[#64748B]">{fullPred.congestion.score}</span>
  )}
  </div>
  <span className="text-[11px] text-[#7C8DA8] font-medium mt-0.5 block">
  {fullPred.congestion.estimated ? 'Estimated — no onboard signals' : 'From live NTES factors'} • source: {fullPred.congestion.basis}
  </span>
  </div>
  </div>

  {/* Transparent factor breakdown */}
  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
  {[
  { label: 'Progress', value: fullPred.prediction.breakdown.progress_factor, raw: fullPred.prediction.breakdown.progress_factor, fmt: (v: number | null) => `${Math.round((v ?? 0) * 100)}%`, src: fullPred.prediction.sources.progress },
  { label: 'Speed factor', value: fullPred.prediction.breakdown.speed_factor, raw: fullPred.prediction.breakdown.speed_factor, fmt: (v: number | null) => `${(v ?? 1).toFixed(2)}×`, src: fullPred.prediction.sources.speed },
  { label: 'Congestion factor', value: fullPred.prediction.breakdown.congestion_factor, raw: fullPred.prediction.breakdown.congestion_factor, fmt: (v: number | null) => `${(v ?? 1).toFixed(2)}×`, src: fullPred.prediction.sources.congestion },
  { label: 'Live delay', value: fullPred.prediction.breakdown.current_live_delay, raw: fullPred.prediction.breakdown.current_live_delay, fmt: (v: number | null) => (v === null ? 'unavailable' : `${v} min`), src: fullPred.prediction.sources.live_delay },
  ].map((f) => (
  <div key={f.label} className="p-2.5 rounded-none bg-[#FFFFFF] border border-[#E2E8F0]">
  <span className="block text-[9px] uppercase font-bold text-[#7C8DA8]">{f.label}</span>
  <span className="font-mono font-black text-[#13213E]">{f.fmt(f.raw)}</span>
  <span className="block text-[9px] font-mono text-[#7C8DA8] capitalize">source: {f.src}</span>
  </div>
  ))}
  </div>

  {/* Upcoming stations ETAs */}
  <div className="mt-5">
  <div className="flex items-center justify-between mb-2">
  <h4 className="text-xs font-black uppercase tracking-wider text-[#13213E]">
  Station-wise ETAs
  </h4>
  <span className="text-[10px] font-mono text-[#7C8DA8]">Model: {fullPred.prediction.model_used}</span>
  </div>

  {fullPred.upcoming_stations.length === 0 ? (
  <p className="text-xs text-[#7C8DA8] border border-dashed border-[#E2E8F0] p-3 rounded-none bg-[#F1F5F9]">
  Train is at (or past) the final stoppage — no upcoming stations.
  </p>
  ) : (
  <div className="space-y-2">
  {fullPred.upcoming_stations.map((s) => (
  <div key={`${s.station_code}-${s.station_index}`} className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 rounded-none bg-[#FFFFFF] border border-[#E2E8F0] text-xs">
  <div className="col-span-2 sm:col-span-1">
  <span className="block font-bold text-[#13213E]">{s.station_name}</span>
  <span className="block text-[10px] font-mono text-[#7C8DA8]">{s.station_code} • {s.distance_remaining_km} km to go</span>
  </div>
  <div>
  <span className="block text-[10px] uppercase font-bold text-[#64748B]">Sched.</span>
  <span className="font-mono font-bold text-[#13213E]">{s.scheduled_arrival}</span>
  </div>
  <div>
  <span className="block text-[10px] uppercase font-bold text-[#64748B]">Delay</span>
  <span className={`font-mono font-bold ${s.predicted_delay_minutes > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
  {s.predicted_delay_minutes} min
  </span>
  </div>
  <div className="sm:col-span-1">
  <span className="block text-[10px] uppercase font-bold text-[#64748B]">ETA</span>
  <span className="font-mono font-black text-[#1D4ED8]">{s.predicted_eta || '—'}</span>
  </div>
  <div>
  <span
  className={`inline-block text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-none border ${
  s.delay_source === 'live_corrected'
  ? 'bg-[#EEF4FC] text-[#1D4ED8] border-[#1D4ED8]/25'
  : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
  }`}
  >
  {s.delay_source === 'live_corrected' ? 'Live Corrected' : 'ML Projected'}
  </span>
  <span className="block text-[10px] font-mono text-[#7C8DA8] mt-0.5">conf {(s.confidence * 100).toFixed(0)}%</span>
  </div>
  </div>
  ))}
  </div>
  )}
  </div>
  </>
  )}
  </div>

  {/* 2. DESKTOP SPLIT COMMAND CENTER:
 Left (65%): Station-by-Station Timeline (Where is my train)
 Right (35%): Boarding Pass + Route Map + Coach Rake */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
 
 {/* LEFT COLUMN: Vertical Station Route Timeline */}
 <div className="lg:col-span-8 bg-[#FFFFFF] rounded-none p-6 sm:p-8 shadow-soft border border-[#E2E8F0]">
 
 {/* Header & Intermediate Stops Toggle */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 mb-6 border-b border-[#E2E8F0]">
 <div>
 <h3 className="text-xl font-bold text-[#13213E] flex items-center gap-2">
 <TrainIcon className="w-5 h-5 text-[#1D4ED8]" />
 Station-by-Station Live Timeline
 </h3>
 <p className="text-xs text-[#64748B] mt-0.5">
 Scheduled vs Actual Arrival times, platforms, and real-time station countdown
 </p>
 </div>

 {/* Toggle Intermediate Non-Stop Stations */}
 <button
 onClick={() => setShowIntermediate(!showIntermediate)}
 className="flex items-center gap-2 px-3 py-1.5 rounded-none bg-[#F1F5F9] hover:bg-[#EEF4FC] border border-[#E2E8F0] text-xs font-semibold text-[#4A5A79] "
 >
 {showIntermediate ? <EyeOff className="w-3.5 h-3.5 text-[#1D4ED8]" /> : <Eye className="w-3.5 h-3.5 text-[#1D4ED8]" />}
 <span>{showIntermediate ? 'Hide Wayside Stations' : 'Show Intermediate Stations'}</span>
 </button>
 </div>

 {/* Timeline Track */}
 <div className="relative pl-6 sm:pl-8 space-y-6">
 
 {/* Continuous Vertical Railway Track Line */}
 <div className="absolute left-[19px] sm:left-[27px] top-4 bottom-4 w-1 bg-[#E2E8F0] -translate-x-1/2 rounded-none" />

 {displayStops.map((station, idx) => {
 const isPassed = liveActive ? station.status === 'passed' : idx < activeStationIdx;
 const isCurrent = liveActive ? station.status === 'current' : idx === activeStationIdx;
 const isNext =
 !isCurrent &&
 !isPassed &&
 (liveActive
 ? hasCurrent
 ? idx === currentIdx + 1
 : idx === 0
 : idx === activeStationIdx + 1);
 const isLast = idx === displayStops.length - 1;

 return (
 <React.Fragment key={station.stationCode}>
 
 {/* Station Node Row */}
 <div
 className={`relative flex items-start gap-4 sm:gap-6 p-4 rounded-none ${
 isCurrent
 ? 'bg-[#EEF4FC] border border-[#1D4ED8]/30 shadow-xs'
 : isNext
 ? 'bg-[#F1F5F9] border border-[#E2E8F0]'
 : isPassed
 ? 'opacity-70 hover:opacity-100'
 : 'hover:bg-[#F1F5F9]'
 }`}
 >
 {/* Track Node Circle */}
 <div className="absolute -left-[25px] sm:-left-[33px] top-6 -translate-x-1/2 flex items-center justify-center">
 {isPassed ? (
 <div className="w-5 h-5 rounded-none bg-emerald-500/100 text-white flex items-center justify-center shadow-xs">
 <CheckCircle2 className="w-3 h-3" />
 </div>
 ) : isCurrent ? (
 <div className="w-6 h-6 rounded-none bg-[#1D4ED8] text-white flex items-center justify-center ring-4 ring-[#1D4ED8]/20">
 <Navigation className="w-3.5 h-3.5 " />
 </div>
 ) : isNext ? (
 <div className="w-5 h-5 rounded-none bg-[#FFFFFF] border-2 border-[#1D4ED8] flex items-center justify-center">
 <div className="w-2 h-2 rounded-none bg-[#1D4ED8]" />
 </div>
 ) : (
 <div className="w-4 h-4 rounded-none bg-[#FFFFFF] border-2 border-[#D6E0EC]" />
 )}
 </div>

 {/* Distance from origin */}
 <div className="w-14 sm:w-16 shrink-0 text-right">
 <span className="font-mono text-xs font-bold text-[#64748B] block">
 {station.distanceKm} km
 </span>
 <span className="text-[10px] text-[#7C8DA8] block">
 {station.haltMinutes ? `${station.haltMinutes}m halt` : 'source'}
 </span>
 </div>

 {/* Station Name & Details */}
 <div className="flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-none bg-[#FFFFFF] border border-[#E2E8F0] text-[#13213E]">
 {station.stationCode}
 </span>
 <h4 className={`text-sm sm:text-base font-bold ${isCurrent ? 'text-[#1D4ED8]' : 'text-[#13213E]'}`}>
 {station.stationName}
 </h4>
 {isCurrent && (
 <span className="text-[10px] uppercase font-black bg-[#1D4ED8] text-white px-2 py-0.5 rounded-none">
 Current Halt
 </span>
 )}
 {isNext && (
 <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-none">
 Next Stop
 </span>
 )}
 </div>

 {/* Timings: Scheduled vs Actual */}
 <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
 <div className="p-2 rounded-none bg-[#FFFFFF] border border-[#E2E8F0]">
 <span className="block text-[10px] text-[#64748B] uppercase font-semibold">Sch. Arr</span>
 <span className="font-mono font-bold text-[#13213E]">{station.scheduledArrival}</span>
 </div>
 <div className="p-2 rounded-none bg-[#FFFFFF] border border-[#E2E8F0]">
 <span className="block text-[10px] text-[#64748B] uppercase font-semibold">Actual Arr</span>
 <span className={`font-mono font-bold ${station.delayMinutes > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
 {station.actualArrival ?? '—'}
 </span>
 </div>
 <div className="p-2 rounded-none bg-[#FFFFFF] border border-[#E2E8F0]">
 <span className="block text-[10px] text-[#64748B] uppercase font-semibold">Sch. Dep</span>
 <span className="font-mono font-bold text-[#13213E]">{station.scheduledDeparture}</span>
 </div>
 <div className="p-2 rounded-none bg-[#FFFFFF] border border-[#E2E8F0] flex items-center justify-between">
 <div>
 <span className="block text-[10px] text-[#64748B] uppercase font-semibold">Platform</span>
 <span className="font-bold text-[#1D4ED8]">PF #{station.platform ?? '—'}</span>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* SINGLE LIVE TRAIN POSITION MARKER — rendered once, after its stop row */}
 {markerIndex === idx && liveActive && (
 <div className="relative flex items-start gap-4 sm:gap-6 p-4 py-3">
 {/* Symbolic train riding the timeline rail */}
 <div className="absolute -left-[25px] sm:-left-[33px] top-4 -translate-x-1/2">
 <div className="relative">
 <span className="absolute inset-0 rounded-none bg-[#1D4ED8]/40 " />
 <div className="relative w-9 h-9 rounded-none bg-[#1D4ED8] text-white flex items-center justify-center ring-4 ring-[#1D4ED8]/20">
 <TrainIcon className="w-5 h-5" />
 </div>
 </div>
 </div>

 {/* Compact LIVE TRAIN POSITION card */}
 <div className="flex-1 max-w-sm min-w-0 rounded-none bg-[#FFFFFF] border border-[#1D4ED8]/25 shadow-soft p-4">
 <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
 <span className="text-[11px] font-black uppercase tracking-wider text-[#13213E] flex items-center gap-1.5">
 <TrainIcon className="w-4 h-4 text-[#1D4ED8]" />
 LIVE TRAIN
 {live.position.atStation && (
 <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-none bg-[#EEF4FC] text-[#1D4ED8] border border-[#1D4ED8]/25">
 Halted
 </span>
 )}
 </span>
 <span className="text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded-none bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
 NTES Live
 </span>
 </div>

 <div className="space-y-1.5 text-xs">
 <div className="flex justify-between gap-3">
 <span className="text-[#64748B] flex items-center gap-1.5">
 <MapPin className="w-3 h-3 text-[#1D4ED8]" />
 Last reported
 </span>
 <span className="font-bold text-[#13213E] text-right break-words">
 {live.position.lastReported.name || '—'} ({live.position.lastReported.code || '—'})
 </span>
 </div>

 <div className="flex justify-between gap-3">
 <span className="text-[#64748B] flex items-center gap-1.5">
 <Navigation className="w-3 h-3 text-[#1D4ED8] " />
 Upcoming
 </span>
 <span className="font-bold text-[#13213E] text-right break-words">
 {live.position.nextImmediate.name || '—'} ({live.position.nextImmediate.code || '—'})
 </span>
 </div>

 {live.position.passingThrough && (
 <div className="flex justify-end">
 <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-none bg-amber-500/10 text-amber-700 border border-amber-500/30">
 Passing through / Non-stopping
 </span>
 </div>
 )}

 <div className="flex justify-between gap-3">
 <span className="text-[#64748B] flex items-center gap-1.5">
 <Flag className="w-3 h-3 text-[#1D4ED8]" />
 Next halt
 </span>
 <span className="font-bold text-[#13213E] text-right break-words">
 {live.position.nextStoppage.name || '—'} ({live.position.nextStoppage.code || '—'})
 </span>
 </div>

 <div className="flex justify-between gap-3">
 <span className="text-[#64748B] flex items-center gap-1.5">
 <Clock className="w-3 h-3 text-[#1D4ED8]" />
 Delay
 </span>
 <span
 className={`font-mono font-bold ${
 live.punctual || live.delayMinutes <= 0
 ? 'text-emerald-600'
 : 'text-amber-600'
 }`}
 >
 {live.punctual || live.delayMinutes <= 0
 ? 'On Time'
 : `${live.delayMinutes} min late`}
 </span>
 </div>
 </div>

 {live.statusText && (
 <p className="mt-2.5 pt-2.5 border-t border-[#E5EDF7] text-[11px] leading-snug text-[#4A5A79]">
 {live.statusText}
 </p>
 )}

 <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-[#7C8DA8]">
 <span>Updated {live.lastUpdate || '—'}</span>
 <span>Speed · GPS · distance: unavailable</span>
 </div>
 </div>
 </div>
 )}

 {/* Intermediate wayside stations toggler */}
 {showIntermediate && !isLast && (
 <div className="pl-6 py-1 border-l-2 border-dashed border-[#E2E8F0] ml-3 text-[11px] text-[#7C8DA8] space-y-1">
 <div className="flex items-center gap-2">
 <span className="w-1.5 h-1.5 rounded-none bg-[#B9C4D4]" />
 <span>
 {liveActive
 ? 'Pass-through/wayside stations: not included in the NTES live payload'
 : 'Intermediate waypoints: demo detail (SIMULATED)'}
 </span>
 </div>
 </div>
 )}

 </React.Fragment>
 );
 })}

 </div>
 </div>

 {/* RIGHT COLUMN: Boarding Pass + Live Map + Coach Rake Position */}
 <div className="lg:col-span-4 space-y-6">
 
 {/* Boarding Pass Ticket Card (Directly inspired by Image 3) */}
 <div className="bg-[#FFFFFF] rounded-none p-6 shadow-soft border border-[#E2E8F0] relative overflow-hidden">
 
 <div className="flex items-center justify-between mb-4">
 <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
 Boarding Pass
 </span>
 <span className="text-xs font-mono font-bold text-[#1D4ED8] bg-[#EEF4FC] px-2.5 py-1 rounded-none">
 {train.distanceKm} KM
 </span>
 </div>

 {/* Top Wavy Curve Preview */}
 <div className="py-2">
 <div className="flex justify-between items-center text-xs font-bold text-[#13213E] mb-1">
 <span>{train.sourceCode} (Dep {train.departureTime})</span>
 <span className="text-[#1D4ED8] bg-[#EEF4FC] px-2 py-0.5 rounded-none text-[10px]">
 {train.duration}
 </span>
 <span>{train.destinationCode} (Arr {train.arrivalTime})</span>
 </div>
 <svg className="w-full h-8" viewBox="0 0 260 25" fill="none">
 <path d="M 5 15 Q 65 0, 130 15 T 255 15" stroke="#1D4ED8" strokeWidth="2.5" fill="none" />
 <circle cx="5" cy="15" r="4" fill="#13213E" />
 <circle cx="130" cy="15" r="5" fill="#1D4ED8" />
 <circle cx="255" cy="15" r="4" fill="#1D4ED8" />
 </svg>
 </div>

{/* Blue Train Card */}
<div className="rounded-none bg-[#1D4ED8] p-4 text-white mt-2">
 <div className="flex items-center justify-between text-xs mb-2">
 <span className="font-bold uppercase tracking-wider text-white/80">{train.type}</span>
 <span className="font-mono font-bold bg-[#FFFFFF]/20 px-2 py-0.5 rounded-none">{train.trainNumber}</span>
 </div>
 <div className="text-base font-black">{train.trainName}</div>
 <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-white/20">
 <span>Depart: {train.departureTime}</span>
 <span>Arrive: {train.arrivalTime}</span>
 </div>
 </div>

 {/* Coach & Seat Details */}
 <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex justify-between text-xs">
 <div>
 <span className="text-[10px] text-[#64748B] uppercase font-bold block">Class & Coach</span>
 <span className="font-bold text-[#13213E]">Executive (EC) • Coach E1</span>
 </div>
 <div className="text-right">
 <span className="text-[10px] text-[#64748B] uppercase font-bold block">Seat Number</span>
 <span className="font-bold text-[#1D4ED8]">42A (Window)</span>
 </div>
 </div>

 {/* Barcode Strip */}
 <div className="mt-4 pt-3 border-t border-dashed border-[#E2E8F0] flex items-center justify-between">
 <div className="font-mono text-[10px] tracking-widest text-[#64748B]">
 |||| | ||||| || |||||| | |||| ||||
 </div>
 <span className="text-[10px] font-mono text-[#7C8DA8]">SEAT-LOCKED</span>
 </div>

 {/* Virtual Train Map button */}
 <button
 onClick={onOpenCoachLayout}
 className="w-full mt-4 py-3 rounded-none bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
 >
 <Layers className="w-4 h-4" />
 <span>Inspect Coach Position & Seat Map</span>
 </button>
 </div>

 {/* Coach Position Rake Indicator */}
 <div className="bg-[#FFFFFF] rounded-none p-6 shadow-soft border border-[#E2E8F0]">
 <div className="flex items-center justify-between mb-3">
 <h4 className="text-sm font-bold text-[#13213E] flex items-center gap-1.5">
 <Layers className="w-4 h-4 text-[#1D4ED8]" />
 Platform Coach Position
 </h4>
 <span className="text-[11px] text-[#64748B]">Engine ➔ Rear</span>
 </div>
 <p className="text-xs text-[#64748B] mb-3">
 Click any coach to see seat arrangement and platform standing spot:
 </p>

 {/* Horizontal coach formation */}
 <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
 {train.coaches.map((coach, cIdx) => (
 <button
 key={cIdx}
 onClick={onOpenCoachLayout}
 className={`shrink-0 px-2.5 py-2 rounded-none text-xs font-mono font-bold border ${
 coach.type === 'ENG'
 ? 'bg-[#2563EB] text-[#F8FAFC] border-[#2563EB]'
 : coach.type === 'EC'
 ? 'bg-[#EEF4FC] text-[#1D4ED8] border-[#1D4ED8]/40 hover:bg-[#EFF6FF]'
 : 'bg-[#F1F5F9] text-[#13213E] border-[#E2E8F0] hover:border-[#1D4ED8]'
 }`}
 title={`${coach.code} - ${coach.name}`}
 >
 <span className="block text-[11px]">{coach.code}</span>
 <span className="block text-[9px] text-[#64748B]">{coach.type}</span>
 </button>
 ))}
 </div>
 </div>

 {/* Telemetry & Weather Widget (Inspired by Image 1) */}
 <div className="bg-[#FFFFFF] rounded-none p-6 shadow-soft border border-[#E2E8F0] space-y-4">
 <h4 className="text-sm font-bold text-[#13213E] flex items-center gap-2">
 <Radio className="w-4 h-4 text-emerald-600 " />
 Telemetry &amp; Safety (demo data)
 </h4>

 <div className="space-y-2.5 text-xs">
 <div className="flex items-center justify-between p-2.5 rounded-none bg-[#F1F5F9] border border-[#E2E8F0]">
 <span className="text-[#64748B]">Locomotive Unit</span>
 <span className="font-mono font-bold text-[#13213E]">{train.currentStatus.locoNumber}</span>
 </div>

 <div className="flex items-center justify-between p-2.5 rounded-none bg-[#F1F5F9] border border-[#E2E8F0]">
 <span className="text-[#64748B]">Kavach Collision Shield</span>
 <span className="font-bold text-[#7C8DA8] flex items-center gap-1">
 <ShieldCheck className="w-3.5 h-3.5" /> Demo
 </span>
 </div>

 <div className="flex items-center justify-between p-2.5 rounded-none bg-[#F1F5F9] border border-[#E2E8F0]">
 <span className="text-[#64748B]">Destination Weather</span>
 <span className="font-bold text-[#13213E] flex items-center gap-1">
 <CloudSun className="w-3.5 h-3.5 text-amber-500" /> 28°C Clear Sky
 </span>
 </div>

 <div className="flex items-center justify-between p-2.5 rounded-none bg-[#F1F5F9] border border-[#E2E8F0]">
 <span className="text-[#64748B]">On-Board Pantry</span>
 <span className="font-bold text-emerald-600">Available</span>
 </div>
 </div>
 </div>

 </div>

 </div>
 </div>
 );
};
