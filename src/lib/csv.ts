/** CSV sederhana (RFC 4180): koma sebagai pemisah, kutip ganda bila perlu, BOM UTF-8 agar Excel membaca UTF-8. */

export type CsvCell = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  key: keyof T & string;
  header: string;
}

function escapeCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "true" : "false") : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, CsvCell>>(rows: readonly T[], columns: readonly CsvColumn<T>[], withBom = true): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(","));
  return (withBom ? "﻿" : "") + [header, ...body].join("\r\n") + "\r\n";
}

/** Parser untuk verifikasi (test T10) dan impor sederhana. Mengembalikan array objek berdasarkan header. */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // abaikan; \n menutup baris
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const [header, ...data] = rows;
  return data.filter((r) => r.some((c) => c !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
