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

  /**
   * WHATWG 準拠のクライアント（ブラウザ / undici の FormData）で 1 ファイル添付し、
   * 保存された name とダウンロード時の Content-Disposition を返す。
   * SDK (form-data パッケージ) はエスケープしないので、この経路の検証には使えない。
   */
  const uploadViaWhatwg = async (name: string, type = "text/plain") => {
    const form = new FormData();
    form.append("file", new File([Buffer.from("body")], name, { type }));
    const up = await fetch(`${getTestBaseUrl(SESSION)}/k/v1/file.json`, {
      method: "POST",
      headers: getTestRequestHeaders(),
      body: form,
    });
    const { fileKey } = (await up.json()) as { fileKey: string };

    const { id } = await client.record.addRecord({
      app: appId,
      record: { 添付ファイル: { value: [{ fileKey }] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const value = (
      record.添付ファイル as { value: { fileKey: string; name: string; contentType: string }[] }
    ).value;

    const dl = await download(value[0]!.fileKey);
    return {
      storedName: value[0]!.name,
      storedContentType: value[0]!.contentType,
      contentDisposition: dl.headers.get("content-disposition"),
      contentType: dl.headers.get("content-type"),
    };
  };

  test("ダブルクォートはエスケープされたまま保存され、ヘッダーでは _ になる", async () => {
    // ブラウザは filename="double%22quote.txt" として送り、kintone は復元せずそのまま保存する
    expect(await uploadViaWhatwg('double"quote.txt')).toMatchObject({
      storedName: "double%22quote.txt",
      contentDisposition: 'attachment; filename="double_quote.txt"',
    });
  });

  test("ファイル名に使えない文字はヘッダーでのみ _ になる", async () => {
    expect(await uploadViaWhatwg("colon:star*.txt")).toMatchObject({
      storedName: "colon:star*.txt",
      contentDisposition: 'attachment; filename="colon_star_.txt"',
    });
  });

  test("洗ったあとの非 ASCII ファイル名が encoded-word になる", async () => {
    expect(await uploadViaWhatwg('テスト"引用符.txt')).toMatchObject({
      storedName: "テスト%22引用符.txt",
      contentDisposition: 'attachment; filename="=?UTF-8?B?44OG44K544OIX+W8leeUqOespi50eHQ=?="',
    });
  });

  test("パス成分は落として保存される", async () => {
    expect(await uploadViaWhatwg("back\\slash.txt")).toMatchObject({
      storedName: "slash.txt",
      contentDisposition: 'attachment; filename="slash.txt"',
    });
  });

  // 保存された contentType には charset が付かず、ダウンロード応答のヘッダーにだけ付く。
  // 実機は MIME を拡張子から導くので、拡張子と申告 MIME が一致するものだけを使う。
  //
  // application/json をここで扱わないのは、e2e (react-router-serve) の express 層が
  // JSON 応答に `; charset=utf-8` を足してしまい、ハンドラーの出力を検証できないため。
  // 「application/json には charset が付かない」は downloadContentType の単体テストで押さえている。
  test.each([
    ["a.txt", "text/plain", "text/plain;charset=utf-8"],
    ["a.html", "text/html", "text/html;charset=utf-8"],
    ["a.csv", "text/csv", "text/csv; charset=UTF-8"],
    ["a.pdf", "application/pdf", "application/pdf"],
  ])("%j の Content-Type は %j で保存され %j で返る", async (name, stored, downloaded) => {
    expect(await uploadViaWhatwg(name, stored)).toMatchObject({
      storedContentType: stored,
      contentType: downloaded,
    });
  });
});

describeDualMode("添付ファイルのアップロード（リクエスト形式エラー）", () => {
  const SESSION = "file-upload-error";

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
  });

  const BOUNDARY = "----uploadErrorBoundary";

  // Accept-Language は必ず明示する。省略すると undici が `*` を自動付与し、実 kintone は
  // それを en、エミュレーターは ja と解釈するので、メッセージの比較が両モードで揃わない。
  const upload = (body: BodyInit, contentType?: string, locale = "ja") =>
    fetch(`${getTestBaseUrl(SESSION)}/k/v1/file.json`, {
      method: "POST",
      headers: {
        ...getTestRequestHeaders(),
        ...(contentType ? { "Content-Type": contentType } : {}),
        "Accept-Language": locale,
      },
      body,
    });

  /** form-data パッケージが生成するのと同じ、filename をエスケープしない multipart */
  const rawMultipart = (filename: string) =>
    [
      `--${BOUNDARY}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      "Content-Type: text/plain",
      "",
      "body",
      `--${BOUNDARY}--`,
      "",
    ].join("\r\n");

  test.each([
    [
      "part ヘッダーの quoted-string が壊れている",
      () => upload(rawMultipart('double"quote.txt'), `multipart/form-data; boundary=${BOUNDARY}`),
    ],
    ["そもそも multipart ではない", () => upload(JSON.stringify({ file: "x" }), "application/json")],
    [
      "boundary が本文と一致しない",
      () => upload(rawMultipart("plain.txt"), "multipart/form-data; boundary=mismatched"),
    ],
  ])("multipart として読めないリクエストは GAIA_HM02 (%s)", async (_label, send) => {
    const response = await send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "GAIA_HM02",
      message:
        "アップロードするHTTPリクエストの形式が正しくありません。HTTPリクエストはマルチパート形式である必要があります。",
    });
  });

  test("multipart として読めないリクエストのメッセージは Accept-Language に従う", async () => {
    const response = await upload(JSON.stringify({ file: "x" }), "application/json", "en");

    expect(await response.json()).toMatchObject({
      code: "GAIA_HM02",
      message:
        "The HTTP request format to upload a file is not valid. The HTTP request must be in multipart format.",
    });
  });

  test.each([
    ["file パートが無い", () => {
      const form = new FormData();
      form.append("notfile", new File([Buffer.from("body")], "a.txt", { type: "text/plain" }));
      return form;
    }],
    ["file がファイルではなく文字列", () => {
      const form = new FormData();
      form.append("file", "just a string");
      return form;
    }],
    ["空の multipart", () => new FormData()],
  ])("multipart だが file を取り出せないリクエストは CB_IL02 (%s)", async (_label, build) => {
    const response = await upload(build());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "CB_IL02",
      message: "不正なリクエストです。",
    });
  });

  test("WHATWG 準拠のクライアントはダブルクォートを %22 に逃がすのでアップロードできる", async () => {
    // ブラウザ / undici の FormData は multipart を壊さないため、実 kintone でもエラーにならない。
    // ワイヤ上に生のダブルクォートが乗らないのはこのため。ただし「だからその先で気にしなくてよい」
    // わけではなく、保存名とヘッダーの扱いは別途 normalizeUploadedFilename /
    // content-disposition.ts が実機に合わせている（上の describe のテストを参照）。
    const form = new FormData();
    form.append("file", new File([Buffer.from("body")], 'double"quote.txt', { type: "text/plain" }));

    const response = await upload(form);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fileKey: expect.any(String) });
  });
});
