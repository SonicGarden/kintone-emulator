import { describe, expect, test } from "vitest";
import { downloadContentType } from "../../src/handlers/file";

// 期待値は実 kintone (cybozu.com) の GET /k/v1/file.json 応答ヘッダーから採取したもの。
describe("downloadContentType", () => {
  test.each([
    ["text/plain", "text/plain;charset=utf-8"],
    ["text/html", "text/html;charset=utf-8"],
    ["text/xml", "text/xml;charset=utf-8"],
  ])("%j には空白なし・小文字の charset が付く", (contentType, expected) => {
    expect(downloadContentType(contentType)).toBe(expected);
  });

  test.each([
    ["text/csv", "text/csv; charset=UTF-8"],
    ["text/tab-separated-values", "text/tab-separated-values; charset=UTF-8"],
    ["text/css", "text/css; charset=UTF-8"],
    ["text/javascript", "text/javascript; charset=UTF-8"],
    ["text/markdown", "text/markdown; charset=UTF-8"],
    ["text/yaml", "text/yaml; charset=UTF-8"],
  ])("その他の text/* には空白あり・大文字の charset が付く", (contentType, expected) => {
    expect(downloadContentType(contentType)).toBe(expected);
  });

  test.each([
    // application/json にも付かない（text/* だけが対象）
    "application/json",
    "application/xml",
    "application/pdf",
    "application/octet-stream",
    "application/x-zip-compressed",
    "image/png",
    "image/svg+xml",
  ])("%j には charset が付かない", (contentType) => {
    expect(downloadContentType(contentType)).toBe(contentType);
  });

  test("すでにパラメーターが付いている場合は触らない", () => {
    // 実機の保存 MIME は拡張子由来でパラメーターを持たないが、エミュレーターは
    // クライアント申告をそのまま保存するので来る可能性がある。charset を二重に足さない。
    expect(downloadContentType("text/plain; charset=shift_jis")).toBe("text/plain; charset=shift_jis");
  });

  test("空の Content-Type は触らない", () => {
    expect(downloadContentType("")).toBe("");
  });
});
