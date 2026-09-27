import {
  AlarmClock,
  TimerOff,
  Route as RouteIcon,
  CloudSun,
  Landmark,
  BarChart3,
  Settings,
  Info,
  MapPin,
  LayoutDashboard,
  TrainFront,
  House,
  Radar,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Renders the pulsing LIVE badge next to the label. */
  highlight?: boolean;
}

/** Primary bar — the six destinations surfaced in the header. */
export const NAV_MAIN: NavItem[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'trains', label: 'Trains', icon: TrainFront },
  { key: 'station', label: 'Stations', icon: Landmark },
  { key: 'live', label: 'Schedule', icon: AlarmClock },
  { key: 'map', label: 'Live Map', icon: MapPin, highlight: true },
  { key: 'about', label: 'Help', icon: Info },
];

/** Everything else stays reachable through the "More" menu and mobile drawer. */
export const NAV_MORE: NavItem[] = [
  { key: 'eta', label: 'ETA Prediction', icon: AlarmClock },
  { key: 'delay', label: 'Delay Prediction', icon: TimerOff },
  { key: 'route', label: 'Route Timeline', icon: RouteIcon },
  { key: 'weather', label: 'Weather Analysis', icon: CloudSun },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export const NAV_ALL: NavItem[] = [...NAV_MAIN, ...NAV_MORE];

export interface ViewMeta {
  title: string;
  breadcrumb: string[];
  /** Short description shown at the top of the focused tracking views. */
  description?: string;
}

export const VIEW_META: Record<string, ViewMeta> = {
  home: { title: 'Home', breadcrumb: ['RailBuddy', 'Home'] },
  dashboard: { title: 'Dashboard', breadcrumb: ['RailBuddy', 'Dashboard'] },
  map: { title: 'Live Railway Map', breadcrumb: ['RailBuddy', 'Live Railway Map'] },
  trains: { title: 'Trains', breadcrumb: ['RailBuddy', 'Trains'] },
  station: { title: 'Stations', breadcrumb: ['RailBuddy', 'Stations'] },
  live: {
    title: 'Train Schedule',
    breadcrumb: ['RailBuddy', 'Train Schedule'],
    description: 'Station-wise timetable with the live NTES running feed.',
  },
  eta: {
    title: 'ETA Prediction',
    breadcrumb: ['RailBuddy', 'ETA Prediction'],
    description: 'AI arrival forecast toward the next stoppage, computed by the RailBuddy ML engine.',
  },
  delay: {
    title: 'Delay Prediction',
    breadcrumb: ['RailBuddy', 'Delay Prediction'],
    description: 'Predicted running delay toward the next stop with model confidence.',
  },
  route: {
    title: 'Route Timeline',
    breadcrumb: ['RailBuddy', 'Route Timeline'],
    description: 'Station-by-station scheduled vs actual timeline for the tracked service.',
  },
  weather: { title: 'Weather Analysis', breadcrumb: ['RailBuddy', 'Weather Analysis'] },
  analytics: { title: 'Analytics', breadcrumb: ['RailBuddy', 'Analytics'] },
  settings: { title: 'Settings', breadcrumb: ['RailBuddy', 'Settings'] },
  about: { title: 'Help', breadcrumb: ['RailBuddy', 'Help'] },
};

/** Small helper so pages can render a consistent section header. */
export const VIEW_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  home: House,
  trains: TrainFront,
  station: Radar,
  live: AlarmClock,
  map: MapPin,
  eta: AlarmClock,
  delay: TimerOff,
  route: RouteIcon,
  weather: CloudSun,
  analytics: BarChart3,
  dashboard: LayoutDashboard,
  settings: Settings,
  about: Info,
};
