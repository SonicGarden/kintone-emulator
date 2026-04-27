import type Database from "better-sqlite3";
import { all, run } from "./client";

export type SpaceRow = {
  id: number;
  is_guest: number;
  name: string | null;
  created_at: string;
};

export const findSpace = (db: Database.Database, id: number) =>
  all<SpaceRow>(db, `SELECT id, is_guest, name, created_at FROM spaces WHERE id = ?`, id)[0];

export const insertSpace = (
  db: Database.Database,
  options: { id: number; isGuest: boolean; name?: string }
) => {
  run(
    db,
    `INSERT INTO spaces (id, is_guest, name) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET is_guest = excluded.is_guest, name = excluded.name`,
    options.id,
    options.isGuest ? 1 : 0,
    options.name ?? null
  );
};
