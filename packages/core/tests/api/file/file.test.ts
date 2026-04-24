import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

const TEST_FILE_PATH = fileURLToPath(new URL("./test.txt", import.meta.url));

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
        path: TEST_FILE_PATH,
      },
    });

    const result = await client.file.downloadFile({
      fileKey: uploadResult.fileKey,
    });
    const targetFile = readFileSync(TEST_FILE_PATH);
    expect(new Uint8Array(result)).toStrictEqual(new Uint8Array(targetFile));
  });

  test("存在しないファイルをGETすると GAIA_BL01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/file.json?fileKey=99999`);
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.code).toBe("GAIA_BL01");
    expect(json.message).toBe("指定したファイル（id: 99999）が見つかりません。");
  });
});
