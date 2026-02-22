import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { createBaseUrl, finalizeSession, initializeSession } from "tests/helpers";

const BASE_URL = createBaseUrl("records");

describe("アプリのレコード一覧のAPI", () => {
  let client: KintoneRestAPIClient | undefined = undefined;
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
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
        test2: {
          type: "SINGLE_LINE_TEXT",
          code: "test2",
          label: "Test2",
        },
        postedAt: {
          type: "DATETIME",
          code: "postedAt",
          label: "Posted At",
        },
      },
    });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("アプリのレコードを検索するとデータが返ってくる", async () => {
    const result = await client!.record.addRecord({
      app: 1,
      record: {
        test: {
          value: "test",
        },
      },
    });
    await client!.record.addRecord({
      app: 1,
      record: {
        test: {
          value: "test2",
        },
      },
    });
    expect(result).toEqual({
      id: expect.any(String),
      revision: "1",
    });
    const records = await client!.record.getRecords({
      app: 1,
    });
    expect(records.totalCount).toEqual("2");
    expect(records.records[0]["$id"].value).toEqual("1");
    expect(records.records[0].test.value).toEqual("test");
    expect(records.records[0].test.type).toEqual("SINGLE_LINE_TEXT");
  });

  test("fieldsを指定するとそこのデータだけ出力される", async () => {
    await Promise.all([
      client!.record.addRecord({
        app: 1,
        record: {
          test: {
            value: "test",
          },
          test2: {
            value: "test",
          },
          postedAt: {
            value: "2022-01-01T00:00:00Z",
          },
        },
      }),
    ]);
    const records = await client!.record.getRecords({
      app: 1,
      fields: ["test"],
    });
    expect(records.records[0]).not.toHaveProperty("test2");
  });

  describe("queryが存在する時、", () => {
    beforeEach(async () => {
      await Promise.all([
        client!.record.addRecord({
          app: 1,
          record: {
            test: {
              value: "test",
            },
            test2: {
              value: "test",
            },
            postedAt: {
              value: "2022-01-01T00:00:00Z",
            },
          },
        }),
        await client!.record.addRecord({
          app: 1,
          record: {
            test: {
              value: "test2",
            },
            test2: {
              value: "test2",
            },
            postedAt: {
              value: "2100-01-01T00:00:00Z",
            },
          },
        }),
      ]);
    });

    test("1つの=の式", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "test = 'test'",
      });
      expect(records.totalCount).toEqual("1");
    });
    test("2つの=の式", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "test = 'test' or test2 = 'test2'",
      });
      expect(records.totalCount).toEqual("2");
    });
    test("!=の式", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "test != 'test'",
      });
      expect(records.totalCount).toEqual("1");
    });
    test("NOW()を使った場合", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "postedAt < NOW()",
      });
      expect(records.totalCount).toEqual("1");
    });
    test("order byを指定する", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "order by test desc",
      });
      expect(records.totalCount).toEqual("2");
      expect(records.records[0].test.value).toEqual("test2");
    });
    test("idを指定する", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "$id = 1",
      });
      expect(records.totalCount).toEqual("1");
    });
  });
});
