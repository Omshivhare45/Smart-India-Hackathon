import {
  LayoutDashboard,
  TrainFront,
  Radio,
  AlarmClock,
  TimerOff,
  Route,
  CloudSun,
  Landmark,
  BarChart3,
  Settings,
  Info,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_MAIN: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'trains', label: 'Train Search', icon: TrainFront },
  { key: 'live', label: 'Live Train Status', icon: Radio },
  { key: 'eta', label: 'ETA Prediction', icon: AlarmClock },
  { key: 'delay', label: 'Delay Prediction', icon: TimerOff },
  { key: 'route', label: 'Route Intelligence', icon: Route },
  { key: 'weather', label: 'Weather Analysis', icon: CloudSun },
  { key: 'station', label: 'Station Analysis', icon: Landmark },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export const NAV_SECONDARY: NavItem[] = [
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'about', label: 'About RailBuddy', icon: Info },
];

export interface ViewMeta {
  title: string;
  breadcrumb: string[];
}

export const VIEW_META: Record<string, ViewMeta> = {
  dashboard: { title: 'Dashboard', breadcrumb: ['RailBuddy', 'Dashboard'] },
  trains: { title: 'Train Search', breadcrumb: ['RailBuddy', 'Train Search'] },
  live: { title: 'Live Train Status', breadcrumb: ['RailBuddy', 'Live Train Status'] },
  eta: { title: 'ETA Prediction', breadcrumb: ['RailBuddy', 'ETA Prediction'] },
  delay: { title: 'Delay Prediction', breadcrumb: ['RailBuddy', 'Delay Prediction'] },
  route: { title: 'Route Intelligence', breadcrumb: ['RailBuddy', 'Route Intelligence'] },
  weather: { title: 'Weather Analysis', breadcrumb: ['RailBuddy', 'Weather Analysis'] },
  station: { title: 'Station Analysis', breadcrumb: ['RailBuddy', 'Station Analysis'] },
  analytics: { title: 'Analytics', breadcrumb: ['RailBuddy', 'Analytics'] },
  settings: { title: 'Settings', breadcrumb: ['RailBuddy', 'Settings'] },
  about: { title: 'About RailBuddy', breadcrumb: ['RailBuddy', 'About RailBuddy'] },
};