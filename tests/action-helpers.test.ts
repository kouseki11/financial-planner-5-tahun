import { describe, expect, it } from "vitest";
import { boolField, optionalRupiahField, optionalText, rupiahField, rupiahOrZeroField } from "@/server/actions/helpers";

describe("form field schemas", () => {
  it("field yang tidak dikirim form (undefined) tidak menyebabkan error validasi", () => {
    expect(optionalText.parse(undefined)).toBeNull();
    expect(optionalText.parse("")).toBeNull();
    expect(optionalText.parse("catatan")).toBe("catatan");
    expect(rupiahOrZeroField.parse(undefined)).toBe(0);
    expect(rupiahOrZeroField.parse("")).toBe(0);
    expect(rupiahOrZeroField.parse("Rp 1.000.000")).toBe(1_000_000);
    expect(optionalRupiahField.parse("")).toBeNull();
    expect(boolField.parse(undefined)).toBe(false);
    expect(boolField.parse("on")).toBe(true);
  });

  it("rupiah wajib menolak kosong/undefined", () => {
    expect(() => rupiahField.parse(undefined)).toThrow();
    expect(() => rupiahField.parse("")).toThrow();
    expect(rupiahField.parse("-500.000")).toBe(-500_000);
  });
});
