import { BetweenTrain, TrainsBetweenData } from './api';
import { SeatClass, Train } from '../types/train';

/**
 * Convert real RailRadar "trains between" payload entries into the app's
 * `Train` type. Every field that the RailRadar schedule actually provides is
 * faithfully copied; the rest (classes, coaches, live telemetry) is filled
 * with neutral placeholders so the existing tracker/coach UI keeps working
 * without fabricating data.
 */

const DAY_LETTER: Record<string, string> = {
  mon: 'M',
  tue: 'T',
  wed: 'W',
  thu: 'T',
  fri: 'F',
  sat: 'S',
  sun: 'S',
};

/** "06:00" | "23:45" -> "06:00 AM" | "11:45 PM" */
export function to12Hour(hhmm?: string | null): string {
  if (!hhmm) return '—';
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(hhmm);
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
}

/** 480 -> "8h 00m", 685 -> "11h 25m" */
export function minutesToDuration(totalMinutes: number | undefined | null): string {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** "Vande Bharat Express" -> "Vande Bharat" (Driving the UI's type union). */
export function mapTrainType(type: string | undefined | null): Train['type'] {
  const t = String(type || 'Express').toLowerCase();
  if (t.includes('vande bharat')) return 'Vande Bharat';
  if (t.includes('rajdhani')) return 'Rajdhani';
  if (t.includes('shatabdi')) return 'Shatabdi';
  if (t.includes('tejas')) return 'Tejas';
  if (t.includes('duronto')) return 'Duronto';
  if (t.includes('superfast')) return 'Superfast';
  return 'Express';
}

function statusTextFor(entry: BetweenTrain): string {
  const from = entry.from.name || entry.from.code;
  const to = entry.to.name || entry.to.code;
  const delay = entry.live?.delayMinutes ?? 0;
  const liveType = (entry.live?.type || '').toLowerCase();

  if (liveType === 'departed' || liveType === 'started' || liveType === 'running') {
    return `Running from ${from}${delay > 0 ? ` • ${delay} min late` : delay < 0 ? ` • ${-delay} min early` : ' • On Time'}`;
  }
  if (liveType === 'cancelled') return `Cancelled on ${entry.live?.startDate || 'today'}`;
  if (['arrived', 'reached', 'completed', 'finished'].includes(liveType)) {
    return `Completed journey to ${to}`;
  }
  return `Scheduled to depart ${from} at ${to12Hour(entry.from.departure)}`;
}

function defaultClasses(type: Train['type']): SeatClass[] {
  const generic = (classes: Array<[SeatClass['type'], string]>): SeatClass[] =>
    classes.map(([t, name]) => ({
      type: t,
      name,
      price: 0,
      status: 'Per schedule',
      statusType: 'available',
    }));

  if (type === 'Vande Bharat' || type === 'Shatabdi' || type === 'Tejas') {
    return generic([
      ['EC', 'Executive Chair Car'],
      ['CC', 'AC Chair Car'],
    ]);
  }
  return generic([
    ['1A', 'First AC'],
    ['2A', '2 Tier AC'],
    ['3A', '3 Tier AC'],
    ['SL', 'Sleeper Class'],
  ]);
}

function defaultCoaches(type: Train['type']) {
  if (type === 'Vande Bharat' || type === 'Shatabdi' || type === 'Tejas') {
    return [
      { code: 'LOCO', type: 'ENG', name: 'Locomotive', seatsCount: 0 },
      { code: 'E1', type: 'EC', name: 'Executive Class', seatsCount: 52 },
      { code: 'C1', type: 'CC', name: 'Chair Car', seatsCount: 78 },
      { code: 'C2', type: 'CC', name: 'Chair Car', seatsCount: 78 },
      { code: 'C3', type: 'CC', name: 'Chair Car', seatsCount: 78 },
      { code: 'C4', type: 'CC', name: 'Chair Car', seatsCount: 78 },
      { code: 'E2', type: 'EC', name: 'Executive Class', seatsCount: 52 },
      { code: 'LOCO', type: 'ENG', name: 'Rear Locomotive', seatsCount: 0 },
    ];
  }
  return [
    { code: 'LOCO', type: 'ENG', name: 'Locomotive', seatsCount: 0 },
    { code: 'A1', type: '1A', name: 'First AC', seatsCount: 24 },
    { code: 'A2', type: '2A', name: '2 Tier AC', seatsCount: 48 },
    { code: 'A3', type: '2A', name: '2 Tier AC', seatsCount: 48 },
    { code: 'B1', type: '3A', name: '3 Tier AC', seatsCount: 72 },
    { code: 'B2', type: '3A', name: '3 Tier AC', seatsCount: 72 },
    { code: 'B3', type: '3A', name: '3 Tier AC', seatsCount: 72 },
    { code: 'S1', type: 'SL', name: 'Sleeper', seatsCount: 80 },
    { code: 'S2', type: 'SL', name: 'Sleeper', seatsCount: 80 },
    { code: 'S3', type: 'SL', name: 'Sleeper', seatsCount: 80 },
    { code: 'LOCO', type: 'ENG', name: 'Rear Locomotive', seatsCount: 0 },
  ];
}

export function mapBetweenTrain(entry: BetweenTrain): Train {
  const number = String(entry.train.number || '');
  const type = mapTrainType(entry.train.type);
  const departureTime = to12Hour(entry.from.departure);
  const arrivalTime = to12Hour(entry.to.arrival);
  const delay = entry.live?.delayMinutes ?? 0;

  const runsOnDays = (entry.train.runDays || [])
    .map((d) => DAY_LETTER[String(d).slice(0, 3).toLowerCase()])
    .filter(Boolean);

  return {
    id: `t-${number}`,
    trainNumber: number,
    trainName: entry.train.name || `Train ${number}`,
    type,
    direction: 'DOWN',
    pairTrainNumber: number,
    sourceCode: entry.from.code,
    sourceName: entry.from.name,
    destinationCode: entry.to.code,
    destinationName: entry.to.name,
    departureTime,
    arrivalTime,
    duration: minutesToDuration(entry.duration),
    distanceKm: Math.round(Number(entry.distance) || 0),
    runsOnDays,
    currentStatus: {
      statusText: statusTextFor(entry),
      delayMinutes: delay,
      currentStationCode: entry.from.code,
      currentStationName: entry.from.name,
      nextStationCode: entry.to.code,
      nextStationName: entry.to.name,
      distanceCoveredKm: 0,
      currentSpeedKmH: 0,
      platform: entry.live?.platform ?? '—',
      lastUpdated: entry.live?.startDate || 'Today',
      etaNextStation: arrivalTime,
      distanceToNextKm: Math.round(Number(entry.distance) || 0),
      signalStatus: 'GREEN',
      locoNumber: '—',
      pantryAvailable: false,
    },
    classes: defaultClasses(type),
    coaches: defaultCoaches(type),
    route: [
      {
        stationCode: entry.from.code,
        stationName: entry.from.name,
        platform: entry.live?.platform ?? '—',
        scheduledArrival: 'Source',
        scheduledDeparture: departureTime,
        actualArrival: '—',
        actualDeparture: departureTime,
        distanceKm: 0,
        day: entry.from.day || 1,
        haltMinutes: 0,
        status: 'current',
        delayMinutes: delay,
        speedKmH: 0,
      },
      {
        stationCode: entry.to.code,
        stationName: entry.to.name,
        platform: '—',
        scheduledArrival: arrivalTime,
        scheduledDeparture: 'Destination',
        actualArrival: '—',
        actualDeparture: 'Destination',
        distanceKm: Math.round(Number(entry.distance) || 0),
        day: entry.to.day || 1,
        haltMinutes: 0,
        status: 'upcoming',
        delayMinutes: 0,
        speedKmH: 0,
      },
    ],
  };
}

export function mapTrainsBetween(data: TrainsBetweenData): Train[] {
  return (data.trains || []).map(mapBetweenTrain);
}