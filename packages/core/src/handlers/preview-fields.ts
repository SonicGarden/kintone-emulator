import { validateFieldsForInsert } from "../calc/field-validation";
import { dbSession } from "../db/client";
import { deleteFields, findFields, insertFields } from "../db/fields";
import type { FieldProperties } from "../db/fields";
import { errorFieldNotFound, errorInvalidCalcFormat, errorInvalidFormula } from "./errors";
import { enforceGuestSpace } from "./guest-space";
import { validateLookupMappings } from "./lookup-validation";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

export const post = async ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));
  const body = await request.json();
  const db = dbSession(params.session);

  const guestErr = enforceGuestSpace(db, body.app, params.guestSpaceId, locale);
  if (guestErr) return guestErr;
  const existing = findFields(db, body.app);
  const properties = body.properties as FieldProperties;
  const lookupIssue = validateLookupMappings(existing, properties);
  if (lookupIssue) return errorFieldNotFound(lookupIssue.missingField, locale);
  const issue = validateFieldsForInsert(existing, properties);
  if (issue) {
    if (issue.kind === "format_enum") {
      return errorInvalidCalcFormat(issue.key, locale);
    }
    return errorInvalidFormula(issue.fieldLabel, issue.detailMessage, locale);
  }

  insertFields(db, body.app, properties);
  return Response.json({ revision: "1" });
};

export const del = async ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  // クエリパラメーターがある場合はそちらから、ない場合はリクエストボディから読む
  const hasQueryParams = url.search.length > 0;
  const body = hasQueryParams
    ? { app: url.searchParams.get('app') ?? '', fields: [] as string[] }
    : await request.json() as { app: string; fields: string[] };

  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('fields')) {
      body.fields.push(value);
    }
  }

  const locale = detectLocale(request.headers.get("accept-language"));
  const guestErr = enforceGuestSpace(db, body.app, params.guestSpaceId, locale);
  if (guestErr) return guestErr;
  deleteFields(db, body.app, body.fields);
  return Response.json({ revision: "1" });
};
