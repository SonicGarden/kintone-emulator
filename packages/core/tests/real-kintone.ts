// src/test-support の再エクスポート。既存の tests/ 配下のテストから
// 従来通り import できるように互換レイヤーを残している。
// 新規コンシューマは @sonicgarden/kintone-emulator/test-support(/vitest) を使う。
export * from "../src/test-support";
export * from "../src/test-support/vitest";
