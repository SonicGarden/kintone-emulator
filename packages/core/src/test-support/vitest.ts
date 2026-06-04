// vitest 依存の describe / test ラッパー。
// vitest を使わないプロジェクトはこのモジュールを import しないこと。
// 非 vitest ランナーを使う場合は `isUsingRealKintone()` を自前の describe / test と組み合わせてください。

import { describe, test } from "vitest";
import { isUsingRealKintone } from "./config";

/** 両モードで実行される describe。将来的に real モードでのログ出力等を足す余地 */
export const describeDualMode = describe;

/**
 * エミュレーターでのみ実行する describe。
 * 実 kintone モード時は `describe.skip` となる。
 */
export const describeEmulatorOnly: typeof describe = ((name: string, fn: () => void) => {
  if (isUsingRealKintone()) return describe.skip(name, fn);
  return describe(name, fn);
}) as typeof describe;

/** エミュレーターでのみ実行する test。実 kintone モード時は skip */
export const testEmulatorOnly: typeof test = ((name: string, fn: () => void | Promise<void>) => {
  if (isUsingRealKintone()) return test.skip(name, fn);
  return test(name, fn);
}) as typeof test;
