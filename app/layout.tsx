import type {Metadata} from 'next';
import { Lexend, Manrope } from 'next/font/google';
import './globals.css';

const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-lexend',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'G.B MoodTracker',
  description: 'Tu Santuario Digital para reflexionar sobre tu día.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" className={`${lexend.variable} ${manrope.variable} dark`}>
      <body className="bg-background text-on-surface font-body antialiased selection:bg-primary/30 selection:text-primary min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
