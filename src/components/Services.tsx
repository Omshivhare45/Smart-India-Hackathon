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
 <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 max-w-[1280px] mx-auto">
 <div className="flex flex-col items-start gap-2 mb-8">
 <h2 className="text-xl sm:text-2xl font-bold text-[#13213E] tracking-tight">Explore RailBuddy</h2>
 <p className="text-sm text-[#64748B]">Quick access to the tools you need for a better journey.</p>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {SERVICES.map((service) => {
 const Icon = service.icon;
 return (
 <button
 key={service.title}
 type="button"
 onClick={handlers[service.action]}
 className="text-left bg-white border border-[#E2E8F0] hover:border-[#1D4ED8]/40 rounded-none p-6 cursor-pointer"
 >
 <div className="w-11 h-11 rounded-none bg-[#EEF4FC] border border-[#E2E8F0] flex items-center justify-center text-[#1D4ED8]">
 <Icon className="w-5 h-5" />
 </div>
 <h3 className="mt-4 text-sm font-bold text-[#13213E]">
 {service.title}
 </h3>
 <p className="mt-1.5 text-xs text-[#64748B] leading-relaxed">{service.desc}</p>
 <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8]">
 Open <ArrowRight className="w-3 h-3" />
 </span>
 </button>
 );
 })}
 </div>
 </section>
 );
};