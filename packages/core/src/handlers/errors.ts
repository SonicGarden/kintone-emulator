import crypto from "node:crypto";
import type { Locale } from "./validate";

export const generateErrorId = () => crypto.randomBytes(15).toString("base64url");

export type ErrorMessages = {
  invalidInput: string;
  requiredField: string;
  mustBeAtLeastOne: string;
  enumValue: string;
  notFoundRecord: (id: string | number) => string;
  notFoundApp: (id: string | number) => string;
  notFoundFile: (id: string) => string;
  notFoundComment: string;
};

const MESSAGES: Record<Locale, ErrorMessages> = {
  ja: {
    invalidInput: "入力内容が正しくありません。",
    requiredField: "必須です。",
    mustBeAtLeastOne: "最小でも1以上です。",
    enumValue: "Enum値のいずれかでなければなりません。",
    notFoundRecord: (id) => `指定したレコード（id: ${id}）が見つかりません。`,
    notFoundApp:    (id) => `指定したアプリ（id: ${id}）が見つかりません。削除されている可能性があります。`,
    notFoundFile:   (id) => `指定したファイル（id: ${id}）が見つかりません。`,
    notFoundComment: "指定したコメントが存在しません。削除された可能性があります。",
  },
  en: {
    invalidInput: "Missing or invalid input.",
    requiredField: "Required field.",
    mustBeAtLeastOne: "must be greater than or equal to 1",
    enumValue: "must be one of the enum value",
    notFoundRecord: (id) => `The specified record (ID: ${id}) is not found.`,
    notFoundApp:    (id) => `The app (ID: ${id}) not found. The app may have been deleted.`,
    notFoundFile:   (id) => `The specified file (id: ${id}) not found.`,
    notFoundComment: "The specified comment does not exist. The comment may have been deleted.",
  },
};

export const errorMessages = (locale: Locale): ErrorMessages => MESSAGES[locale];

export type ValidationErrorsMap = { [key: string]: { messages: string[] } };

export const errorInvalidInput = (errors: ValidationErrorsMap, locale: Locale = "ja") =>
  Response.json(
    {
      code: "CB_VA01",
      id: generateErrorId(),
      message: MESSAGES[locale].invalidInput,
      errors,
    },
    { status: 400 }
  );

export const errorNotFoundRecord = (recordId: string | number, locale: Locale = "ja") =>
  Response.json(
    { code: "GAIA_RE01", id: generateErrorId(), message: MESSAGES[locale].notFoundRecord(recordId) },
    { status: 404 }
  );

export const errorNotFoundApp = (appId: string | number, locale: Locale = "ja") =>
  Response.json(
    { code: "GAIA_AP01", id: generateErrorId(), message: MESSAGES[locale].notFoundApp(appId) },
    { status: 404 }
  );

export const errorNotFoundFile = (fileKey: string, locale: Locale = "ja") =>
  Response.json(
    { code: "GAIA_BL01", id: generateErrorId(), message: MESSAGES[locale].notFoundFile(fileKey) },
    { status: 404 }
  );

// 実 kintone はコメント未存在時 HTTP 400 を返す（404 ではない）
export const errorNotFoundComment = (locale: Locale = "ja") =>
  Response.json(
    { code: "GAIA_RE02", id: generateErrorId(), message: MESSAGES[locale].notFoundComment },
    { status: 400 }
  );

// 計算式バリデーションエラー（deploy 時相当）。実機は:
//   [400] [GAIA_IL01]
//   message: "フィールド「<label>」の計算式が正しくありません。(エラーの内容：<detail>)"
// errors オブジェクトは付かない。
export const errorInvalidFormula = (
  fieldLabel: string,
  detailMessage: string,
  locale: Locale = "ja",
) => {
  const message = locale === "ja"
    ? `フィールド「${fieldLabel}」の計算式が正しくありません。(エラーの内容：${detailMessage})`
    : `The formula in the field '${fieldLabel}' is invalid. (Reason: ${detailMessage})`;
  return Response.json(
    { code: "GAIA_IL01", id: generateErrorId(), message },
    { status: 400 }
  );
};

// CALC の format が enum にない場合のエラー（addFormFields 相当）。
export const errorInvalidCalcFormat = (key: string, locale: Locale = "ja") =>
  errorInvalidInput({ [key]: { messages: [MESSAGES[locale].enumValue] } }, locale);

// addFormFields 時に LOOKUP の fieldMappings.field が同一リクエスト内 +
// 既存フィールドのいずれにも存在しない場合に返るエラー。
export const errorFieldNotFound = (fieldCode: string, locale: Locale = "ja") => {
  const message = locale === "ja"
    ? `指定されたフィールド（code: ${fieldCode}）が見つかりません。`
    : `The specified field (code: ${fieldCode}) is not found.`;
  return Response.json(
    { code: "GAIA_FC01", id: generateErrorId(), message },
    { status: 400 }
  );
};

// ゲストスペース内のアプリへ非ゲストパスでアクセスしたときのエラー（HTTP 520, GAIA_IL23）
export const errorGuestSpacePathRequired = (locale: Locale = "ja") => {
  const message = locale === "ja"
    ? "ゲストスペース内のアプリを操作する場合は、リクエストの送信先を「/k/guest/（ゲストスペースのID）/v1/...」にします。"
    : "When you operate an app in a guest space, please send the request to '/k/guest/(guest space ID)/v1/...'.";
  return Response.json(
    { code: "GAIA_IL23", id: generateErrorId(), message },
    { status: 520 }
  );
};

// ルックアップのキー不一致（HTTP 400、errors オブジェクトは付かない）
export const errorLookupNotFound = (fieldCode: string, value: string, locale: Locale = "ja") => {
  const message = locale === "ja"
    ? `フィールド「${fieldCode}」の値「${value}」が、ルックアップの参照先のフィールドにないか、またはアプリやフィールドの閲覧権限がありません。`
    : `A value ${value} in the field ${fieldCode} does not exist in the datasource app for lookup, or you do not have permission to view the app or the field.`;
  return Response.json(
    { code: "GAIA_LO04", id: generateErrorId(), message },
    { status: 400 }
  );
};
