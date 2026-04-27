import type Database from "better-sqlite3";
import { findApp } from "../db/apps";
import { findSpace } from "../db/spaces";
import { errorGuestSpacePathRequired, errorNoPermission } from "./errors";
import type { Locale } from "./validate";

// 与えられた appId と params.guestSpaceId の整合性を検査する。
// - 非ゲストパス × ゲストスペース内アプリ → GAIA_IL23 (HTTP 520)
// - ゲストパス × 通常スペースのアプリ or 別 guest space → 404 GAIA_AP01
// 検査 OK なら undefined を返す。
export const enforceGuestSpace = (
  db: Database.Database,
  appId: number | string,
  guestSpaceIdParam: string | undefined,
  locale: Locale = "ja",
): Response | undefined => {
  const id = Number(appId);
  if (!Number.isFinite(id)) return undefined;
  const app = findApp(db, id);
  if (!app) return undefined; // アプリ未存在のエラーは呼び出し側に委ねる

  const requestedGuest = guestSpaceIdParam != null ? Number(guestSpaceIdParam) : null;
  const space = app.space_id != null ? findSpace(db, app.space_id) : undefined;
  const appIsInGuestSpace = !!space && space.is_guest === 1;

  if (requestedGuest == null) {
    if (appIsInGuestSpace) return errorGuestSpacePathRequired(locale);
    return undefined;
  }
  if (!appIsInGuestSpace || app.space_id !== requestedGuest) {
    return errorNoPermission(locale);
  }
  return undefined;
};
