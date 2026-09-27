'use client';

import React from 'react';
import { ArrowRightLeft, Search, CalendarDays, MapPin, ArrowRight } from 'lucide-react';

interface ServicesProps {
  onFindTrains: () => void;
  onFindTrain: () => void;
  onSchedule: () => void;
  onStations: () => void;
}

const SERVICES = [
  {
    icon: ArrowRightLeft,
    title: 'Find Trains',
    desc: 'Search trains between any two stations.',
    action: 'onFindTrains' as const,
  },
  {
    icon: Search,
    title: 'Find Train',
    desc: 'Look up a service by number or name.',
    action: 'onFindTrain' as const,
  },
  {
    icon: CalendarDays,
    title: 'Train Schedule',
    desc: 'View station-wise arrival and departure times.',
    action: 'onSchedule' as const,
  },
  {
    icon: MapPin,
    title: 'Station Search',
    desc: 'Explore trains arriving and departing a station.',
    action: 'onStations' as const,
  },
];

export const Services: React.FC<ServicesProps> = ({
  onFindTrains,
  onFindTrain,
  onSchedule,
  onStations,
}) => {
  const handlers: Record<string, () => void> = {
    onFindTrains,
    onFindTrain,
    onSchedule,
    onStations,
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-14 max-w-[1280px] mx-auto">
      <div className="flex flex-col items-start gap-2 mb-7">
        <span className="rb-eyebrow">Quick access</span>
        <h2 className="text-xl sm:text-2xl font-bold text-[#101F36] tracking-tight">Explore RailBuddy</h2>
        <p className="text-sm text-[#5B6B82]">Quick access to the tools you need for a better journey.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          return (
            <button
              key={service.title}
              type="button"
              onClick={handlers[service.action]}
              className="rb-card text-left p-6 cursor-pointer transition-colors hover:border-[#C9D8EA] hover:bg-[#FCFDFF]"
            >
              <div className="h-11 w-11 rounded-xl bg-[#EEF3F9] border border-[#E3E8EF] flex items-center justify-center text-[#123A6B]">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-bold text-[#101F36]">{service.title}</h3>
              <p className="mt-1.5 text-xs text-[#5B6B82] leading-relaxed">{service.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#123A6B]">
                Open <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
