import { describe, expect, test } from "vitest";
import { normalizeUploadedFilename } from "../../src/handlers/file";

// 期待値は実 kintone (cybozu.com) に同名のファイルをアップロードし、
// レコード取得の添付ファイル name を読んで採取したもの。
describe("normalizeUploadedFilename", () => {
  test.each([
    ["plain.txt", "plain.txt"],
    ["テスト.txt", "テスト.txt"],
    // パス成分は落とす（生の区切り文字のときだけ）
    ["back\\slash.txt", "slash.txt"],
    ["slash/.txt", ".txt"],
    ["a/b\\c.txt", "c.txt"],
    ["pct%5Cbackslash.txt", "pct%5Cbackslash.txt"],
    ["pct%2Fslash.txt", "pct%2Fslash.txt"],
    // undici が復元した WHATWG のエスケープを入れ直す（実機は復元しないので %22 のまま持つ）
    ['double"quote.txt', "double%22quote.txt"],
    ["cr\rlf\n.txt", "cr%0Dlf%0A.txt"],
    // 元から %22 という文字列だったものは触らない（undici も復元しない）
    ["pct%2522double.txt", "pct%2522double.txt"],
    ["pct%41letterA.txt", "pct%41letterA.txt"],
  ])("%j は %j として保存される", (filename, expected) => {
    expect(normalizeUploadedFilename(filename)).toBe(expected);
  });
});
