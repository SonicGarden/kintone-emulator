// プロセス管理（status）の最小エミュレーション。
// - status.enable=true のときレコードに ステータス フィールドを保持させる
// - クエリ / レスポンスでも STATUS 型として認識させる
// 作業者・filterCond・STATUS_ASSIGNEE は未実装。

import type Database from "better-sqlite3";
import { findApp } from "../db/apps";
import type { FieldRow } from "../db/fields";

// 実 kintone (ja) の既定フィールドコード
export const STATUS_FIELD_CODE = "ステータス";

export type StatusState = {
  name: string;
  index: string;
  assignee?: { type: string; entities: unknown[] };
};

export type StatusAction = {
  name: string;
  from: string;
  to: string;
  filterCond?: string;
};

export type StatusConfig = {
  enable: boolean;
  states: Record<string, StatusState> | null;
  actions: StatusAction[] | null;
  revision: string;
};

export const getStatusConfig = (
  db: Database.Database,
  appId: number | string,
): StatusConfig | null => {
  const row = findApp(db, Number(appId));
  if (!row) return null;
  return JSON.parse(row.status) as StatusConfig;
};

export const isStatusEnabled = (config: StatusConfig | null): boolean =>
  !!config && config.enable === true && !!config.states && Object.keys(config.states).length > 0;

// states の中で index が最小のものを初期ステータスとする（実機準拠）
export const getInitialStateName = (config: StatusConfig): string | null => {
  if (!config.states) return null;
  const entries = Object.values(config.states);
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0),
  );
  return sorted[0]!.name;
};

// レコード body にステータス値を未設定なら初期値で埋める
export const applyInitialStatus = (
  config: StatusConfig | null,
  record: Record<string, { value?: unknown }>,
): Record<string, { value?: unknown }> => {
  if (!isStatusEnabled(config)) return record;
  const initial = getInitialStateName(config!);
  if (initial == null) return record;
  if (record[STATUS_FIELD_CODE]?.value != null && record[STATUS_FIELD_CODE]?.value !== "") {
    return record;
  }
  return { ...record, [STATUS_FIELD_CODE]: { value: initial } };
};

// findFields の戻り値に STATUS の仮想フィールドを足す。
// - クエリの buildQueryContext が STATUS 型として認識できる
// - attachFieldTypes が body のセルに type を付与できる
// applyDefaults / validateRecord 等は SKIP_TYPES に STATUS が含まれるので影響しない。
export const withStatusFieldRow = (
  fieldRows: FieldRow[],
  config: StatusConfig | null,
): FieldRow[] => {
  if (!isStatusEnabled(config)) return fieldRows;
  if (fieldRows.some((r) => r.code === STATUS_FIELD_CODE)) return fieldRows;
  return [
    ...fieldRows,
    {
      code: STATUS_FIELD_CODE,
      body: JSON.stringify({ type: "STATUS", code: STATUS_FIELD_CODE, label: STATUS_FIELD_CODE }),
    },
  ];
};
