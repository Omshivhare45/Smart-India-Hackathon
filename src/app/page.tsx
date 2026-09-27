'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Radio,
  AlertTriangle,
  RefreshCw,
  Database,
  Cpu,
  Sparkles,
  Search,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { VIEW_META, VIEW_ICON } from '../components/layout/navConfig';
import { SearchHero, journeyDateOptions, journeyDateToISO } from '../components/SearchHero';
import { Services } from '../components/Services';
import { TrainCard } from '../components/TrainCard';
import { RealTrainCard } from '../components/RealTrainCard';
import { LiveTrainTracker } from '../components/LiveTrainTracker';
import { StationRadar } from '../components/StationRadar';
import { StationDirectory } from '../components/StationDirectory';
import { TrainStationBoard } from '../components/TrainStationBoard';
import { CoachSeatModal } from '../components/CoachSeatModal';
import { PNRStatusCard } from '../components/PNRStatusCard';
import { Dashboard } from '../components/Dashboard';
import { AnalyticsView } from '../components/views/AnalyticsView';
import { WeatherView } from '../components/views/WeatherView';
import { SettingsView } from '../components/views/SettingsView';
import { AboutView } from '../components/views/AboutView';
import { TRAINS } from '../data/trainData';
import { Train } from '../types/train';
import { fetchTrainsBetween } from '../lib/api';
import { mapTrainsBetween } from '../lib/realTrains';
const RailwayMap = dynamic(
  () => import('../components/map/RailwayMap').then((mod) => mod.RailwayMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[calc(100vh-64px)] bg-[#0B1524] flex items-center justify-center text-slate-400 font-mono text-xs">
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
  const [activeView, setActiveView] = useState<AppView>('home');

  // Navigation & search state
  const [activeTab, setActiveTab] = useState<'stations' | 'trainNumber'>('stations');
  const [sourceCode, setSourceCode] = useState<string>('NDLS');
  const [destCode, setDestCode] = useState<string>('BSB');
  const [trainQuery, setTrainQuery] = useState<string>('');
  const [travelDate, setTravelDate] = useState<string>(journeyDateOptions()[0]);
  const [selectedStationRadar, setSelectedStationRadar] = useState<string>('NDLS');

  // Active train selection for the tracker / timetable
  const [selectedLiveTrain, setSelectedLiveTrain] = useState<Train | null>(null);
  const [coachModalTrain, setCoachModalTrain] = useState<Train | null>(null);

  // Only true once the user has committed a search, so the landing page stays clean.
  const [searched, setSearched] = useState<boolean>(false);

  // REAL trains between the searched source/destination (RailRadar via Express backend)
  const [realTrains, setRealTrains] = useState<Train[]>([]);
  const [trainsLoading, setTrainsLoading] = useState<boolean>(false);
  const [trainsError, setTrainsError] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const searchSeqRef = useRef<number>(0);

  // Local catalogue fallback used before a search and when the live feed fails.
  const matchingTrains = useMemo(
    () =>
      TRAINS.filter(
        (t) =>
          (t.sourceCode === sourceCode || t.route.some((r) => r.stationCode === sourceCode)) &&
          (t.destinationCode === destCode || t.route.some((r) => r.stationCode === destCode)),
      ),
    [sourceCode, destCode],
  );

  const usingRealTrains = searchKey !== null && !trainsLoading && realTrains.length > 0;
  const displayTrains = usingRealTrains
    ? realTrains
    : matchingTrains.length > 0
      ? matchingTrains
      : TRAINS.slice(0, 3);

  const scrollToElement = (id: string) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 180);
  };

  const handleSearchStations = () => {
    setSearched(true);
    if (activeView === 'home') setActiveView('trains');

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
        if (mapped.length > 0) setSelectedLiveTrain((prev) => prev ?? mapped[0]);
      })
      .catch((err: unknown) => {
        if (seq !== searchSeqRef.current) return;
        setRealTrains([]);
        setTrainsError((err as Error).message || 'Could not fetch real trains.');
        setSelectedLiveTrain((prev) => prev ?? matchingTrains[0] ?? TRAINS[0]);
      })
      .finally(() => {
        if (seq === searchSeqRef.current) setTrainsLoading(false);
      });

    scrollToElement('train-results');
  };

  const handleSelectTrain = (train: Train) => {
    setSearched(true);
    setSelectedLiveTrain(train);
    setActiveView('live');
    scrollToElement('tracking');
  };

  // Focus the relevant section when a tracking view is activated.
  useEffect(() => {
    if (!selectedLiveTrain || !TRACKING_VIEWS.includes(activeView)) return;
    const target = activeView === 'eta' || activeView === 'delay' ? 'ai-forecast' : 'tracking';
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
  const meta = VIEW_META[activeView];
  const ViewIcon = VIEW_ICON[activeView] ?? Radio;

  const searchHeroProps = {
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
    onSearchStations: handleSearchStations,
    onSelectTrain: handleSelectTrain,
  };

  return (
    <AppShell active={activeView} onNavigate={(key) => setActiveView(key as AppView)}>
      {/* ============================================================ */}
      {/* HOME — hero search, quick access, data sources               */}
      {/* ============================================================ */}
      {activeView === 'home' && (
        <div className="pb-16">
          <SearchHero {...searchHeroProps} searched={false} variant="hero" />

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

          <section className="px-4 sm:px-6 lg:px-8 max-w-[1280px] mx-auto">
            <div className="rb-card p-6 sm:p-7">
              <span className="rb-eyebrow">Where the data comes from</span>
              <h2 className="mt-2 text-lg font-bold text-[#101F36]">Live feeds and forecasts</h2>
              <p className="mt-1 text-sm text-[#5B6B82] max-w-2xl">
                RailBuddy reads public railway sources on every request. Anything that cannot be
                resolved from a live feed is clearly labelled as demonstration data.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    icon: Radio,
                    title: 'NTES live running status',
                    desc: 'Station sequence, platforms and actual arrival/departure times for a tracked service.',
                  },
                  {
                    icon: Database,
                    title: 'RailRadar & station directory',
                    desc: 'Train discovery, trains-between-stations search and the full station catalogue.',
                  },
                  {
                    icon: Cpu,
                    title: 'Delay & ETA models',
                    desc: 'ML forecasts for the next stop, refreshed every 30 seconds while a train is tracked.',
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-xl border border-[#E3E8EF] bg-[#F7F9FC] p-4">
                      <div className="flex items-center gap-2 text-[#123A6B]">
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-bold text-[#101F36]">{item.title}</span>
                      </div>
                      <p className="mt-2 text-xs text-[#5B6B82] leading-relaxed">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ============================================================ */}
      {/* TRAINS — search + real results                              */}
      {/* ============================================================ */}
      {activeView === 'trains' && (
        <div className="pb-16">
          <SearchHero {...searchHeroProps} searched={searched} variant="plain" />

          {searched ? (
            <div id="train-results" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-[#E3E8EF]">
                <div>
                  <span className="rb-eyebrow">Search results</span>
                  <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold tracking-tight text-[#101F36]">
                    Trains {sourceCode} <span className="text-[#E07B2C]">&rarr;</span> {destCode}
                  </h2>
                  <p className="mt-1 text-xs text-[#5B6B82]">
                    {trainsLoading
                      ? 'Fetching real-time trains from the rail network…'
                      : `${usingRealTrains ? realTrains.length : displayTrains.length} services found · open a train to see its live status and timetable`}
                  </p>
                </div>

                <span className="rb-pill w-fit border border-[#E3E8EF] bg-white text-[#5B6B82]">
                  {trainsLoading ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin text-[#123A6B]" />
                      Fetching RailRadar…
                    </>
                  ) : usingRealTrains ? (
                    <>
                      <span className="rb-live-dot animate-pulse" />
                      Live source: RailRadar / IRCTC
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Offline catalogue
                    </>
                  )}
                </span>
              </div>

              {trainsLoading && (
                <div className="mt-5 rounded-xl border border-dashed border-[#C9D8EA] bg-[#F4F7FB] p-6 text-sm text-[#5B6B82] font-medium flex items-center gap-3">
                  <RefreshCw className="h-4 w-4 text-[#123A6B] animate-spin" />
                  Fetching all real trains between {sourceCode} and {destCode} from the RailRadar live feed…
                </div>
              )}

              {!trainsLoading && trainsError && (
                <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-[#101F36]">
                    <span className="font-bold">Could not fetch real trains.</span> {trainsError}{' '}
                    Showing the offline catalogue instead. Start the Express backend with{' '}
                    <code className="font-mono text-[#123A6B] bg-white px-1 py-0.5 border border-[#E3E8EF]">
                      npm run dev
                    </code>{' '}
                    in <code className="font-mono text-[#123A6B]">backend/</code> and{' '}
                    <code className="font-mono text-[#123A6B]">RAILRADAR_API_KEY</code> set.
                  </p>
                </div>
              )}

              {!trainsLoading && (
                <div className="mt-5 space-y-4">
                  {displayTrains.map((train) =>
                    usingRealTrains ? (
                      <RealTrainCard
                        key={train.id}
                        train={train}
                        onTrackLive={handleSelectTrain}
                        onOpenCoach={setCoachModalTrain}
                      />
                    ) : (
                      <TrainCard
                        key={train.id}
                        train={train}
                        onTrackLive={handleSelectTrain}
                        onOpenCoach={setCoachModalTrain}
                      />
                    ),
                  )}
                </div>
              )}

              <div id="pnr" className="mt-12">
                <PNRStatusCard
                  onTrackTrainByNumber={(num) => {
                    const found = TRAINS.find((t) => t.trainNumber === num);
                    if (found) handleSelectTrain(found);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
              <Services
                onFindTrains={() => setActiveTab('stations')}
                onFindTrain={() => setActiveTab('trainNumber')}
                onSchedule={() => setActiveView('live')}
                onStations={() => setActiveView('station')}
              />
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TRACKING VIEWS — schedule, ETA, delay, route timeline       */}
      {/* ============================================================ */}
      {isTrackingView && (
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="rb-card px-5 py-4 flex items-start gap-3.5">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-[#EEF3F9] border border-[#C9D8EA] text-[#123A6B] flex items-center justify-center">
              <ViewIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[#101F36]">
                {meta.title}
              </h1>
              <p className="text-xs sm:text-sm text-[#5B6B82] mt-0.5">{meta.description}</p>
            </div>
            <button
              onClick={() => setActiveView('trains')}
              className="rb-btn rb-btn-secondary rb-btn-sm ml-auto shrink-0"
            >
              Change train
            </button>
          </div>

          {selectedLiveTrain ? (
            <>
              <LiveTrainTracker
                train={selectedLiveTrain}
                onOpenCoachLayout={() => setCoachModalTrain(selectedLiveTrain)}
              />

              {(activeView === 'live' || activeView === 'route') && (
                <div className="max-w-[1280px] mx-auto">
                  <TrainStationBoard
                    train={selectedLiveTrain}
                    onSelectDirection={setSelectedLiveTrain}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="rb-card p-8 text-center">
              <Sparkles className="h-6 w-6 text-[#E07B2C] mx-auto" />
              <p className="mt-3 text-sm text-[#5B6B82]">
                Select a train to start <strong className="text-[#101F36]">live tracking</strong>,
                the timetable and the AI forecast.
              </p>
              <div className="mt-5 flex justify-center">
                <button onClick={() => setActiveView('trains')} className="rb-btn rb-btn-primary">
                  <Search className="h-4 w-4" />
                  <span>Find a train</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* STATIONS — searchable directory + terminal board            */}
      {/* ============================================================ */}
      {activeView === 'station' && (
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
          <div>
            <span className="rb-eyebrow">Stations</span>
            <h1 className="mt-1.5 text-xl sm:text-2xl font-extrabold tracking-tight text-[#101F36]">
              Find a railway station
            </h1>
            <p className="mt-1 text-sm text-[#5B6B82]">
              Search the full station directory, then open the terminal board to see what is
              arriving and departing.
            </p>
          </div>

          <StationDirectory
            selectedCode={selectedStationRadar}
            onSelect={(code) => {
              setSelectedStationRadar(code);
              setTimeout(
                () => document.getElementById('station-board')?.scrollIntoView({ behavior: 'smooth' }),
                80,
              );
            }}
          />

          <div id="station-board">
            <StationRadar
              stationCode={selectedStationRadar || sourceCode}
              onSelectTrain={handleSelectTrain}
            />
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* LIVE MAP — full-bleed                                        */}
      {/* ============================================================ */}
      {activeView === 'map' && (
        <div className="relative w-full h-[calc(100vh-64px)] min-h-[620px] overflow-hidden">
          <RailwayMap
            initialTrainNumber={selectedLiveTrain?.trainNumber || null}
            onSelectTrainExternal={(mapTrain) => {
              const match = TRAINS.find((t) => t.trainNumber === mapTrain.train_number);
              if (match) setSelectedLiveTrain(match);
            }}
          />
        </div>
      )}

      {/* ============================================================ */}
      {/* SECONDARY VIEWS                                              */}
      {/* ============================================================ */}
      {activeView === 'dashboard' && (
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto">
          <Dashboard
            onNavigate={(key) => setActiveView(key as AppView)}
            onTrackTrain={handleSelectTrain}
          />
        </div>
      )}

      {activeView === 'analytics' && (
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1200px] mx-auto">
          <AnalyticsView onNavigate={(key) => setActiveView(key as AppView)} />
        </div>
      )}

      {activeView === 'weather' && (
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1200px] mx-auto">
          <WeatherView />
        </div>
      )}

      {activeView === 'settings' && (
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1200px] mx-auto">
          <SettingsView />
        </div>
      )}

      {activeView === 'about' && (
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1200px] mx-auto">
          <AboutView />
        </div>
      )}

      {/* Interactive coach & seat modal */}
      {coachModalTrain && (
        <CoachSeatModal train={coachModalTrain} onClose={() => setCoachModalTrain(null)} />
      )}
    </AppShell>
  );
}
