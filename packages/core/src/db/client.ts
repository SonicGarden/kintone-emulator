import Database from "better-sqlite3";
import { sqliteNumCmp } from "../query/number";

const singleton = <Value>(name: string, valueFactory: () => Value): Value => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = global as any;
  g.__singletons ??= {};
  g.__singletons[name] ??= valueFactory();
  return g.__singletons[name];
};

export const dbSession = (session?: string): Database.Database =>
  singleton(session ?? "sqlite", () => {
    const db = new Database(":memory:");
    // クエリの NUMBER / RECORD_NUMBER 比較で使う (query/compiler.ts)
    db.function("kintone_num_cmp", { deterministic: true }, sqliteNumCmp);
    return db;
  });

export const run = (db: Database.Database, sql: string, ...params: unknown[]) =>
  db.prepare(sql).run(...params);

export const all = <T>(
  db: Database.Database,
  sql: string,
  ...params: unknown[]
): T[] => {
  return db.prepare(sql).all(...params) as T[];
};
