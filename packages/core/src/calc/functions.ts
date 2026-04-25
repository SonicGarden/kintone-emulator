// kintone 計算式で使用可能な関数のメタ情報（引数数のバリデーション用）。

export type FunctionSpec = {
  /** 最小引数数 */
  min: number;
  /** 最大引数数（undefined = 無制限） */
  max?: number;
};

// 関数名は大文字小文字を区別しない。
export const FUNCTIONS: Record<string, FunctionSpec> = {
  SUM:          { min: 1 },
  IF:           { min: 3, max: 3 },
  AND:          { min: 2, max: 32 },
  OR:           { min: 2, max: 32 },
  NOT:          { min: 1, max: 1 },
  ROUND:        { min: 2, max: 2 },
  ROUNDUP:      { min: 2, max: 2 },
  ROUNDDOWN:    { min: 2, max: 2 },
  YEN:          { min: 2, max: 2 },
  DATE_FORMAT:  { min: 3, max: 3 },
  CONTAINS:     { min: 2, max: 2 },
};

export const functionSpec = (name: string): FunctionSpec | undefined =>
  FUNCTIONS[name.toUpperCase()];
