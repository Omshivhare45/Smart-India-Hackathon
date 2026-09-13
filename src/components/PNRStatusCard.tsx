'use client';

import React, { useState } from 'react';
import {
 Ticket,
 Search,
 CheckCircle2,
 AlertCircle,
 Clock,
 Navigation,
 Users,
 ShieldCheck,
} from 'lucide-react';
import { PNRRecord } from '../types/train';
import { lookupPNR, PNR_RECORDS } from '../data/trainData';

interface PNRStatusCardProps {
 initialPnr?: string;
 autoLookup?: boolean;
 onTrackTrainByNumber?: (trainNum: string) => void;
}

export const PNRStatusCard: React.FC<PNRStatusCardProps> = ({
 initialPnr = '',
 autoLookup = false,
 onTrackTrainByNumber,
}) => {
 const [pnrInput, setPnrInput] = useState<string>(initialPnr || '2415893201');
 const [result, setResult] = useState<PNRRecord | null>(
 autoLookup && initialPnr ? lookupPNR(initialPnr) || null : null
 );
 const [error, setError] = useState<string>('');
 const [loading, setLoading] = useState<boolean>(false);

 const handleCheckPNR = (value?: string) => {
 const query = (value ?? pnrInput).replace(/\s/g, '');
 if (query.length !== 10) {
 setError('Enter a valid 10-digit PNR number');
 setResult(null);
 return;
 }
 setLoading(true);
 setError('');
 setTimeout(() => {
 const found = lookupPNR(query);
 setLoading(false);
 if (!found) {
 setResult(null);
 setError('PNR not found in this demo. Try 2415893201, 4521896730, or 8890123456.');
 return;
 }
setResult(found);
 }, 450);
};

 const statusColor = (status: string) => {
 if (status === 'CNF') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
 if (status === 'RAC') return 'bg-amber-50 text-amber-800 border-amber-600/30';
 return 'bg-rose-50 text-rose-700 border-rose-300';
 };

 return (
 <div className="bg-[#FFFFFF] rounded-none p-6 sm:p-8 shadow-soft border border-[#E2E8F0] relative overflow-hidden">
 <div className="flex items-center gap-3 mb-6">
 <div className="p-3 rounded-none bg-[#EEF4FC] text-[#1D4ED8] border border-[#1D4ED8]/20">
 <Ticket className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-extrabold text-xl text-[#13213E]">PNR Status Tracker</h3>
 <p className="text-xs text-[#64748B]">
 10-digit PNR lookup with passenger chart, coach, and confirmation chance
 </p>
 </div>
 </div>

 <div className="flex flex-col sm:flex-row gap-2.5">
 <input
 type="text"
 inputMode="numeric"
 maxLength={10}
 placeholder="Enter 10-digit PNR Number..."
 value={pnrInput}
 onChange={(e) => setPnrInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
 onKeyDown={(e) => {
 if (e.key === 'Enter') handleCheckPNR();
 }}
 className="flex-1 px-4 py-3.5 rounded-none bg-[#F1F5F9] border border-[#E2E8F0] text-sm font-semibold text-[#13213E] placeholder-[#7C8DA8] focus:outline-none focus:border-[#1D4ED8] font-mono"
 />
 <button
 onClick={() => handleCheckPNR()}
 disabled={loading}
 className="px-6 py-3.5 rounded-none bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer "
 >
 <Search className="w-4 h-4" />
 <span>{loading ? 'Checking...' : 'Check PNR'}</span>
 </button>
 </div>

 <div className="flex flex-wrap gap-2 mt-3">
 {PNR_RECORDS.map((sample) => (
 <button
 key={sample.pnr}
 onClick={() => {
 setPnrInput(sample.pnr);
 handleCheckPNR(sample.pnr);
 }}
 className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-none bg-[#F1F5F9] border border-[#E2E8F0] text-[#4A5A79] hover:text-[#1D4ED8] hover:border-[#1D4ED8]/40"
 >
 {sample.pnr} · {sample.passengers[0].currentStatus}
 </button>
 ))}
 </div>

 {error && (
 <div className="mt-4 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-300 rounded-none px-3 py-2">
 <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
 <span>{error}</span>
 </div>
 )}

 {result && (
 <div className="mt-6 p-5 sm:p-6 rounded-none bg-[#F1F5F9] border border-[#E2E8F0]">
 <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
 <div>
 <span className="text-[10px] uppercase font-bold text-[#64748B] block">PNR Number</span>
 <span className="text-lg font-mono font-black text-[#13213E]">{result.pnr}</span>
 </div>
 <span
 className={`px-3 py-1 rounded-none font-bold text-xs border flex items-center gap-1 ${statusColor(
 result.passengers[0].currentStatus
 )}`}
 >
 {result.passengers[0].currentStatus === 'CNF' ? (
 <CheckCircle2 className="w-3.5 h-3.5" />
 ) : (
 <Clock className="w-3.5 h-3.5" />
 )}
 {result.passengers[0].currentStatus === 'CNF'
 ? 'Confirmed'
 : result.passengers[0].currentStatus === 'RAC'
 ? 'RAC'
 : 'Waitlisted'}
 </span>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-4 text-xs">
 <div>
 <span className="text-[10px] uppercase font-semibold text-[#64748B] block">Train</span>
 <span className="font-bold text-[#13213E]">
 {result.trainNumber} {result.trainName}
 </span>
 </div>
 <div>
 <span className="text-[10px] uppercase font-semibold text-[#64748B] block">Journey</span>
 <span className="font-bold text-[#13213E]">{result.journeyDate}</span>
 </div>
 <div>
 <span className="text-[10px] uppercase font-semibold text-[#64748B] block">From → To</span>
 <span className="font-bold text-[#13213E]">
 {result.boardingCode} → {result.destinationCode}
 </span>
 </div>
 <div>
 <span className="text-[10px] uppercase font-semibold text-[#64748B] block">Class / Quota</span>
 <span className="font-bold text-[#1D4ED8]">
 {result.classType} · {result.quota}
 </span>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
 <div className="p-3 rounded-none bg-[#FFFFFF] border border-[#E2E8F0]">
 <span className="text-[10px] uppercase text-[#64748B] font-bold">Chart</span>
 <div className="font-bold text-[#13213E] mt-0.5">
 {result.chartPrepared ? 'Prepared' : 'Not prepared'}
 </div>
 </div>
 <div className="p-3 rounded-none bg-[#FFFFFF] border border-[#E2E8F0]">
 <span className="text-[10px] uppercase text-[#64748B] font-bold">Expected PF</span>
 <div className="font-bold text-[#1D4ED8] mt-0.5">Platform {result.expectedPlatform}</div>
 </div>
 <div className="p-3 rounded-none bg-[#FFFFFF] border border-[#E2E8F0]">
 <span className="text-[10px] uppercase text-[#64748B] font-bold">Prediction</span>
 <div className="font-bold text-emerald-600 mt-0.5">{result.prediction}</div>
 </div>
 </div>

 <div className="flex items-center gap-2 mb-2 text-xs font-bold text-[#13213E]">
 <Users className="w-4 h-4 text-[#1D4ED8]" />
 Passengers
 </div>
 <div className="space-y-2">
 {result.passengers.map((pax) => (
 <div
 key={pax.serial}
 className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-none bg-[#FFFFFF] border border-[#E2E8F0] text-xs"
 >
 <div>
 <div className="font-bold text-[#13213E]">
 {pax.serial}. {pax.name}
 </div>
 <div className="text-[#64748B]">
 {pax.age} yrs · {pax.gender}
 {pax.coach ? ` · ${pax.coach} / ${pax.berth} ${pax.berthType || ''}` : ''}
 </div>
 </div>
 <span className={`px-2.5 py-1 rounded-none border font-bold ${statusColor(pax.currentStatus)}`}>
 {pax.bookingStatus}
 </span>
 </div>
 ))}
 </div>

 <div className="pt-4 mt-4 border-t border-dashed border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
 <span className="text-xs text-[#64748B] flex items-center gap-1">
 <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
 Fare ₹{result.fare} · Booked {result.bookingDate}
 </span>
 <button
 onClick={() => onTrackTrainByNumber?.(result.trainNumber)}
 className="text-xs font-bold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] px-3.5 py-2 rounded-none flex items-center gap-1 "
 >
 <Navigation className="w-3.5 h-3.5" />
 Track this train live
 </button>
 </div>
 </div>
 )}
 </div>
 );
};
