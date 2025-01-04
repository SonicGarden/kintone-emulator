import { singleton } from "./singleton.server";
import sqlite3 from "sqlite3";

export const dbSession = (session?: string) =>
  singleton(session ?? "sqlite", () => new sqlite3.Database(":memory:"));

export const run = (db: sqlite3.Database, sql: string, ...params: unknown[]) =>
  new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

export const all = <T>(
  db: sqlite3.Database,
  sql: string,
  ...params: unknown[]
) =>
  new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as T[]);
      }
    });
  });
