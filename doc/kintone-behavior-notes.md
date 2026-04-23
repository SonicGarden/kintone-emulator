# 実 kintone 挙動メモ

エミュレーター実装時に実機で観察した挙動の記録。検証環境: `<your-domain>.cybozu.com` アプリ ID=<APP_ID>。

各節末には一次観察（curl 実行結果）のキャプチャを添える。観察日時は 2026-04-23、JST。

---

## 1. エラーレスポンス共通

### レスポンス形式

- HTTP 400 / 404
- `{ code, id, message }`（+ バリデーション系は `errors`）
- `id` はリクエストごとにランダムな文字列（base64url 相当）

### 404 系（Not Found）

| ケース | code | message ja | message en |
|---|---|---|---|
| Record not found | `GAIA_RE01` | `指定したレコード（id: <id>）が見つかりません。` | `The specified record (ID: <id>) is not found.` |
| App not found | `GAIA_AP01` | `指定したアプリ（id: <id>）が見つかりません。削除されている可能性があります。` | `The app (ID: <id>) not found. The app may have been deleted.` |
| File not found | `GAIA_BL01` | `指定したファイル（id: <id>）が見つかりません。` | `The specified file (id: <id>) not found.` |

#### 生レスポンス

```
GET /k/v1/record.json?app=<APP_ID>&id=99999  (ja)
-> 404
{
  "code": "GAIA_RE01",
  "id": "jxcbVKLdjmcOc1wQ2nMT",
  "message": "指定したレコード（id: 99999）が見つかりません。"
}

GET /k/v1/record.json?app=<APP_ID>&id=99999  (Accept-Language: en)
-> 404
{
  "code": "GAIA_RE01",
  "id": "3Z4lr65VBuuvQuob95sx",
  "message": "The specified record (ID: 99999) is not found."
}

GET /k/v1/app.json?id=99999  (ja)
-> 404
{
  "code": "GAIA_AP01",
  "id": "BkzBLir5NlPlbSqZjxRB",
  "message": "指定したアプリ（id: 99999）が見つかりません。削除されている可能性があります。"
}

GET /k/v1/app.json?id=99999  (en)
-> 404
{
  "code": "GAIA_AP01",
  "id": "zyNsMgNfPkhtkhCgnil8",
  "message": "The app (ID: 99999) not found. The app may have been deleted."
}

GET /k/v1/file.json?fileKey=nonexistent_key  (ja)
-> 404
{
  "code": "GAIA_BL01",
  "id": "KscKY35G5ntVbSAwTM9x",
  "message": "指定したファイル（id: nonexistent_key）が見つかりません。"
}

GET /k/v1/file.json?fileKey=xxx  (en)
-> 404
{
  "code": "GAIA_BL01",
  "id": "2QfmZjTRidxPTtMaqwby",
  "message": "The specified file (id: xxx) not found."
}
```

### 400 系（コメント削除失敗は 400！）

| ケース | code | HTTP | message ja | message en |
|---|---|---|---|---|
| Comment not found | `GAIA_RE02` | 400 | `指定したコメントが存在しません。削除された可能性があります。` | `The specified comment does not exist. The comment may have been deleted.` |

#### 生レスポンス

```
DELETE /k/v1/record/comment.json  body={app:<APP_ID>, record:93, comment:99999}  (ja)
-> 400
{
  "code": "GAIA_RE02",
  "id": "f5loVndKkFGtQBrg1Q5h",
  "message": "指定したコメントが存在しません。削除された可能性があります。"
}

DELETE ... (en)
-> 400
{
  "code": "GAIA_RE02",
  "id": "wNx9OQmlFLHy0Duill8l",
  "message": "The specified comment does not exist. The comment may have been deleted."
}
```

### 400 CB_VA01 パラメーター検証

| ケース | errors キー | messages ja | messages en |
|---|---|---|---|
| パラメーター必須欠落（app, id, ids, record, comment 等） | `<name>` | `必須です。` | `Required field.` |
| `app` が負数 / 0 | `app` | `最小でも1以上です。` | `must be greater than or equal to 1` |
| `ids` 空配列（records.json DELETE） | `ids` | 2 メッセージ: `必須です。` + `一度に1件から100件までのレコードを削除できます。` | 順逆: `Between 1 and 100 records can be deleted at one time.` + `Required field.` |
| order が enum 外（comments 系） | `order` | `Enum値のいずれかでなければなりません。` | `must be one of the enum value` |

備考: レコード内の「必須フィールド」用の英語メッセージは `Required.`（後述）だが、URL/body パラメーター用の英語は `Required field.` と異なる。文脈ごとに使い分け。

#### 生レスポンス

```
GET /k/v1/record.json?app=<APP_ID>  (id 欠落, ja)
-> 400
{
  "code": "CB_VA01",
  "id": "aBc8xyRm9kiFutkr90f1",
  "message": "入力内容が正しくありません。",
  "errors": { "id": { "messages": ["必須です。"] } }
}

GET /k/v1/record.json?app=<APP_ID>  (en)
-> 400
{
  "code": "CB_VA01",
  "id": "lU7ktS1gHDiuQrE2FRJc",
  "message": "Missing or invalid input.",
  "errors": { "id": { "messages": ["Required field."] } }
}

GET /k/v1/app/status.json?app=-1  (ja)
-> 400
{
  "code": "CB_VA01",
  "id": "BjLkOEsyMYmeiTjeZReF",
  "message": "入力内容が正しくありません。",
  "errors": { "app": { "messages": ["最小でも1以上です。"] } }
}

GET /k/v1/app/status.json?app=-1  (en)
-> 400
{
  "code": "CB_VA01",
  "id": "uq1CPEYBCdZF2M8ci0MO",
  "message": "Missing or invalid input.",
  "errors": { "app": { "messages": ["must be greater than or equal to 1"] } }
}

DELETE /k/v1/records.json  body={app:<APP_ID>}  (ids 欠落, ja)
-> 400
{
  "code": "CB_VA01",
  "id": "eyvqi2nsaZN6D8vryyWD",
  "message": "入力内容が正しくありません。",
  "errors": {
    "ids": { "messages": ["必須です。", "一度に1件から100件までのレコードを削除できます。"] }
  }
}

DELETE /k/v1/records.json  body={app:<APP_ID>}  (en)
-> 400
{
  "code": "CB_VA01",
  "id": "KM59HVsp4eQ0KSLGG24Q",
  "message": "Missing or invalid input.",
  "errors": {
    "ids": { "messages": ["Between 1 and 100 records can be deleted at one time.", "Required field."] }
  }
}

GET /k/v1/record/comments.json?app=<APP_ID>&record=93&order=wrong  (ja)
-> 400
{
  "code": "CB_VA01",
  "id": "2wFWmZujq0ar5Up7VK9H",
  "message": "入力内容が正しくありません。",
  "errors": { "order": { "messages": ["Enum値のいずれかでなければなりません。"] } }
}

GET .../comments.json?...&order=wrong  (en)
-> 400
{
  "code": "CB_VA01",
  "id": "9vMxNZLeIek4Qu67XO0v",
  "message": "Missing or invalid input.",
  "errors": { "order": { "messages": ["must be one of the enum value"] } }
}
```

### ロケール切り替え（`Accept-Language` ヘッダー）

| リクエスト | message | messages |
|---|---|---|
| `Accept-Language: ja` | `入力内容が正しくありません。` | 日本語 |
| `Accept-Language: en` | `Missing or invalid input.` | 英語 |
| `Accept-Language: zh` | `输入有误。` | 中国語（エミュレーターでは実装していない） |
| ヘッダー無し | `入力内容が正しくありません。` | 日本語（デフォルト） |

#### 生レスポンス（zh サンプル）

```
POST /k/v1/record.json  body={app:<APP_ID>,record:{}}  (Accept-Language: zh)
-> 400
{
  "code": "CB_VA01",
  "id": "VOTQSp4k0sAt9gXdQ2CL",
  "message": "输入有误。",
  "errors": {
    "record.req_check.values":     {"messages":["此为必填项。"]},
    "record.req_user.values.value":{"messages":["此为必填项。"]},
    "record.req_text.value":       {"messages":["此为必填项。"]},
    "record.req_number.value":     {"messages":["此为必填项。"]},
    "record.req_multi.values":     {"messages":["此为必填项。"]}
  }
}
```

備考: Node.js の `undici` fetch は自動で `accept-language: *` を付けてくる。`"*"` もデフォルト扱い（日本語）にしないと、ヘッダー無し想定のテストが壊れる。

### errors キーの接尾辞（レコードバリデーション）

| 設定 | タイプ | キー接尾辞 |
|---|---|---|
| required（スカラー値） | `SINGLE_LINE_TEXT` / `MULTI_LINE_TEXT` / `RICH_TEXT` / `LINK` / `NUMBER` / `DATE` / `TIME` / `DATETIME` / `RADIO_BUTTON` / `DROP_DOWN` / `CALC` | `.value` |
| required（配列値） | `CHECK_BOX` / `MULTI_SELECT` / `FILE` | `.values` |
| required（ユーザー系） | `USER_SELECT` / `ORGANIZATION_SELECT` / `GROUP_SELECT` | `.values.value` |
| `options` 違反（スカラー） | `RADIO_BUTTON` / `DROP_DOWN` | `.value` |
| `options` 違反（配列） | `CHECK_BOX` / `MULTI_SELECT` | `.values[<index>].value` |
| NaN（数値パース失敗） | `NUMBER` | `record[<code>].value` ※ドット区切りではなくブラケット |

---

## 2. required

### 挙動

- 未送信 / `null` / `""` / `[]` のいずれでも必須エラー
- PUT はマージ後のレコードに対して検証（既存値が埋まっていて、差分更新が別フィールドだけなら成功）
- `SUBTABLE` / `GROUP` / `LABEL` / `SPACER` / `HR` / `REFERENCE_TABLE` / `CATEGORY` / `STATUS` / `STATUS_ASSIGNEE` / `CREATED_TIME` / `UPDATED_TIME` / `CREATOR` / `MODIFIER` / `CALC` / `RECORD_NUMBER` / `__REVISION__` は required 検証の対象外
- **`defaultValue` が設定されている場合、未送信でも補完されるため required エラーにならない**（§7 参照）
- SUBTABLE 内の入れ子 required は別のキー形式（今回未実装 / 未確認）

### messages

| locale | messages |
|---|---|
| ja | `必須です。` |
| en | `Required.` |

### 生レスポンス

```
POST /k/v1/record.json  body={app:<APP_ID>, record:{}}  (ja)
-> 400
{
  "code": "CB_VA01",
  "id": "BQup4D133smPezTHZDU3",
  "message": "入力内容が正しくありません。",
  "errors": {
    "record.req_check.values":     {"messages":["必須です。"]},
    "record.req_file.values":      {"messages":["必須です。"]},
    "record.req_user.values.value":{"messages":["必須です。"]},
    "record.req_text.value":       {"messages":["必須です。"]},
    "record.req_number.value":     {"messages":["必須です。"]},
    "record.req_multi.values":     {"messages":["必須です。"]}
  }
}

POST /k/v1/record.json  body={app:<APP_ID>, record:{}}  (en)
-> 400
{
  "code": "CB_VA01",
  "id": "pwD8228Ry9Cl9W8KVdQy",
  "message": "Missing or invalid input.",
  "errors": {
    "record.req_check.values":     {"messages":["Required."]},
    "record.req_user.values.value":{"messages":["Required."]},
    "record.req_text.value":       {"messages":["Required."]},
    "record.req_number.value":     {"messages":["Required."]},
    "record.req_multi.values":     {"messages":["Required."]}
  }
}
```

### 後から `required: true` に変更した場合の挙動

アプリ運用中に、既存フィールドの `required` を後から `true` にしてデプロイしたケース（app=<APP_ID> で検証）:

| 操作 | 結果 |
|---|---|
| `PUT /preview/app/form/fields.json` → `preview/app/deploy.json` | **デプロイ成功**。既存レコードが当該フィールドを空のまま持っていてもエラーにならない |
| 既存レコードの **GET** | そのまま返る（該当フィールドは `""` のまま） |
| **新規 POST** で当該フィールド省略 | 400 `必須です。` |
| 既存レコードの **PUT**（別フィールドだけ更新し、当該 required は送らない） | **400 `必須です。`** ← マージ後のレコードで required が空だと弾かれる |
| 既存レコードの **PUT** で当該フィールドに値を入れる | 200（以降は通常通り更新可能） |

つまり:
- **デプロイはブロックされない**（フィールド変更で過去データは書き換わらない）
- 既存レコードは空のまま**温存**される
- そのレコードを**更新しようとした時点で** required フィールドを埋めることが強制される
- 更新しなければ永遠に空のまま保持され続ける

#### 生レスポンス（既存レコードを別フィールドだけ PUT）

```
# app=<APP_ID>, id=4 は later_req="" のまま既存
# later_req を required:true に変更してデプロイ後に:
PUT /k/v1/record.json  body={app:<APP_ID>, id:4, record:{t:{value:"updated_t_only"}}}
-> 400
{
  "code":"CB_VA01",
  "id":"SFVSK0WX39b7gXQL8x6f",
  "message":"入力内容が正しくありません。",
  "errors":{
    "record.later_req.value":{"messages":["必須です。"]}
  }
}
```

### エミュレーターでの再現

- エミュレーターは `PUT /preview/app/form/fields.json`（フィールド定義更新）を未実装なので、後から `required` を付ける操作自体が直接は呼べない
- ただし **`setup/app.json` の records 一括投入は validate を通さない**（`applyDefaults` と `normalizeNumbers` のみ適用）ため、「required フィールドが空の既存レコード」を直接セットアップ可能
- そのレコードに対して以後 POST/PUT すると、実機どおり required バリデーションが走る

```ts
// 既存レコードが required を欠いたまま残る状況を再現
await createApp(BASE_URL, {
  name: "テスト",
  properties: {
    req: { type: "SINGLE_LINE_TEXT", code: "req", label: "req", required: true },
  },
  records: [
    { req: { value: "" } },      // setup 経由なので required 検証は走らない
    { req: { value: "filled" } },
  ],
});
// 以降、1 件目を PUT すると `record.req.value: ["必須です。"]` で 400
```

---

## 3. unique

### 挙動

- `code: CB_VA01`（`GAIA_RE02` ではない）
- 空文字 `""` は重複扱いされない（複数レコードで `""` OK）
- 配列値のフィールドは `unique` 設定自体できない（CHECK_BOX / USER_SELECT 等）
- PUT は自レコード自身を除外して判定（同じ値に上書きは通る。他レコードと重複する値への更新は 400）

### messages

| locale | messages |
|---|---|
| ja | `値がほかのレコードと重複しています。` |
| en | `This value already exists in another record.` |

### 生レスポンス

```
POST /k/v1/record.json  body={app:<APP_ID>, record:{req_text:{value:"abc"}, ...}}
# 既に req_text=abc を持つレコードが存在
-> 400
{
  "code": "CB_VA01",
  "id": "LyJKDMrsYD4xdYBEfweL",
  "message": "入力内容が正しくありません。",
  "errors": {
    "record.req_text.value": {"messages":["値がほかのレコードと重複しています。"]}
  }
}

POST ... (en)
-> 400
{
  "code": "CB_VA01",
  "id": "aImRBUSI5Bsx3i8lZOsX",
  "message": "Missing or invalid input.",
  "errors": {
    "record.req_text.value": {"messages":["This value already exists in another record."]}
  }
}

PUT /k/v1/record.json  body={app:<APP_ID>, id:89, record:{req_text:{value:"abc"}}}
# id=89 の req_text が既に "abc" のとき
-> 200 {"revision":"2"}

PUT /k/v1/record.json  body={app:<APP_ID>, id:90, record:{req_text:{value:"abc"}}}
# 他レコードが "abc" を保持、90 は "def" を "abc" に変更
-> 400 （同じ errors）
```

---

## 4. 文字数（`maxLength` / `minLength`）

### 対象タイプ

`SINGLE_LINE_TEXT` / `MULTI_LINE_TEXT` / `LINK`

### 挙動

- 空文字 `""` は検証対象外（required と同時なら「必須です。」のみ）
- 超過/未満のメッセージは **`maxLength+1` / `minLength-1`** の値を文字列に埋め込む（＝「入力許容範囲外の最小値」を示す表現）

### messages

| | ja | en |
|---|---|---|
| maxLength 超過 | `(maxLength+1)文字より短くなければなりません。` | `Enter less than (maxLength+1) characters.` |
| minLength 未満 | `(minLength-1)文字より長くなければなりません。` | `Enter more than (minLength-1) characters.` |

### 生レスポンス

```
# req_text に maxLength=5 設定、6文字送信  (ja)
POST /k/v1/record.json  body={app:<APP_ID>, record:{req_text:{value:"123456"}, ...}}
-> 400
{
  "code":"CB_VA01",
  "id":"Wq2YOHicjdgDKQhSJbqn",
  "message":"入力内容が正しくありません。",
  "errors":{
    "record.req_text.value":{"messages":["6文字より短くなければなりません。"]}
    ... (他 required も同時に発生)
  }
}

# minLength=2, 1文字 (ja)
POST ...
{
  "errors":{ "record.req_text.value":{"messages":["1文字より長くなければなりません。"]} }
}

# en の maxLength=3, "toolong"(7文字) → "less than 4 characters"
"errors": { "record.req_text.value": {"messages":["Enter less than 4 characters."]} }
```

---

## 5. 数値範囲（`maxValue` / `minValue`）と数値パース

### 対象タイプ

`NUMBER`

### 挙動

- 空文字 `""` は検証対象外
- 数値以外の文字列が入ってきた場合、**ブラケット記法のキー** `record[<code>].value` に `"数字でなければなりません。"` を返す
  - 同時に `record.<code>.value` に `"必須です。"` も返る（parse 不能を「未入力」と同等扱い）

### messages

| | ja | en |
|---|---|---|
| maxValue 超過 | `<maxValue>以下である必要があります。` | `The value must be <maxValue> or less.` |
| minValue 未満 | `<minValue>以上である必要があります。` | `The value must be <minValue> or more.` |
| 非数値 | `数字でなければなりません。` | `Only numbers are allowed.` |

### 生レスポンス

```
# maxValue=100, 150 送信 (ja)
-> {
  "code":"CB_VA01",
  "id":"jf5er4gBdWYmdIVEMzSm",
  "message":"入力内容が正しくありません。",
  "errors":{ "record.req_number.value":{"messages":["100以下である必要があります。"]} }
}

# minValue=10, 5 送信 (ja)
-> "errors":{ "record.req_number.value":{"messages":["10以上である必要があります。"]} }

# maxValue=100, 150 送信 (en)
-> "errors":{ "record.req_number.value":{"messages":["The value must be 100 or less."]} }

# 非数値 "abc" 送信 (ja)  ― 2 キー同時
-> {
  "code":"CB_VA01",
  "id":"gMYr0iBrdp9372UdWHqM",
  "errors":{
    "record.req_number.value":  {"messages":["必須です。"]},
    "record[req_number].value": {"messages":["数字でなければなりません。"]}
  }
}

# 非数値 "abc" (en)
-> "errors":{
  "record.req_number.value":  {"messages":["Required."]},
  "record[req_number].value": {"messages":["Only numbers are allowed."]}
}
```

---

## 6. `options` 整合性

### 対象タイプ

`RADIO_BUTTON` / `DROP_DOWN` / `CHECK_BOX` / `MULTI_SELECT`

### 挙動

- 選択肢に含まれない値を送ると 400
- スカラー系（RADIO / DROP_DOWN）は `record.<code>.value`
- 配列系（CHECK_BOX / MULTI_SELECT）は **要素 index 付きキー** `record.<code>.values[<i>].value`
- 空文字 / 空配列は検証スキップ

### messages

| | ja | en |
|---|---|---|
| 範囲外 | `"<value>"は選択肢にありません。` | `The value, "<value>", is not in options.` |

### 生レスポンス

```
# RADIO_BUTTON "Z" (範囲外)
-> "errors": {
  "record.fld_radio.value": {"messages":["\"Z\"は選択肢にありません。"]}
}

# DROP_DOWN "Q"
-> "errors": {
  "record.fld_drop.value": {"messages":["\"Q\"は選択肢にありません。"]}
}

# CHECK_BOX に ["X"] (範囲外)
-> {
  "code":"CB_VA01",
  "id":"SeWojMlyki16mOmKduKi",
  "errors":{
    "record.req_check.values":            {"messages":["必須です。"]},
    "record.req_check.values[0].value":   {"messages":["\"X\"は選択肢にありません。"]},
    ...
  }
}

# (en) RADIO_BUTTON "Z" + CHECK_BOX ["X"] 同時
-> "errors":{
  "record.req_check.values":           {"messages":["Required."]},
  "record.req_check.values[0].value":  {"messages":["The value, \"X\", is not in options."]},
  "record.fld_radio.value":            {"messages":["The value, \"Z\", is not in options."]}
}
```

---

## 7. `defaultValue` / `defaultNowValue` の自動補完

### 補完のトリガー

- **record に該当 key が存在しない** → 補完
- **`{value:""}` / `{value:[]}` が明示的に送信** → 補完しない（空値として尊重）
- 明示的な値あり → そのまま保存（defaultValue で上書きしない）
- **PUT（更新）では defaultValue は適用されない**（POST 時のみ）

### タイプ別

| タイプ | defaultValue 形状 | defaultNowValue | 補完後の形式 |
|---|---|---|---|
| SINGLE_LINE_TEXT / NUMBER / RADIO_BUTTON / DROP_DOWN / LINK | 文字列 | — | そのまま |
| CHECK_BOX / MULTI_SELECT | 配列 | — | そのまま |
| DATE | `"YYYY-MM-DD"` | `true` で現在日（ローカル日付） | `"YYYY-MM-DD"` |
| DATETIME | `"2012-07-19T00:00Z"` 等 | `true` で現在日時（UTC、**秒は 00 に丸め**） | `"YYYY-MM-DDTHH:MM:00Z"` |
| TIME | `"HH:mm"` | `true` で現在時刻（ローカル時刻） | `"HH:MM"` |
| USER_SELECT / ORGANIZATION_SELECT / GROUP_SELECT | `[{code, type}]` | — | そのまま（`LOGINUSER()` 等の関数はエミュレーターでは評価しない） |
| FILE | 設定不可 | — | — |

### required との関係

- `required: true` + `defaultValue` がある場合、未送信でも defaultValue で補完されて 200 になる
- `{value:""}` を明示的に送ると補完されず、required エラーで 400

### 生レスポンス

```
# POST /k/v1/record.json  body={app:<APP_ID>, record:{}}  (全未送信)
-> 200 {"id":"92","revision":"1"}
# そのレコードを GET すると defaultValue/defaultNowValue がすべて補完されている:
GET /k/v1/record.json?app=<APP_ID>&id=92
-> {
  "record": {
    "txt_def":      {"type":"SINGLE_LINE_TEXT", "value":"デフォルト"},
    "num_def":      {"type":"NUMBER",           "value":"42"},
    "radio_def":    {"type":"RADIO_BUTTON",     "value":"B"},
    "check_def":    {"type":"CHECK_BOX",        "value":["A","B"]},
    "multi_def":    {"type":"MULTI_SELECT",     "value":["Q"]},
    "date_def":     {"type":"DATE",             "value":"2020-01-15"},
    "date_now":     {"type":"DATE",             "value":"2026-04-23"},
    "dt_now":       {"type":"DATETIME",         "value":"2026-04-23T06:31:00Z"},
    "time_now":     {"type":"TIME",             "value":"15:31"},
    "req_with_def": {"type":"SINGLE_LINE_TEXT", "value":"required_default"},
    ...
  }
}

# POST body={record:{req_with_def:{value:""}}}  (required + default、明示的 "")
-> 400
{
  "code":"CB_VA01",
  "id":"g5mrVO4JhfIkoO2Cl8wV",
  "message":"入力内容が正しくありません。",
  "errors":{ "record.req_with_def.value": {"messages":["必須です。"]} }
}
```

---

## 8. 一括 API（`records.json` POST / PUT）

### POST（addRecords）

- 正常: `{"ids":["1","2","3"],"revisions":["1","1","1"]}` / 200
- 空配列: `{"ids":[],"revisions":[]}` / 200
- 上限: 101 件以上は `errors.records = [<上限メッセージ>]` / `CB_VA01` / 400
- validation 失敗時のキー: `records[<i>].<code>.<suffix>`（単体版 `record.<code>.<suffix>` に index プレフィックス）
- トランザクション: 1件でも失敗したら**全件ロールバック**

```
POST /k/v1/records.json  body={app:<APP_ID>, records:[{num:{value:"5"}}]}  (title 欠落)
-> 400
{
  "code":"CB_VA01",
  "id":"ZiRCEubp03HnYGzSNbZy",
  "message":"入力内容が正しくありません。",
  "errors": {
    "records[0].title.value": {"messages":["必須です。"]}
  }
}

POST ... 101 records (ja)
-> 400
"errors":{ "records":{"messages":["一度に100件までのレコードを追加できます。"]} }

POST ... 101 records (en)
-> 400
"errors":{ "records":{"messages":["A maximum of 100 records can be added at one time."]} }
```

### PUT（updateRecords）

- 正常: `{"records":[{"id":"1","revision":"2"}, ...]}` / 200
- 空配列: `{"records":[]}` / 200
- 上限: 101 件以上で `errors.records = [<更新用メッセージ>]`
  - ja: `"一度に100件までのレコードを更新できます。"`
  - en: `"A maximum of 100 records can be updated at one time."`
- 存在しない id: 404 `GAIA_RE01`（index は付かない）
- validation 失敗時のキー: `records[<i>].<code>.<suffix>`
- `updateKey: {field, value}` でも指定可
- トランザクション: 1件でも失敗したら全件ロールバック

```
PUT /k/v1/records.json  body={app:<APP_ID>, records:[{id:1,record:{...ok...}}, {id:99999,...}]}
-> 404
{"code":"GAIA_RE01","id":"e4NVJfMQg1lDbh5pQ4R4","message":"指定したレコード（id: 99999）が見つかりません。"}

PUT ... validation NG at index 1
-> 400
"errors":{ "records[1].title.value": {"messages":["21文字より短くなければなりません。"]} }
```

---

## 9. SUBTABLE

### 送信/格納形式

- 入力: `items: { value: [{ value: { <innerCode>: { value: ... } } }, ...] }`
- 保存/返却: 各行に自動採番された `id: "368"` が付く。行内の各フィールドに `type` も付く

```
POST /k/v1/record.json  body={app:<APP_ID>, record:{items:{value:[
  {value:{name:{value:"apple"},qty:{value:"3"}}},
  {value:{name:{value:"kiwi"},qty:{value:"5"}}}
]}}}
-> 200 {"id":"1","revision":"1"}

GET /k/v1/record.json?app=<APP_ID>&id=1
-> {
  "record": {
    "items": {
      "type": "SUBTABLE",
      "value": [
        {
          "id": "368",
          "value": {
            "name": {"type":"SINGLE_LINE_TEXT","value":"apple"},
            "qty":  {"type":"NUMBER","value":"3"},
            "kind": {"type":"RADIO_BUTTON","value":"A"},        // defaultValue が補完
            "note": {"type":"SINGLE_LINE_TEXT","value":"default_note"}  // 同上
          }
        },
        { "id":"369", "value": {...} }
      ]
    }
  }
}
```

### バリデーションの errors キー形式

共通パターン: `record.<subCode>.value[<rowIndex>].value.<innerCode>.<suffix>`

| ケース | キー例 |
|---|---|
| required 欠落 | `record.items.value[0].value.name.value` |
| maxLength 超過 | `record.items.value[1].value.name.value` |
| NUMBER maxValue 超過 | `record.items.value[0].value.qty.value` |
| RADIO_BUTTON options 違反 | `record.items.value[0].value.kind.value` |
| CHECK_BOX options 違反 | `record.items.value[0].value.cbx.values[1].value` |

```
# required 欠落 (ja)
POST /k/v1/record.json  body={app:<APP_ID>, record:{items:{value:[{value:{qty:{value:"1"}}}]}}}
-> 400
{
  "code":"CB_VA01",
  "id":"I5KUZxwtyWjRdEAG1ZYT",
  "message":"入力内容が正しくありません。",
  "errors":{
    "record.items.value[0].value.name.value":{"messages":["必須です。"]}
  }
}

# CHECK_BOX options 違反
-> "errors":{
  "record.items.value[0].value.cbx.values[1].value":{"messages":["\"Z\"は選択肢にありません。"]}
}
```

### defaultValue の補完

- 行が送られた場合、その行内の**未送信フィールド**を defaultValue で補完
- 空配列 `items:{value:[]}` や items 未送信は補完対象にならない
- 送信された行の明示的な値は上書きしない

### PUT での行追加 / 更新 / 削除（重要）

[公式ドキュメント](https://cybozu.dev/ja/kintone/docs/rest-api/records/update-record/) と実機検証（app=<APP_ID>）で確認した挙動:

| 操作 | ドキュメント | 実機挙動 |
|---|---|---|
| SUBTABLE キー自体を送らない | テーブルのデータは保持 | 既存の全行そのまま残る |
| `items.value = []`（空配列） | 記載なし | **全行削除** |
| 行 `id` 指定あり、既存行と一致 | 「指定された id の行を更新」 | 既存行の内部 value と送信 value を**マージ**（送らない内部フィールドは保持） |
| 行 `id` 指定あり、既存に無い id | 記載なし | **新規行扱いで新しい id を採番**（送った id は捨てられる） |
| 行 `id` 指定なし | 「id を指定せずに行の値を変更すると、id が変わります」 | 新規行扱いで新しい id |
| リクエストに含まれない既存行 | 「リクエストに指定しない行は、削除されます」 | **削除** |

つまり **PUT の SUBTABLE は「value 配列全体で置き換え。ただし id 一致行は内部マージ」** と覚える。部分更新したければ既存全行を取得→必要な行を残して送る。

### 実機検証結果（抜粋）

```
# 初期状態: items に id=381,382,383 の 3 行、各行 qty に値あり
PUT /k/v1/record.json  body={app:<APP_ID>, id:8, record:{items:{value:[
  {id:"381", value:{qty:{value:"99"}}},
  {value:{name:{value:"new1"}}},
  {value:{name:{value:"new2"},qty:{value:"1"}}}
]}}}
# GET した結果:
#   id=381 name=row1 qty=99    ← 既存値 name 保持、qty のみ更新
#   id=384 name=new1 qty=      ← 新規採番、new1
#   id=385 name=new2 qty=1     ← 新規採番
# → 既存 382, 383 は消えた。381 の name はそのまま（送らなかったので保持）

# items キーを送らず top_title だけ更新 → items 3 行そのまま

# items.value = [] → 全行削除

# 存在しない id="9999999" を指定 → 新しい id（386）が振られて新規行として追加
```

### NUMBER 値の正規化と非数値の扱い（top-level / SUBTABLE の違い）

実機検証（app=<APP_ID>）で判明した挙動:

**保存時、数値として解釈可能な文字列は `Number()` でパースされて正規化された文字列で保存される**（top-level / SUBTABLE 共通）:

| 送信値 | 保存値 |
|---|---|
| `"1.5e1"` | `"15"` |
| `" 42 "` | `"42"`（前後空白は無視） |
| `"3"` | `"3"` |

**非数値を送ったときの挙動が top-level と SUBTABLE で異なる**:

| 送信値 | top-level NUMBER | SUBTABLE 内 NUMBER |
|---|---|---|
| `"abc"` | 400 `record[<code>].value: ["数字でなければなりません。"]` | エラーなし、`""` が保存 |
| `"12abc"` | 同上 400 | 同上、`""` 保存 |
| `"1,000"`（カンマ区切り） | 同上 400 | 同上、`""` 保存 |
| `""` / `null` | 空のまま（required なら必須エラー） | `""` 保存 |

つまり **SUBTABLE 内では非数値は黙って空文字列に置き換えられる**。top-level は `CB_VA01 / 数字でなければなりません。` で弾かれる。

```
# top-level
POST ... record={top_num:{value:"abc"}}
-> 400 errors["record[top_num].value"]={messages:["数字でなければなりません。"]}

# SUBTABLE 内
POST ... record={items:{value:[{value:{qty:{value:"abc"}}}]}}
-> 200 (保存成功)
GET で qty を見ると value: ""
```

### その他

- NUMBER の正規化は `validate.ts` の `normalizeNumbers` で top-level / SUBTABLE 両方に実装済み（POST / PUT / 一括 API 全てで保存前に適用）
  - 解釈可能な値: `String(Number(value))` に置換（`"1.5e1"` → `"15"`, `" 42 "` → `"42"`）
  - 解釈不能な値: top-level は `validateRanges` で 400 にする、SUBTABLE 内は `""` に置換（実機準拠）
- SUBTABLE 自身に required / maxLength / defaultValue / unique 等は設定不可
- SUBTABLE 内フィールドに `unique` は設定不可

---

## 10. ルックアップ（LOOKUP）

スカラー系フィールド（`SINGLE_LINE_TEXT` / `NUMBER` / `LINK`）に `lookup` オブジェクトを付けることで、別アプリのフィールドを参照してキー一致するレコードから `fieldMappings` に従って値を自動コピーする機能。

### フィールド定義の保存形式

```json
"prod_code": {
  "type": "SINGLE_LINE_TEXT",
  "code": "prod_code",
  "label": "商品コード",
  "required": false,
  "lookup": {
    "relatedApp": { "app": "<APP_ID>", "code": "" },
    "relatedKeyField": "code",
    "fieldMappings": [
      { "field": "prod_name",  "relatedField": "name" },
      { "field": "prod_price", "relatedField": "price" }
    ],
    "lookupPickerFields": ["code", "name"],
    "filterCond": "",
    "sort": "レコード番号 desc"
  }
}
```

### 書き込み時の挙動（POST / PUT）

| ケース | 結果 |
|---|---|
| ルックアップキー一致 | コピー先 `fieldMappings[].field` が **サーバーで自動的に埋まる** |
| コピー先フィールドに直接値を送信 | **無視される**（ルックアップキーの値で上書き、キー未送信ならコピー先は空で保存） |
| キー不一致 | 400 `GAIA_LO04`（`errors` オブジェクト**無し**） |
| キー空文字 / 未送信（POST） | 200、コピー先も空 |
| PUT でキー変更 | **再コピー**（新キー先の値に置き換わる） |
| PUT でキーを空文字に更新 | **コピー先もクリア** |
| PUT でキー未送信 + 他フィールド更新 | コピー先は既存値のまま保持 |
| マスター側レコードの値変更 | **ルックアップ側には伝播しない**（コピー時点のスナップショット） |
| ルックアップフィールドが required + 欠落 | 通常の `CB_VA01 / 必須です。`（`record.<code>.value`） |
| 一括 API（records.json POST/PUT）で 1 件以上不一致 | **最初の 1 件目だけ** `GAIA_LO04` で返る（他行の情報は含まれず、index 情報もなし）。全件ロールバック想定 |

### エラーレスポンス

HTTP 400、`code: "GAIA_LO04"`、`errors` 無し。

| locale | message |
|---|---|
| ja | `フィールド「<fieldCode>」の値「<value>」が、ルックアップの参照先のフィールドにないか、またはアプリやフィールドの閲覧権限がありません。` |
| en | `A value <value> in the field <fieldCode> does not exist in the datasource app for lookup, or you do not have permission to view the app or the field.` |

```
POST /k/v1/record.json  body={app:<APP_ID>, record:{prod_code:{value:"P999"}}}  (ja)
-> 400
{
  "code": "GAIA_LO04",
  "id": "J4EyKZSSnVg5OYwfjhIc",
  "message": "フィールド「prod_code」の値「P999」が、ルックアップの参照先のフィールドにないか、またはアプリやフィールドの閲覧権限がありません。"
}
```

### フィールド定義時の制約（保存時バリデーション）

| 制約違反 | エラー |
|---|---|
| `relatedKeyField` に `$id` を指定 | `CB_VA01`、`errors["properties[<code>].lookup.relatedKeyField"]: "先頭に数字が使用されているか、使用できない記号、またはスペースが含まれているため保存できません..."`。代わりに日本語ラベル `"レコード番号"` は OK |
| 同じ `fieldMappings[].field` を複数の lookup で共有 | `CB_VA01`、`"コピー先のフィールドの設定が重複しています..."` |
| 型違い fieldMapping（例: NUMBER → SINGLE_LINE_TEXT） | `CB_VA01`、`"指定したフィールドの組み合わせが正しくない、または指定できない種類のフィールドを指定しています。"` |
| `filterCond` に不正な演算子 | `GAIA_IQ03` 等（本エミュレーターはスコープ外） |

→ **型違い fieldMapping はそもそもフィールド保存時に拒否される**ので、ランタイムで型変換を考える必要はない。

### レコード取得時（GET）

lookup フィールドは通常のスカラーとして返る。lookup 情報は `record.json` のレスポンスには含まれない:

```json
"prod_code": { "type": "SINGLE_LINE_TEXT", "value": "P001" }
```

lookup 定義を取り出したい場合は `/k/v1/app/form/fields.json` を使う。

### 未確認 / スコープ外

- `filterCond` の実際の絞り込み挙動（本エミュレーターの Phase 1 ではスコープ外）
- `lookupPickerFields`（UI のみ、API 挙動に影響なし）
- `relatedApp.code` でアプリ指定するケース
- SUBTABLE 内のルックアップ（kintone UI でも通常は設定不可）

---

## 11. その他観察

### preview/deploy のライフサイクル

- `POST /k/v1/preview/app/form/fields.json` → preview にフィールド追加（レスポンス: `{"revision":"<n>"}`）
- `POST /k/v1/preview/app/deploy.json` body `{"apps":[{"app":<APP_ID>}]}` → 本番反映キック（レスポンス: `{}` だけ返り、非同期で反映される）
- `GET /k/v1/preview/app/deploy.json?apps[0]=<APP_ID>` で状態を確認: `{"apps":[{"app":"9","status":"PROCESSING"|"SUCCESS"|"FAIL"}]}`
- 既存レコードがある状態で unique や maxLength などを後付けすると deploy が FAIL する場合がある（既存データが制約に違反するため）

### 権限不足のレスポンス

```
# 管理権限のないアプリ/操作  (ja)
POST /k/v1/preview/app/form/fields.json  body={app:<APP_ID>,...}
-> 403? 実際は 403 ではなく 4xx で:
{
  "code":"CB_NO02",
  "id":"yCqXLCSCUYD9jUxOeqL9",
  "message":"権限がありません。"
}
```

### ユーザー権限

- 2026-04-23 時点、認証ユーザー `<user@example.com>` は 複数の検証アプリ いずれもアプリ管理権限あり（確認済み）
- 以前は 一部の検証アプリ には権限がなく `CB_NO02 権限がありません。` を返したが、後に付与された
- 検証時は必要に応じて複数アプリを使い分けると、既存レコードや preview 状態が絡むデプロイ失敗を回避しやすい

### undici fetch の自動ヘッダー

- Node.js `fetch` は `accept-language: *` を自動付与する
- ヘッダー無しとして扱いたいロジックでは `"*"` もデフォルト扱いにする必要がある

---

## Appendix: 観察用コマンド例

```sh
# 認証ヘッダー
AUTH=$(echo -n '<user@example.com>:<password>' | base64 -w0)

# レコード取得
curl -s -H "X-Cybozu-Authorization: $AUTH" "https://<your-domain>.cybozu.com/k/v1/record.json?app=<APP_ID>&id=1"

# 英語版
curl -s -H "X-Cybozu-Authorization: $AUTH" -H "Accept-Language: en" "https://<your-domain>.cybozu.com/k/v1/record.json?app=<APP_ID>&id=1"

# preview でフィールド追加 → deploy → poll
curl -s -X POST -H "X-Cybozu-Authorization: $AUTH" -H "Content-Type: application/json" \
  "https://<your-domain>.cybozu.com/k/v1/preview/app/form/fields.json" -d '{"app":<APP_ID>,"properties":{...}}'
curl -s -X POST -H "X-Cybozu-Authorization: $AUTH" -H "Content-Type: application/json" \
  "https://<your-domain>.cybozu.com/k/v1/preview/app/deploy.json" -d '{"apps":[{"app":<APP_ID>}]}'
curl -s -H "X-Cybozu-Authorization: $AUTH" \
  "https://<your-domain>.cybozu.com/k/v1/preview/app/deploy.json?apps%5B0%5D=<APP_ID>"
```
