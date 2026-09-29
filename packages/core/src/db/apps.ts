import type Database from "better-sqlite3";
import type { NumberPrecision } from "../query/number";
import { DEFAULT_NUMBER_PRECISION } from "../query/number";
import { all } from "./client";

export type AppRow = {
  id: number;
  name: string;
  revision: number;
  layout: string;
  status: string;
  space_id: number | null;
  thread_id: number | null;
  /** NULL は既定値 (DEFAULT_NUMBER_PRECISION)。findAppNumberPrecision で解決する */
  number_precision: string | null;
  created_at: string;
  updated_at: string;
};

type FindAppsOptions = {
  ids?: number[];
  name?: string;
  spaceIds?: number[];
  limit: number;
  offset: number;
};

const APP_COLUMNS = `id, name, revision, layout, status, space_id, thread_id, number_precision, created_at, updated_at`;

export const findApp = (db: Database.Database, id: number) =>
  all<AppRow>(db, `SELECT ${APP_COLUMNS} FROM apps WHERE id = ?`, id)[0];

export const findApps = (db: Database.Database, options: FindAppsOptions) => {
  const { ids, name, spaceIds, limit, offset } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (ids && ids.length > 0) {
    conditions.push(`id IN (${ids.map(() => '?').join(', ')})`);
    params.push(...ids);
  }

  if (name) {
    conditions.push(`name LIKE ?`);
    params.push(`%${name}%`);
  }

  if (spaceIds && spaceIds.length > 0) {
    conditions.push(`space_id IN (${spaceIds.map(() => '?').join(', ')})`);
    params.push(...spaceIds);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  return all<AppRow>(
    db,
    `SELECT ${APP_COLUMNS} FROM apps ${where} LIMIT ? OFFSET ?`,
    ...params
  );
};

const DEFAULT_STATUS = '{"enable":false,"states":null,"actions":null,"revision":"3"}';

type InsertAppOptions = {
  name: string;
  layout: string;
  status?: string;
  id?: number;
  spaceId?: number;
  threadId?: number;
  numberPrecision?: NumberPrecision;
};

export const insertApp = (db: Database.Database, options: InsertAppOptions) => {
  const { name, layout, status = DEFAULT_STATUS, id, spaceId, threadId, numberPrecision } = options;
  const cols = ["name", "layout", "status", "space_id", "thread_id", "number_precision"];
  const vals: unknown[] = [
    name, layout, status, spaceId ?? null, threadId ?? null,
    numberPrecision ? JSON.stringify(numberPrecision) : null,
  ];
  if (id != null) {
    cols.unshift("id");
    vals.unshift(id);
  }
  return all<{ id: number; revision: number }>(
    db,
    `INSERT INTO apps (${cols.join(", ")}) VALUES (${cols.map(() => '?').join(", ")}) RETURNING id, revision`,
    ...vals
  )[0];
};

/** アプリの数値精度。アプリが無いときも既定値を返す (存在しないアプリへの書き込みでも検証を落とさないため) */
export const findAppNumberPrecision = (db: Database.Database, id: number | string): NumberPrecision => {
  const row = all<{ number_precision: string | null }>(
    db, "SELECT number_precision FROM apps WHERE id = ?", id,
  )[0];
  return row?.number_precision ? (JSON.parse(row.number_precision) as NumberPrecision) : DEFAULT_NUMBER_PRECISION;
};
