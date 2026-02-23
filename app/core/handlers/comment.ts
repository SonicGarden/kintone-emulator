import { dbSession } from "../db/client";
import { deleteComment, findRecord, insertComment } from "../db/comments";
import type { HandlerArgs } from "./types";

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

  const record = await findRecord(db, body.app, body.record);
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

  const recordRow = await findRecord(db, app, record);
  if (!recordRow) {
    return Response.json({ message: "Record not found" }, { status: 404 });
  }

  const deleted = await deleteComment(db, app, record, commentId);
  if (!deleted) {
    return Response.json({ message: "Comment not found." }, { status: 404 });
  }
  return Response.json({});
};
