'use client';

import React, { useState } from 'react';
import { X, Utensils, CheckCircle2, User, Sparkles, Shield, Info, Layers } from 'lucide-react';
import { Train, CoachInfo } from '../types/train';

interface CoachSeatModalProps {
 train: Train;
 onClose: () => void;
 onBookSuccess?: () => void;
}

export const CoachSeatModal: React.FC<CoachSeatModalProps> = ({ train, onClose, onBookSuccess }) => {
 const [selectedCoachIndex, setSelectedCoachIndex] = useState<number>(1);
 const [selectedSeat, setSelectedSeat] = useState<number | null>(12);
 const [mealSelected, setMealSelected] = useState<string>('Veg Standard Thali');
 const [bookingConfirmed, setBookingConfirmed] = useState<boolean>(false);

 const activeCoach: CoachInfo = train.coaches[selectedCoachIndex] || train.coaches[0];

 // Realistic seat matrix
 const seats = Array.from({ length: Math.min(activeCoach.seatsCount || 40, 48) }, (_, i) => {
 const seatNo = i + 1;
 const isBooked = [3, 7, 14, 15, 21, 22, 29, 30].includes(seatNo);
 const berthType =
 activeCoach.type === 'EC' || activeCoach.type === 'CC'
 ? seatNo % 3 === 1
 ? 'Window'
 : seatNo % 3 === 2
 ? 'Middle'
 : 'Aisle'
 : seatNo % 8 === 1 || seatNo % 8 === 4
 ? 'Lower'
 : seatNo % 8 === 2 || seatNo % 8 === 5
 ? 'Middle'
 : seatNo % 8 === 3 || seatNo % 8 === 6
 ? 'Upper'
 : seatNo % 8 === 7
 ? 'Side Lower'
 : 'Side Upper';

 return {
 seatNo,
 isBooked,
 berthType,
 };
 });

 const handleConfirmSeat = () => {
 setBookingConfirmed(true);
 if (onBookSuccess) onBookSuccess();
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 ">
 <div className="bg-[#FFFFFF] rounded-none max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[#E2E8F0]">
 {/* Header */}
 <div className="p-5 sm:p-6 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F1F5F9]">
 <div>
 <div className="flex items-center gap-2">
 <span className="px-2.5 py-0.5 rounded-none bg-[#1D4ED8] text-white font-mono text-xs font-bold ">
 {train.trainNumber}
 </span>
 <h3 className="font-bold text-xl text-[#13213E]">
 {train.trainName}
 </h3>
 </div>
 <p className="text-xs text-[#64748B] mt-0.5">
 Coach Composition, Platform Placement & Interactive Seat Map
 </p>
 </div>
 <button
 onClick={onClose}
 className="p-2 rounded-none bg-[#FFFFFF] hover:bg-[#EEF4FC] text-[#64748B] hover:text-[#1D4ED8] border border-[#E2E8F0] "
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Content Body */}
 <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
 {/* Coach Horizontal Strip */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
 <Layers className="w-3.5 h-3.5 text-[#1D4ED8]" />
 Rake / Train Formation:
 </span>
 <span className="text-[11px] text-[#7C8DA8]">Engine ➔ Rear</span>
 </div>
 <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
 {train.coaches.map((coach, idx) => {
 const isSelected = selectedCoachIndex === idx;
 const isEngine = coach.type === 'ENG' || coach.type === 'LOCO';
 const isPantry = coach.hasPantry || coach.type === 'PANTRY';

 return (
 <button
 key={idx}
 onClick={() => setSelectedCoachIndex(idx)}
 className={`shrink-0 px-4 py-3 rounded-none border text-center flex flex-col items-center justify-center min-w-[76px] cursor-pointer ${
 isSelected
 ? 'bg-[#1D4ED8] text-white font-bold border-[#1D4ED8] '
 : 'bg-[#F1F5F9] border-[#E2E8F0] hover:border-[#1D4ED8]/50 text-[#13213E]'
 }`}
 >
 <span className="text-xs font-mono font-bold">{coach.code}</span>
 <span className="text-[10px] mt-0.5 truncate max-w-[64px] opacity-85">
 {isEngine ? '⚡ ENGINE' : isPantry ? '🍽 PANTRY' : coach.type}
 </span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Active Coach Details & Seats Grid */}
 <div className="bg-[#F1F5F9] border border-[#E2E8F0] rounded-none p-4">
 <div className="flex items-center justify-between mb-4 border-b border-[#E2E8F0] pb-3">
 <div>
 <span className="text-sm font-bold text-[#13213E]">
 Coach {activeCoach.code}: {activeCoach.name}
 </span>
 <span className="text-xs text-[#64748B] block">
 Capacity: {activeCoach.seatsCount} Passengers • AC Chair Car
 </span>
 </div>
 <div className="flex items-center gap-3 text-[11px]">
 <span className="flex items-center gap-1 text-[#13213E] font-medium">
 <span className="w-2.5 h-2.5 rounded-none bg-[#FFFFFF] border border-[#D6E0EC] inline-block"></span> Available
 </span>
 <span className="flex items-center gap-1 text-[#7C8DA8]">
 <span className="w-2.5 h-2.5 rounded-none bg-[#B9C4D4] inline-block"></span> Booked
 </span>
 <span className="flex items-center gap-1 text-[#1D4ED8] font-bold">
 <span className="w-2.5 h-2.5 rounded-none bg-[#1D4ED8] inline-block"></span> Selected
 </span>
 </div>
 </div>

 {/* Seat Map */}
 {activeCoach.seatsCount === 0 ? (
 <div className="py-10 text-center text-[#64748B]">
 <Info className="w-8 h-8 text-[#1D4ED8] mx-auto mb-2 opacity-80" />
 <p className="text-sm font-semibold text-[#13213E]">
 {activeCoach.code === 'LOCO' ? 'Locomotive Cab (Restricted Access)' : 'Specialized Utility Coach'}
 </p>
 <p className="text-xs text-[#64748B] mt-1">
 No passenger seats configured in this section.
 </p>
 </div>
 ) : (
 <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 max-h-52 overflow-y-auto p-1">
 {seats.map((s) => {
 const isSelected = selectedSeat === s.seatNo;
 return (
 <button
 key={s.seatNo}
 disabled={s.isBooked}
 onClick={() => setSelectedSeat(s.seatNo)}
 className={`p-2.5 rounded-none border text-center flex flex-col items-center justify-center ${
 isSelected
 ? 'bg-[#1D4ED8] text-white font-bold border-[#1D4ED8]'
 : s.isBooked
 ? 'bg-[#E9EEF5] border-transparent text-[#7C8DA8] cursor-not-allowed'
 : 'bg-[#FFFFFF] border-[#E2E8F0] hover:border-[#1D4ED8] text-[#13213E] cursor-pointer'
 }`}
 >
 <span className="text-xs font-mono font-bold">{s.seatNo}</span>
 <span className="text-[9px] opacity-75 mt-0.5">{s.berthType}</span>
 </button>
 );
 })}
 </div>
 )}
 </div>

 {/* IRCTC Catering Option */}
 <div className="bg-[#F1F5F9] border border-[#E2E8F0] rounded-none p-4">
 <div className="flex items-center gap-2 mb-2.5 text-[#13213E] text-xs font-bold uppercase">
 <Utensils className="w-4 h-4 text-[#1D4ED8]" />
 IRCTC e-Catering & Meal Choice:
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
 {['Veg Standard Thali', 'Jain Special Meal', 'Non-Veg Biryani Special'].map((meal) => (
 <button
 key={meal}
 onClick={() => setMealSelected(meal)}
 className={`p-2.5 rounded-none border text-left ${
 mealSelected === meal
 ? 'bg-[#EEF4FC] border-[#1D4ED8] text-[#1D4ED8] font-bold'
 : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#4A5A79] hover:border-[#1D4ED8]/40'
 }`}
 >
 <span className="font-semibold block">{meal}</span>
 <span className="text-[10px] text-[#7C8DA8]">Complimentary Rail Neer</span>
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* Footer */}
 <div className="p-5 sm:p-6 border-t border-[#E2E8F0] bg-[#F1F5F9] flex flex-wrap items-center justify-between gap-3">
 <div>
 <span className="text-xs text-[#64748B]">Selected Preference:</span>
 <div className="text-sm font-bold text-[#13213E]">
 Coach {activeCoach.code}, Seat #{selectedSeat || 'None'} ({mealSelected})
 </div>
 </div>

 <div className="flex items-center gap-3">
 {bookingConfirmed ? (
 <span className="flex items-center gap-2 px-4 py-2.5 rounded-none bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs font-bold">
 <CheckCircle2 className="w-4 h-4" /> Preference Confirmed!
 </span>
 ) : (
 <button
 onClick={handleConfirmSeat}
 className="px-6 py-2.5 rounded-none bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold text-xs cursor-pointer"
 >
 Confirm Preference
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};
