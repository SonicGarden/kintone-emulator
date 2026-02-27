import sqlite3 from "sqlite3";

const singleton = <Value>(name: string, valueFactory: () => Value): Value => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = global as any;
  g.__singletons ??= {};
  g.__singletons[name] ??= valueFactory();
  return g.__singletons[name];
};

export const dbSession = (session?: string) =>
  singleton(session ?? "sqlite", () => new sqlite3.Database(":memory:"));

export const serialize = (
  db: sqlite3.Database,
  callback: () => Promise<void> | void
) =>
  new Promise<void>((resolve) => {
    db.serialize(() => {
      callback();
      resolve();
    });
  });

export const run = (db: sqlite3.Database, sql: string, ...params: unknown[]) =>
  new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

export const all = <T>(
  db: sqlite3.Database,
  sql: string,
  ...params: unknown[]
) =>
  new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
