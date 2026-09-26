import { describe, expect, test } from "vitest";
import {
  compareDecimal, formatPlainDecimal, integerDigitCount, parseDecimal, parseRecordNumber, parseWrittenNumber, roundDecimal,
  toHalfWidthDigits,
} from "../../src/query/number";

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

describe("roundDecimal / formatPlainDecimal", () => {
  const round = (s: string, places: number, mode: "HALF_EVEN" | "UP" | "DOWN") =>
    formatPlainDecimal(roundDecimal(parseDecimal(s)!, places, mode));

  test.each([
    ["0.00015", 4, "HALF_EVEN", "0.0002"],
    ["0.00025", 4, "HALF_EVEN", "0.0002"],
    ["0.00026", 4, "HALF_EVEN", "0.0003"],
    ["0.000251", 4, "HALF_EVEN", "0.0003"],
    ["0.00005", 4, "HALF_EVEN", "0"],
    ["0.00006", 4, "HALF_EVEN", "0.0001"],
    ["-0.00005", 4, "HALF_EVEN", "0"],
    ["0.00001", 2, "UP", "0.01"],
    ["-0.00001", 2, "UP", "-0.01"],
    ["1.99999", 2, "DOWN", "1.99"],
    ["1.00001", 2, "DOWN", "1"],
    ["999999999999.99995", 4, "HALF_EVEN", "1000000000000"],
    ["9.995", 2, "HALF_EVEN", "10"],
    ["1.5", 0, "HALF_EVEN", "2"],
    ["2.5", 0, "HALF_EVEN", "2"],
    ["1e-400", 10, "UP", "0.0000000001"],
    ["123", 2, "UP", "123"],
  ] as const)("%s を小数第 %i 位に %s で丸めると %s", (input, places, mode, expected) => {
    expect(round(input, places, mode)).toBe(expected);
  });

  test("丸めで繰り上がると整数部の桁数が増える", () => {
    expect(integerDigitCount(roundDecimal(parseDecimal("999999999999.99995")!, 4, "HALF_EVEN"))).toBe(13);
    expect(integerDigitCount(parseDecimal("0.5")!)).toBe(0);
    expect(integerDigitCount(parseDecimal("0")!)).toBe(0);
  });

  test.each([["1e3", "1000"], ["1.50", "1.5"], ["-0.0012", "-0.0012"], ["12.5e-1", "1.25"]])(
    "%s は指数を使わず %s と書く", (input, expected) => {
      expect(formatPlainDecimal(parseDecimal(input)!)).toBe(expected);
    },
  );
});

describe("parseWrittenNumber", () => {
  test.each([" 5 ", "5.", "+5", "1e+3", "00012.50"])("top-level は %j を受け付ける", (s) => {
    expect(parseWrittenNumber(s, "top")).not.toBeNull();
  });

  test.each([".5", "５", "0x10", "0b1", "Infinity", "1_000", "5e", "--5", "1.2.3"])("top-level は %j を受け付けない", (s) => {
    expect(parseWrittenNumber(s, "top")).toBeNull();
  });

  test.each([[".5", "0.5"], ["１２", "12"], [" 5 ", "5"]])("SUBTABLE 内は %j を %s として受け付ける", (s, expected) => {
    expect(formatPlainDecimal(parseWrittenNumber(s, "subtable")!)).toBe(expected);
  });

  test.each(["0x10", "Infinity", "1_000"])("SUBTABLE 内も %j は受け付けない", (s) => {
    expect(parseWrittenNumber(s, "subtable")).toBeNull();
  });

  test("top-digits は全角数字を読むが、書式は top-level と同じ", () => {
    expect(formatPlainDecimal(parseWrittenNumber("\uff11\uff11", "top-digits")!)).toBe("11");
    expect(parseWrittenNumber("\uff11\uff11", "top")).toBeNull();
    expect(parseWrittenNumber("\uff11\uff11abc", "top-digits")).toBeNull();
  });

  test.each(["\uff0e", "\uff0d", "\uff0b", "\uff45"])("全角の %j は数字として扱わない", (c) => {
    expect(toHalfWidthDigits(`1${c}5`)).toBe(`1${c}5`);
  });
});
