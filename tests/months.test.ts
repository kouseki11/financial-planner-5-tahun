import { describe, expect, it } from "vitest";
import {
  PLAN_END,
  PLAN_START,
  addMonths,
  formatMonthLabel,
  formatMonthShort,
  isValidMonthKey,
  monthDiff,
  monthKeyFromDate,
  monthRange,
  planMonths,
  planYearIndex,
} from "@/lib/months";

describe("months", () => {
  it("periode rencana 60 bulan Oktober 2026 – September 2031", () => {
    const months = planMonths();
    expect(months).toHaveLength(60);
    expect(months[0]).toBe(PLAN_START);
    expect(months[59]).toBe(PLAN_END);
    expect(addMonths("2026-10", 59)).toBe("2031-09");
  });

  it("addMonths melewati batas tahun ke depan dan ke belakang", () => {
    expect(addMonths("2026-10", 3)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-10", 12)).toBe("2027-10");
  });

  it("monthDiff dan monthRange", () => {
    expect(monthDiff("2026-10", "2027-10")).toBe(12);
    expect(monthDiff("2027-10", "2026-10")).toBe(-12);
    expect(monthRange("2026-10", "2027-09")).toHaveLength(12);
    expect(monthRange("2027-01", "2026-12")).toEqual([]);
  });

  it("format label Indonesia", () => {
    expect(formatMonthLabel("2026-10")).toBe("Oktober 2026");
    expect(formatMonthLabel("2031-09")).toBe("September 2031");
    expect(formatMonthShort("2027-01")).toBe("Jan 2027");
  });

  it("validasi dan konversi tanggal", () => {
    expect(isValidMonthKey("2026-10")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("2026-1")).toBe(false);
    expect(monthKeyFromDate("2026-10-15")).toBe("2026-10");
  });

  it("indeks tahun rencana", () => {
    expect(planYearIndex("2026-10")).toBe(1);
    expect(planYearIndex("2027-09")).toBe(1);
    expect(planYearIndex("2027-10")).toBe(2);
    expect(planYearIndex("2031-09")).toBe(5);
  });
});
