import { dbSession } from "../db/client";
import { countComments, deleteComment, findComments, findRecordExists, insertComment } from "../db/comments";
import { errorInvalidInput, errorMessages, errorNotFoundComment, errorNotFoundRecord } from "./errors";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

export const get = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);
  const url = new URL(request.url);

  const app = url.searchParams.get("app");
  const record = url.searchParams.get("record");

  if (!app || !record) {
    const missing: { [key: string]: { messages: string[] } } = {};
    if (!app) missing.app = { messages: [m.requiredField] };
    if (!record) missing.record = { messages: [m.requiredField] };
    return errorInvalidInput(missing, locale);
  }

  const recordRow = findRecordExists(db, app, record);
  if (!recordRow) {
    return errorNotFoundRecord(record, locale);
  }

  const orderParam = url.searchParams.get("order") ?? "desc";
  if (orderParam !== "asc" && orderParam !== "desc") {
    return errorInvalidInput({ order: { messages: [m.enumValue] } }, locale);
  }
  const order = orderParam;
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const limit = Math.max(1, Number(url.searchParams.get("limit") ?? "10") || 10);

  const totalCount = countComments(db, app, record);
  const rows = findComments(db, app, record, order, offset, limit);

  const comments = rows.map((row) => ({
    id: row.id.toString(),
    text: row.message,
    createdAt: row.createdAt ?? "",
    creator: { code: "", name: "" },
    mentions: JSON.parse(row.mentions),
  }));

  const older = order === "desc"
    ? offset + limit < totalCount
    : offset > 0;
  const newer = order === "desc"
    ? offset > 0
    : offset + limit < totalCount;

  return Response.json({ comments, older, newer });
};

type CommentBody = {
  app: number | string;
  record: number | string;
  comment:
    | (number | string)
    | { text: string; mentions?: { code: string; type: string }[] };
};

export const post = async ({ request, params }: HandlerArgs) => {
  const body: CommentBody = await request.json();
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);

  const missing: { [key: string]: { messages: string[] } } = {};
  if (body.app == null) missing.app = { messages: [m.requiredField] };
  if (body.record == null) missing.record = { messages: [m.requiredField] };
  if (body.comment == null) missing.comment = { messages: [m.requiredField] };
  if (Object.keys(missing).length > 0) return errorInvalidInput(missing, locale);

  const record = findRecordExists(db, body.app, body.record);
  if (!record) {
    return errorNotFoundRecord(body.record, locale);
  }

  if (typeof body.comment !== "object") {
    return errorInvalidInput({ comment: { messages: [m.requiredField] } }, locale);
  }

  const inserted = insertComment(
    db,
    body.app,
    body.record,
    body.comment.text,
    body.comment.mentions ?? []
  );
  if (!inserted) {
    return Response.json({ message: 'Failed to create comment.' }, { status: 500 });
  }
  return Response.json({ id: inserted.id.toString() });
};

export const del = ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);
  const url = new URL(request.url);
  const app = url.searchParams.get("app");
  const record = url.searchParams.get("record");
  const commentId = url.searchParams.get("comment");

  if (!app || !record || !commentId) {
    const missing: { [key: string]: { messages: string[] } } = {};
    if (!app) missing.app = { messages: [m.requiredField] };
    if (!record) missing.record = { messages: [m.requiredField] };
    if (!commentId) missing.comment = { messages: [m.requiredField] };
    return errorInvalidInput(missing, locale);
  }

  const db = dbSession(params.session);

  const recordRow = findRecordExists(db, app, record);
  if (!recordRow) {
    return errorNotFoundRecord(record, locale);
  }

  const deleted = deleteComment(db, app, record, commentId);
  if (!deleted) {
    return errorNotFoundComment(locale);
  }
  return Response.json({});
};
