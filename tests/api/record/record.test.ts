import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { host } from "tests/config";

describe("アプリのレコードAPI", () => {
  let client: KintoneRestAPIClient | undefined = undefined;
  beforeEach(async () => {
    await fetch(`http://${host}/record/initialize`, {
      method: "POST",
    });
    client = new KintoneRestAPIClient({
      baseUrl: `http://${host}/record`,
      auth: {
        apiToken: "test",
      },
    });
    await client.app.addFormFields({
      app: 1,
      properties: {
        test: {
          type: "SINGLE_LINE_TEXT",
          code: "test",
          label: "Test",
        },
      },
    });
  });

  afterEach(async () => {
    await fetch(`http://${host}/record/finalize`, {
      method: "POST",
    });
  });

  test("アプリにレコードを追加し、変更し、検索できる", async () => {
    const result = await client!.record.addRecord({
      app: 1,
      record: {
        test: {
          value: "test",
        },
      },
    });
    expect(result).toEqual({
      id: expect.any(String),
      revision: 1,
    });
    const record = await client!.record.getRecord({
      app: 1,
      id: result.id,
    });
    expect(record).toEqual({
      record: {
        $id: {
          value: result.id,
          type: "RECORD_NUMBER",
        },
        test: {
          value: "test",
          type: "SINGLE_LINE_TEXT",
        },
      },
    });
    await client!.record.updateRecord({
      app: 1,
      id: result.id,
      record: {
        test: {
          value: "test2",
        },
      },
    });
    const updatedRecord = await client!.record.getRecord({
      app: 1,
      id: result.id,
    });
    expect(updatedRecord).toEqual({
      record: {
        $id: {
          value: result.id,
          type: "RECORD_NUMBER",
        },
        test: {
          value: "test2",
          type: "SINGLE_LINE_TEXT",
        },
      },
    });
  });
});
