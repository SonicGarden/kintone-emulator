import type Database from "better-sqlite3";
import { all } from "./client";

export type AppRow = {
  id: number;
  name: string;
  revision: number;
  layout: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type FindAppsOptions = {
  ids?: number[];
  name?: string;
  limit: number;
  offset: number;
};

export const findApp = (db: Database.Database, id: number) =>
  all<AppRow>(db, `SELECT id, name, revision, layout, status, created_at, updated_at FROM apps WHERE id = ?`, id)[0];

export const findApps = (db: Database.Database, options: FindAppsOptions) => {
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
    `SELECT id, name, revision, layout, status, created_at, updated_at FROM apps ${where} LIMIT ? OFFSET ?`,
    ...params
  );
};

const DEFAULT_STATUS = '{"enable":false,"states":null,"actions":null,"revision":"3"}';

export const insertApp = (db: Database.Database, name: string, layout: string, status: string = DEFAULT_STATUS, id?: number) =>
  all<{ id: number; revision: number }>(
    db,
    id != null
      ? "INSERT INTO apps (id, name, layout, status) VALUES (?, ?, ?, ?) RETURNING id, revision"
      : "INSERT INTO apps (name, layout, status) VALUES (?, ?, ?) RETURNING id, revision",
    ...(id != null ? [id, name, layout, status] : [name, layout, status])
  )[0];
