import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import {
  createTestApp,
  describeDualMode,
  describeEmulatorOnly,
  getTestBaseUrl,
  getTestClient,
  getTestRequestHeaders,
  resetTestEnvironment,
} from "../../real-kintone";

const TEST_FILE_PATH = fileURLToPath(new URL("./test.txt", import.meta.url));

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("file-test-session");
});

describeEmulatorOnly("アプリのフォームフィールドAPI", () => {
  beforeEach(async () => {
    await initializeSession(BASE_URL);
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("アップロード用 fileKey ではダウンロードできない（実 kintone 仕様）", async () => {
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

    // アップロードAPIが返すのは一時保管領域のキー。ダウンロードAPIでは使えず、
    // レコードに添付して取得したダウンロードキーが必要。
    const response = await fetch(
      `${BASE_URL}/k/v1/file.json?fileKey=${encodeURIComponent(uploadResult.fileKey)}`,
    );
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.code).toBe("GAIA_BL01");
  });

  test("FILE フィールドはレコード取得時に contentType / name / size が補完される", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const { appId } = await createApp(BASE_URL, {
      name: "file-app",
      properties: {
        添付ファイル: { type: "FILE", code: "添付ファイル", label: "添付ファイル" },
      },
    });

    const uploadResult = await client.file.uploadFile({
      file: { path: TEST_FILE_PATH },
    });

    const { id } = await client.record.addRecord({
      app: appId,
      record: { 添付ファイル: { value: [{ fileKey: uploadResult.fileKey }] } },
    });

    const { record } = await client.record.getRecord({ app: appId, id });
    const value = (record.添付ファイル as { value: { fileKey: string }[] }).value;
    const targetFile = readFileSync(TEST_FILE_PATH);

    // fileKey はアップロード時のキーから振り替えられる（実 kintone 仕様）
    expect(value[0]!.fileKey).not.toBe(uploadResult.fileKey);
    expect(value).toEqual([
      {
        contentType: "text/plain",
        fileKey: value[0]!.fileKey,
        name: "test.txt",
        size: String(targetFile.byteLength),
      },
    ]);

    // 振り替え後のダウンロードキーでファイルを取得できる
    const downloaded = await client.file.downloadFile({ fileKey: value[0]!.fileKey });
    expect(new Uint8Array(downloaded)).toStrictEqual(new Uint8Array(targetFile));
  });

  test("存在しないファイルをGETすると GAIA_BL01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/file.json?fileKey=99999`);
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.code).toBe("GAIA_BL01");
    expect(json.message).toBe("指定したファイル（id: 99999）が見つかりません。");
  });
});

describeDualMode("添付ファイルのダウンロード", () => {
  const SESSION = "file-download";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "file download",
      properties: {
        添付ファイル: { type: "FILE", code: "添付ファイル", label: "添付ファイル" },
      },
    }));
  });

  /** ファイルを1つ添付したレコードを作り、ダウンロードキーを返す */
  const attachFile = async (name: string, data: Buffer): Promise<string> => {
    const { fileKey } = await client.file.uploadFile({ file: { name, data } });
    const { id } = await client.record.addRecord({
      app: appId,
      record: { 添付ファイル: { value: [{ fileKey }] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    return (record.添付ファイル as { value: { fileKey: string }[] }).value[0]!.fileKey;
  };

  const download = (fileKey: string) =>
    fetch(`${getTestBaseUrl(SESSION)}/k/v1/file.json?fileKey=${encodeURIComponent(fileKey)}`, {
      headers: getTestRequestHeaders(),
    });

  test("ASCII のファイル名は Content-Disposition にそのまま入る", async () => {
    const response = await download(await attachFile("test.txt", Buffer.from("body")));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="test.txt"');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("body");
  });

  test("非 ASCII のファイル名は RFC 2047 の encoded-word になる", async () => {
    const response = await download(await attachFile("テスト.txt", Buffer.from("中身")));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="=?UTF-8?B?44OG44K544OILnR4dA==?="',
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("中身");
  });

  test("非 ASCII のファイル名でも SDK でダウンロードできる", async () => {
    const fileKey = await attachFile("テスト ファイル(1).txt", Buffer.from("中身"));

    const downloaded = await client.file.downloadFile({ fileKey });
    expect(Buffer.from(downloaded).toString()).toBe("中身");
  });
});
