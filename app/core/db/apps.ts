import type sqlite3 from "sqlite3";
import { all } from "./client";

export type AppRow = {
  id: number;
  name: string;
  revision: number;
  layout: string;
  created_at: string;
  updated_at: string;
};

type FindAppsOptions = {
  ids?: number[];
  name?: string;
  limit: number;
  offset: number;
};

export const findApp = (db: sqlite3.Database, id: number) =>
  all<AppRow>(db, `SELECT id, name, revision, layout, created_at, updated_at FROM apps WHERE id = ?`, id);

export const findApps = (db: sqlite3.Database, options: FindAppsOptions) => {
  const { ids, name, limit, offset } = options;
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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  return all<AppRow>(
    db,
    `SELECT id, name, revision, layout, created_at, updated_at FROM apps ${where} LIMIT ? OFFSET ?`,
    ...params
  );
};

export const insertApp = (db: sqlite3.Database, name: string, layout: string) =>
  all<{ id: number; revision: number }>(
    db,
    "INSERT INTO apps (name, layout) VALUES (?, ?) RETURNING id, revision",
    name,
    layout
  );
