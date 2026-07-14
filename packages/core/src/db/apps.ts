import type Database from "better-sqlite3";
import { all, run } from "./client";

export type JsItem =
  | { type: "URL"; url: string }
  | { type: "FILE"; file: { fileKey: string; name: string } };

export type CustomizeConfig = {
  desktop: { js: JsItem[]; css: string[] };
  mobile: { js: JsItem[]; css: string[] };
};

export type AppRow = {
  id: number;
  name: string;
  revision: number;
  layout: string;
  status: string;
  customize: string;
  space_id: number | null;
  thread_id: number | null;
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

const APP_COLUMNS = `id, name, revision, layout, status, customize, space_id, thread_id, created_at, updated_at`;

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
};

export const updateApp = (db: Database.Database, id: number, { name }: { name: string }) =>
  run(
    db,
    `UPDATE apps SET name = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    name,
    id
  );

export const deleteApp = (db: Database.Database, id: number) => {
  db.transaction(() => {
    run(db, `DELETE FROM comments WHERE app_id = ?`, id);
    run(db, `DELETE FROM records WHERE app_id = ?`, id);
    run(db, `DELETE FROM fields WHERE app_id = ?`, id);
    run(db, `DELETE FROM webhooks WHERE app_id = ?`, id);
    run(db, `DELETE FROM apps WHERE id = ?`, id);
  })();
};

const EMPTY_CUSTOMIZE: CustomizeConfig = { desktop: { js: [], css: [] }, mobile: { js: [], css: [] } };

export const findCustomize = (db: Database.Database, appId: number): CustomizeConfig => {
  const app = findApp(db, appId);
  try {
    return JSON.parse(app?.customize ?? "{}") as CustomizeConfig;
  } catch {
    return EMPTY_CUSTOMIZE;
  }
};

export const updateCustomize = (db: Database.Database, appId: number, customize: CustomizeConfig) =>
  run(db, `UPDATE apps SET customize = ? WHERE id = ?`, JSON.stringify(customize), appId);

export const insertApp = (db: Database.Database, options: InsertAppOptions) => {
  const { name, layout, status = DEFAULT_STATUS, id, spaceId, threadId } = options;
  const cols = ["name", "layout", "status", "space_id", "thread_id"];
  const vals: unknown[] = [name, layout, status, spaceId ?? null, threadId ?? null];
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
