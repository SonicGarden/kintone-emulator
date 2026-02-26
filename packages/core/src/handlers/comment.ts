import { dbSession } from "../db/client";
import { countComments, deleteComment, findComments, findRecordExists, insertComment } from "../db/comments";
import type { HandlerArgs } from "./types";

export const get = async ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);

  const app = url.searchParams.get("app");
  const record = url.searchParams.get("record");

  if (!app || !record) {
    return Response.json({ message: "app and record are required." }, { status: 400 });
  }

  const recordRow = await findRecordExists(db, app, record);
  if (!recordRow) {
    return Response.json({ message: "Record not found" }, { status: 404 });
  }

  const orderParam = url.searchParams.get("order") ?? "desc";
  if (orderParam !== "asc" && orderParam !== "desc") {
    return Response.json({ message: "order must be 'asc' or 'desc'." }, { status: 400 });
  }
  const order = orderParam;
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const limit = Math.max(1, Number(url.searchParams.get("limit") ?? "10") || 10);

  const totalCount = await countComments(db, app, record);
  const rows = await findComments(db, app, record, order, offset, limit);

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

  const record = await findRecordExists(db, body.app, body.record);
  if (!record) {
    return Response.json({ message: "Record not found" }, { status: 404 });
  }

  if (typeof body.comment !== "object") {
    return Response.json({ message: "Invalid comment" }, { status: 400 });
  }

  const inserted = await insertComment(
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

export const del = async ({ request, params }: HandlerArgs) => {
  const url = new URL(request.url);
  const app = url.searchParams.get("app");
  const record = url.searchParams.get("record");
  const commentId = url.searchParams.get("comment");

  if (!app || !record || !commentId) {
    return Response.json({ message: "app, record, comment are required." }, { status: 400 });
  }

  const db = dbSession(params.session);

  const recordRow = await findRecordExists(db, app, record);
  if (!recordRow) {
    return Response.json({ message: "Record not found" }, { status: 404 });
  }

  const deleted = await deleteComment(db, app, record, commentId);
  if (!deleted) {
    return Response.json({ message: "Comment not found." }, { status: 404 });
  }
  return Response.json({});
};
