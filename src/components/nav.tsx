"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/gaji", label: "Gaji" },
  { href: "/anggaran", label: "Anggaran" },
  { href: "/realisasi", label: "Realisasi" },
  { href: "/investasi", label: "Investasi" },
  { href: "/proyeksi", label: "Proyeksi" },
  { href: "/analisis", label: "Analisis" },
  { href: "/laporan", label: "Laporan" },
] as const;

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigasi utama" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 whitespace-nowrap text-sm">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block rounded-md px-3 py-2 transition-colors hover:bg-accent hover:text-accent-foreground",
                  active ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
