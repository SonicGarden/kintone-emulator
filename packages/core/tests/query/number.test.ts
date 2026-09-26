import { describe, expect, test } from "vitest";
import { compareDecimal, parseDecimal, parseRecordNumber } from "../../src/query/number";

const cmp = (a: string, b: string) => compareDecimal(parseDecimal(a)!, parseDecimal(b)!);

describe("parseDecimal", () => {
  test.each(["5", "05", "+5", "5.0", "5e0", "0.5E1", "50e-1"])("%s は 5 と等しい", (s) => {
    expect(cmp(s, "5")).toBe(0);
  });

  test.each(["", " 5", "5 ", "1,234", "5abc", ".", "e5", "--5", "0x10", `1e${"9".repeat(400)}`])("%j は数値として解釈しない", (s) => {
    expect(parseDecimal(s)).toBeNull();
  });

  test("-0 / 00 / 0.000 は 0", () => {
    expect(cmp("-0", "0")).toBe(0);
    expect(cmp("00", "0")).toBe(0);
    expect(cmp("0.000", "0")).toBe(0);
  });
});

describe("compareDecimal", () => {
  test.each([
    ["-1", "0", -1],
    ["-2", "-1", -1],
    ["0.5", "1", -1],
    ["999999999999.9998", "999999999999.9999", -1],
    // 30 桁 (実機の数値精度の上限) でも区別できる
    ["123456789012345678901234567890", "123456789012345678901234567891", -1],
    ["1e400", "1e399", 1],
    ["-1e400", "-1e399", -1],
    ["1e-400", "0", 1],
  ])("%s と %s の比較は %i", (a, b, expected) => {
    expect(cmp(a, b)).toBe(expected);
    expect(cmp(b, a)).toBe(-expected);
  });
});

describe("parseRecordNumber", () => {
  test.each(["5", "05", "+5"])("%s は整数として解釈する", (s) => {
    expect(compareDecimal(parseRecordNumber(s)!, parseDecimal("5")!)).toBe(0);
  });

  test.each(["5e0", "5.0", " 5", ""])("%j は解釈しない", (s) => {
    expect(parseRecordNumber(s)).toBeNull();
  });
});
