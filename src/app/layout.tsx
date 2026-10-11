import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { MainNav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Financial Planner 5 Tahun", template: "%s · Financial Planner" },
  description: "Perencana keuangan pribadi Oktober 2026 – September 2031: gaji dinamis, anggaran, realisasi, investasi, dan proyeksi.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              Financial Planner <span className="text-muted-foreground">5 Tahun</span>
            </Link>
            <MainNav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t py-4 text-center text-xs text-muted-foreground">Periode rencana Oktober 2026 – September 2031 · Semua angka berasal dari data tersimpan dan asumsi yang dapat Anda ubah.</footer>
      </body>
    </html>
  );
}
