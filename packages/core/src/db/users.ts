import type Database from "better-sqlite3";
import { all, run } from "./client";

// NOTE: このエミュレーターはテスト用途のみのため、パスワードは平文で保存している。
// 本番環境の kintone と同じパスワードを使用しないこと。
export const insertUser = (
  db: Database.Database,
  username: string,
  password: string
) => {
  run(db, "INSERT INTO users (username, password) VALUES (?, ?)", username, password);
};

export const verifyUser = (
  db: Database.Database,
  username: string,
  password: string
): boolean => {
  const rows = all<{ id: number }>(
    db,
    "SELECT id FROM users WHERE username = ? AND password = ?",
    username,
    password
  );
  return rows.length > 0;
};

export const isAuthEnabled = (db: Database.Database): boolean => {
  const rows = all<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM users"
  );
  return rows[0]!.count > 0;
};
