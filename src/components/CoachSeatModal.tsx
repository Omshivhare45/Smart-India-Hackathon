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
 <div className="bg-[#FFFFFF] rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[#E3E8EF]">
 {/* Header */}
 <div className="p-5 sm:p-6 border-b border-[#E3E8EF] flex items-center justify-between bg-[#F4F7FB]">
 <div>
 <div className="flex items-center gap-2">
 <span className="px-2.5 py-0.5 rounded-xl bg-[#123A6B] text-white font-mono text-xs font-bold ">
 {train.trainNumber}
 </span>
 <h3 className="font-bold text-xl text-[#101F36]">
 {train.trainName}
 </h3>
 </div>
 <p className="text-xs text-[#5B6B82] mt-0.5">
 Coach Composition, Platform Placement & Interactive Seat Map
 </p>
 </div>
 <button
 onClick={onClose}
 className="p-2 rounded-xl bg-[#FFFFFF] hover:bg-[#EEF3F9] text-[#5B6B82] hover:text-[#123A6B] border border-[#E3E8EF] "
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Content Body */}
 <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
 {/* Coach Horizontal Strip */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <span className="text-xs font-bold text-[#5B6B82] uppercase tracking-wider flex items-center gap-1.5">
 <Layers className="w-3.5 h-3.5 text-[#123A6B]" />
 Rake / Train Formation:
 </span>
 <span className="text-[11px] text-[#8B99AD]">Engine ➔ Rear</span>
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
 className={`shrink-0 px-4 py-3 rounded-xl border text-center flex flex-col items-center justify-center min-w-[76px] cursor-pointer ${
 isSelected
 ? 'bg-[#123A6B] text-white font-bold border-[#123A6B] '
 : 'bg-[#F4F7FB] border-[#E3E8EF] hover:border-[#123A6B]/50 text-[#101F36]'
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
 <div className="bg-[#F4F7FB] border border-[#E3E8EF] rounded-xl p-4">
 <div className="flex items-center justify-between mb-4 border-b border-[#E3E8EF] pb-3">
 <div>
 <span className="text-sm font-bold text-[#101F36]">
 Coach {activeCoach.code}: {activeCoach.name}
 </span>
 <span className="text-xs text-[#5B6B82] block">
 Capacity: {activeCoach.seatsCount} Passengers • AC Chair Car
 </span>
 </div>
 <div className="flex items-center gap-3 text-[11px]">
 <span className="flex items-center gap-1 text-[#101F36] font-medium">
 <span className="w-2.5 h-2.5 rounded-xl bg-[#FFFFFF] border border-[#C9D8EA] inline-block"></span> Available
 </span>
 <span className="flex items-center gap-1 text-[#8B99AD]">
 <span className="w-2.5 h-2.5 rounded-xl bg-[#8B99AD] inline-block"></span> Booked
 </span>
 <span className="flex items-center gap-1 text-[#123A6B] font-bold">
 <span className="w-2.5 h-2.5 rounded-xl bg-[#123A6B] inline-block"></span> Selected
 </span>
 </div>
 </div>

 {/* Seat Map */}
 {activeCoach.seatsCount === 0 ? (
 <div className="py-10 text-center text-[#5B6B82]">
 <Info className="w-8 h-8 text-[#123A6B] mx-auto mb-2 opacity-80" />
 <p className="text-sm font-semibold text-[#101F36]">
 {activeCoach.code === 'LOCO' ? 'Locomotive Cab (Restricted Access)' : 'Specialized Utility Coach'}
 </p>
 <p className="text-xs text-[#5B6B82] mt-1">
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
 className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center ${
 isSelected
 ? 'bg-[#123A6B] text-white font-bold border-[#123A6B]'
 : s.isBooked
 ? 'bg-[#E3E8EF] border-transparent text-[#8B99AD] cursor-not-allowed'
 : 'bg-[#FFFFFF] border-[#E3E8EF] hover:border-[#123A6B] text-[#101F36] cursor-pointer'
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
 <div className="bg-[#F4F7FB] border border-[#E3E8EF] rounded-xl p-4">
 <div className="flex items-center gap-2 mb-2.5 text-[#101F36] text-xs font-bold uppercase">
 <Utensils className="w-4 h-4 text-[#123A6B]" />
 IRCTC e-Catering & Meal Choice:
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
 {['Veg Standard Thali', 'Jain Special Meal', 'Non-Veg Biryani Special'].map((meal) => (
 <button
 key={meal}
 onClick={() => setMealSelected(meal)}
 className={`p-2.5 rounded-xl border text-left ${
 mealSelected === meal
 ? 'bg-[#EEF3F9] border-[#123A6B] text-[#123A6B] font-bold'
 : 'bg-[#FFFFFF] border-[#E3E8EF] text-[#5B6B82] hover:border-[#123A6B]/40'
 }`}
 >
 <span className="font-semibold block">{meal}</span>
 <span className="text-[10px] text-[#8B99AD]">Complimentary Rail Neer</span>
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* Footer */}
 <div className="p-5 sm:p-6 border-t border-[#E3E8EF] bg-[#F4F7FB] flex flex-wrap items-center justify-between gap-3">
 <div>
 <span className="text-xs text-[#5B6B82]">Selected Preference:</span>
 <div className="text-sm font-bold text-[#101F36]">
 Coach {activeCoach.code}, Seat #{selectedSeat || 'None'} ({mealSelected})
 </div>
 </div>

 <div className="flex items-center gap-3">
 {bookingConfirmed ? (
 <span className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs font-bold">
 <CheckCircle2 className="w-4 h-4" /> Preference Confirmed!
 </span>
 ) : (
 <button
 onClick={handleConfirmSeat}
 className="px-6 py-2.5 rounded-xl bg-[#123A6B] hover:bg-[#0F2F58] text-white font-bold text-xs cursor-pointer"
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
