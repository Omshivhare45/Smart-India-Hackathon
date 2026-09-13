import React from 'react';
import { cn } from '../../lib/cn';

interface DashboardCardProps {
 className?: string;
 children: React.ReactNode;
 hover?: boolean;
 onClick?: () => void;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
 className,
 children,
 hover = false,
 onClick,
}) => {
 return (
 <div
 onClick={onClick}
 className={cn(
 'rounded-none border border-[#E2E8F0] bg-[#FFFFFF] shadow-soft',
 hover &&
 ' hover:border-[#1D4ED8]/30 hover:bg-[#F8FBFF] ',
 onClick && 'cursor-pointer',
 className,
 )}
 >
 {children}
 </div>
 );
};

export default DashboardCard;