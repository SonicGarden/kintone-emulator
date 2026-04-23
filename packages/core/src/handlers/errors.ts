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
