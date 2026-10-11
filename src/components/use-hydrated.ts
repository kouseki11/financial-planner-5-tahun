"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false saat SSR/hidrasi, true setelah React aktif di klien.
 * Dipakai untuk menonaktifkan tombol submit sebelum hidrasi: klik pada form Server Action
 * sebelum hidrasi selesai bisa hilang tanpa request (terutama di `next dev`).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
