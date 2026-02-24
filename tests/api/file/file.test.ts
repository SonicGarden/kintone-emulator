import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { createBaseUrl, finalizeSession, initializeSession } from "tests/helpers";
import { readFileSync } from "fs";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("file-test-session");
});

describe("アプリのフォームフィールドAPI", () => {
  beforeEach(async () => {
    await initializeSession(BASE_URL);
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("アプリにフィールドを追加し、確認し、削除できる", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: {
        apiToken: "test",
      },
    });
    const uploadResult = await client.file.uploadFile({
      file: {
        path: "./tests/api/file/test.txt",
      },
    });

    const result = await client.file.downloadFile({
      fileKey: uploadResult.fileKey,
    });
    const targetFile = readFileSync("./tests/api/file/test.txt");
    expect(new Uint8Array(result)).toStrictEqual(new Uint8Array(targetFile));
  });

  test("存在しないファイルをGETすると404が返る", async () => {
    // KintoneRestAPIClient は 4xx でエラーをthrowするため、ステータスコードを直接検証するために fetch を使用する
    const response = await fetch(`${BASE_URL}/k/v1/file.json?fileKey=99999`);
    expect(response.status).toBe(404);
  });
});
