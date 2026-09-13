import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
 title: 'RailBuddy — Indian Railways Train Search & Live Status',
 description:
 'Search trains between stations, track live Indian Railways running status, and check AI delay & ETA forecasts for your journey.',
icons: {
  icon: '/logo.png',
  apple: '/logo.png',
 },
};

export default function RootLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 return (
 <html lang="en" className="scroll-smooth" suppressHydrationWarning>
 <head>
 <link rel="preconnect" href="https://fonts.googleapis.com" />
 <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
 <link
 href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
 rel="stylesheet"
 />
 </head>
 <body
 className="bg-[#F8FAFC] text-[#13213E] antialiased min-h-screen selection:bg-[#1D4ED8]/20 selection:text-[#13213E]"
 suppressHydrationWarning
 >
 {children}
 </body>
 </html>
 );
}
