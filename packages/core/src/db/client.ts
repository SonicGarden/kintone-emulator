import Database from "better-sqlite3";

const singleton = <Value>(name: string, valueFactory: () => Value): Value => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = global as any;
  g.__singletons ??= {};
  g.__singletons[name] ??= valueFactory();
  return g.__singletons[name];
};

export const dbSession = (session?: string): Database.Database =>
  singleton(session ?? "sqlite", () => new Database(":memory:"));

export const run = (db: Database.Database, sql: string, ...params: unknown[]) =>
  db.prepare(sql).run(...params);

export const all = <T>(
  db: Database.Database,
  sql: string,
  ...params: unknown[]
): T[] => {
  return db.prepare(sql).all(...params) as T[];
};
