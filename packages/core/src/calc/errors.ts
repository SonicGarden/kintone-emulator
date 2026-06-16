// 計算式バリデーション系の共通エラー。lexer / parser / validate が投げる。

export type CalcErrorKind =
  | "syntax"
  | "fullwidth"
  | "bad_operator"
  | "empty"
  | "unknown_field"
  | "non_referenceable_field"
  | "unknown_function"
  | "arg_count"
  | "arg_count_max"
  | "circular";

export class CalcParseError extends Error {
  constructor(
    message: string,
    public readonly kind: CalcErrorKind,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}
