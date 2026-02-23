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

  const records = await findRecord(db, body.app, body.record);
  if (records.length === 0) {
    return Response.json({ message: "Record not found" }, { status: 404 });
  }

  if (typeof body.comment !== "object") {
    return Response.json({ message: "Invalid comment" }, { status: 400 });
  }

  const result = await insertComment(
    db,
    body.app,
    body.record,
    body.comment.text,
    body.comment.mentions ?? []
  );
  return Response.json({ id: result[0].id.toString() });
};

export const del = async ({ request, params }: HandlerArgs) => {
  const body: CommentBody = await request.json();
  const db = dbSession(params.session);

  const records = await findRecord(db, body.app, body.record);
  if (records.length === 0) {
    return Response.json({ message: "Record not found" }, { status: 404 });
  }

  await deleteComment(db, body.app, body.record, body.comment as string | number);
  return Response.json({});
};
