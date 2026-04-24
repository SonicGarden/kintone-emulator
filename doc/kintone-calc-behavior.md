# 計算フィールド (CALC) 実機挙動メモ

kintone の計算フィールドをエミュレーターで再現するための調査メモ。実機（`p1juao4p1gob.cybozu.com` アプリ ID=12）に対して実際に deploy / addRecord / getRecord を行い、観察された挙動をまとめる。観察日: 2026-04-25 JST。

ヘルプドキュメントに載っていない挙動や、ドキュメントの記述と実機の実挙動に差がある箇所が複数存在する。

- ヘルプ (jp): <https://jp.kintone.help/k/ja/app/form/form_parts/calculated.html>
- 演算子と関数の一覧 (us): <https://us.kintone.help/k/en/app/form/autocalc/basic_error/autocalc_format.html>
- 計算式で表示されるエラー: <https://jp.kintone.help/k/ja/app/form/autocalc/basic_error/autocalc_error.html>
- 参照できるフィールド: <https://us.kintone.help/k/en/app/form/autocalc/ref_data/autocalc_field.html>
- データ型の扱い: <https://us.kintone.help/k/en/app/form/autocalc/ref_data/calculation_type.html>

---

## 1. フィールド定義

### `getFormFields` 応答の CALC フィールド例

```json
{
  "type": "CALC",
  "code": "calc_num",
  "label": "n",
  "noLabel": false,
  "required": false,
  "expression": "a * 2",
  "format": "NUMBER_DIGIT",
  "displayScale": "2",
  "hideExpression": true,
  "unit": "円",
  "unitPosition": "BEFORE"
}
```

- `expression`: 計算式文字列
- `format`: 表示形式。許容される enum は以下の **7 種類のみ**（他は `addFormFields` が `[400] [CB_VA01]` で弾く）
  - `NUMBER`
  - `NUMBER_DIGIT`
  - `DATETIME`
  - `DATE`
  - `TIME`
  - `HOUR_MINUTE`
  - `DAY_HOUR_MINUTE`
  - `CURRENCY` / `YEN` / `USD` / `STRING` / `SINGLE_LINE_TEXT` などは拒否される
- `displayScale`: 小数部の表示桁数（"" または整数文字列）。**API 応答の値には影響せず UI のみ**
- `unit`, `unitPosition`: 単位記号。**API 応答の値には影響せず UI のみ**
- `hideExpression`: 計算式を UI で非表示にする
- `required`: 計算フィールドにも設定可能（ただし自動計算されるため空になるケースは主にエラー時）

### `expression` プロパティは SINGLE_LINE_TEXT でも使える（文字列 autoCalc）

計算結果が文字列になるケース（`DATE_FORMAT` / `YEN` / `IF(..., "big", "small")` / `&` 結合）は **`SINGLE_LINE_TEXT` フィールドの `expression` で設定する**。CALC フィールドに文字列を返す式を書いても、format が NUMBER 系しか受け入れられないため結果は `""` になる。

```json
{
  "type": "SINGLE_LINE_TEXT",
  "code": "text_calc",
  "expression": "DATE_FORMAT(1745574000, \"YYYY-MM-dd\", \"Asia/Tokyo\") & \" \" & a",
  "hideExpression": false
}
```

応答例（a=7）:

```json
{ "type": "SINGLE_LINE_TEXT", "value": "2025-04-25 7" }
```

---

## 2. 値の返却形式（getRecord / getRecords）

```json
{ "calc_add": { "type": "CALC", "value": "13" } }
```

- `value` は常に**文字列**
- 空フィールドの扱い: 数値フィールドが欠損/空文字列でも **0 として計算される**（`a + b` で両方空なら `"0"`）
- レコード追加時に CALC 自体の値が `record` に含まれていなくても問題ない（サーバーが自動計算する）
- **計算不能（0 除算など）の場合は `value: ""`**（kintone ヘルプに書かれている `#ERROR!` / `#VALUE!` などのマーカーは返ってこない。UI 表示のみ）
- **フォーマット不一致で結果が破棄された場合も `value: ""`**（CALC の format=NUMBER に文字列結果を返した場合など）
- addRecord 時点で**どのフィールドも書き込まれなかった**レコードでは、CALC フィールド自体が応答に含まれないことがある（フィールドレコードが生成されていない）

---

## 3. 算術演算

### 除算の精度

**商は常に小数第 4 位で丸められる**（displayScale の設定に関係なく）。

| 式 | 結果 |
|---|---|
| `1 / 3` | `"0.3333"` |
| `10 / 3` | `"3.3333"` |
| `1 / 7` | `"0.1429"` |
| `2 / 6` | `"0.3333"` |

`displayScale` を `0` / `4` / `10` にしても API 応答は全て `"0.3333"`（displayScale は UI 表示桁のみ）。

### 0 除算

```
a / 0  →  value: ""
0 / 0  →  value: ""
```

deploy は成功する（実行時エラー扱い）。

### 乗算・加減算

整数同士は整数結果、小数混在は通常の浮動小数結果。

| 式 | 入力 | 結果 |
|---|---|---|
| `7 * 0.1` | - | `"0.7"` |
| `100 * 0.1` | - | `"10"` |
| `10 + 3` | - | `"13"` |
| `10 - 3` | - | `"7"` |
| `-5 + 3` | a=-5,b=3 | `"-2"` |

### べき乗 `^`

- 指数の小数部は**切り下げ**（`4 ^ 1.5 = 4` = `4^1`）
- 負指数対応（`4 ^ -2 = 0.0625`）
- 指数の範囲は -100～100（超過はエラー）

### 空フィールドは 0 扱い

```
a: {}           →  a + b = 0
a: { value: "" } →  a + b = 0
a: "5"          →  a + b = 5
b: "3"          →  a + b = 3
a: "-5", b: "3" →  a + b = -2
```

---

## 4. 関数

### `SUM(...)`
- 可変長引数の合計
- SUBTABLE 内の NUMBER フィールドコードを渡すとテーブル全行の合計になる。空セルは 0 扱い
- 観察: SUBTABLE に `qty: [10, 20, ""]` → `SUM(qty) = "30"`

### `IF(cond, then, else)`
- 分岐先の型に応じて結果型が決まる
- 数値分岐は CALC format=NUMBER で受け付けられる (`IF(a>10, a*2, a/2)` で a=15 → `"30"`)
- 文字列分岐は CALC では `""` になる（格納先を SINGLE_LINE_TEXT の expression にすれば保存される）

### `AND(...)` / `OR(...)` / `NOT(x)`
- 可変長引数（最大 32）
- **ブール結果は `"1"`（true）/ `"0"`（false）の文字列として返る**
- 比較演算子 `>` `<` `=` なども同じく `"1"` / `"0"`

### `ROUND(x, n)` / `ROUNDUP(x, n)` / `ROUNDDOWN(x, n)`

| 式 | 結果 |
|---|---|
| `ROUND(3.14159, 2)` | `"3.14"` |
| `ROUNDUP(3.14159, 2)` | `"3.15"` |
| `ROUNDDOWN(3.14159, 2)` | `"3.14"` |

`n` は小数部の桁数。

### `YEN(x, n)` / `DATE_FORMAT(value, format, timezone)`
- どちらも文字列結果のため CALC format には適合せず `""` になる
- 用途は SINGLE_LINE_TEXT の `expression` 側
- `DATE_FORMAT` の第 1 引数は UNIX timestamp（秒）でも DATETIME フィールド参照でも可
- `timezone` は `"Asia/Tokyo"` / `"UTC"` / `"system"` 等を受け付ける

### `CONTAINS(field, value)`
- 複数選択系フィールド（CHECK_BOX / MULTI_SELECT 等）に特定選択肢が含まれるか判定（未検証）

---

## 5. 日付・日時演算

DATE / DATETIME / TIME 系フィールドは **UNIX タイムスタンプ（秒）として計算式中で扱われる**。

### format が `DATETIME` の CALC

`n * 3600` の結果を format=`DATETIME` で出力すると、その数値を Unix epoch 秒として解釈した ISO 8601 UTC 文字列になる。

観察: n=90061 → `n * 3600 = 324219600` → `"1980-04-10T13:00:00Z"`

### 各 format の表示

入力 n=90061（NUMBER）で `expression: "n"` or `"n * 3600"`:

| format | 計算式 | 返却値 | 解釈 |
|---|---|---|---|
| `NUMBER` | `n * 3` | `"270183"` | 数値そのまま |
| `NUMBER_DIGIT` | `n * 3` | `"270183"` | API 応答はカンマ区切りにならない（UI のみ） |
| `DATETIME` | `n * 3600` | `"1980-04-10T13:00:00Z"` | Unix epoch 秒 → ISO 8601 UTC |
| `DATE` | `n * 3600` | `"1980-04-10"` | Unix epoch 秒 → 日付（ユーザー TZ 依存の可能性あり、未詳細検証） |
| `TIME` | `n` | `"01:01"` | 秒数 mod 86400 → `HH:mm` |
| `HOUR_MINUTE` | `n` | `"25:01"` | 秒数 → `HH:mm`（時間は 24h 超えも表示） |
| `DAY_HOUR_MINUTE` | `n` | `"25:01"` | API では HOUR_MINUTE と同じ（UI だけ「1 日 1 時間 1 分」等にする模様） |

※ `TIME` / `HOUR_MINUTE` / `DAY_HOUR_MINUTE` はいずれも「秒」部分が切り捨てられる。

### DATE + 秒 / DATETIME + 秒

| 式 | 入力 | 返却値 |
|---|---|---|
| DATE `d` + 86400 (format=DATE) | d=2026-04-25 | `"2026-04-26"` |
| DATETIME `dt` + 3600 (format=DATETIME) | dt=2026-04-25T10:00:00Z | `"2026-04-25T11:00:00Z"` |
| DATETIME - DATE | dt=2026-04-25T10:00:00Z, d=2026-04-25 | `"36000"` (秒、format 未指定=NUMBER) |

DATE フィールド `d=2026-04-25` が **UTC 00:00:00 として epoch 変換される** と仮定すると dt(=10:00Z) との差 36000 秒 (10 h) は一致する。ユーザー TZ に依存せず UTC 扱いの可能性が高いが、要追加検証。

---

## 6. 他の CALC / LOOKUP への参照

- **CALC は別の CALC を参照できる**（計算順序はサーバーが解決）
  - 観察: `calc_x = a * 2`, `calc_y = calc_x + 1`, a=10 → `calc_x = 20`, `calc_y = 21`
- **循環参照は deploy 時点で拒否**
  - `GAIA_IL01` + `フィールド「...」の計算式が正しくありません。(エラーの内容：フィールドの参照が循環しています。)`

### 参照できるフィールドタイプ（ヘルプ準拠）

| 参照可 | 参照不可 |
|---|---|
| NUMBER / CALC / DATE / TIME / DATETIME / CREATED_TIME / UPDATED_TIME / LOOKUP / SINGLE_LINE_TEXT / DROP_DOWN / RADIO_BUTTON / CHECK_BOX / MULTI_SELECT / CREATOR / MODIFIER | LABEL / MULTI_LINE_TEXT / RICH_TEXT / FILE / LINK / USER_SELECT / ORGANIZATION_SELECT / GROUP_SELECT / REFERENCE_TABLE / SPACER / HR / GROUP / RECORD_NUMBER / STATUS / STATUS_ASSIGNEE / CATEGORY |

LOOKUP は **key field が LINK（または LINK key の LOOKUP）の場合は参照不可**。

---

## 7. deploy 時のバリデーションエラー

**計算式のチェックは `deployApp` 時点で走る**（`addFormFields` は通る）。全て `[400] [GAIA_IL01]` + `フィールド「<label>」の計算式が正しくありません。(エラーの内容：<理由>)` の形式で返る。

| 原因 | エラー内容 |
|---|---|
| 存在しないフィールドコード | `計算式に含まれるフィールドコード（<code>）が存在しません。` |
| 未知の関数 | `<FN>関数は使用できません。` |
| 文法エラー | `計算式の文法が正しくありません。` |
| 循環参照 | `フィールドの参照が循環しています。` |
| 引数不足 | `<FN>関数には<n>個の引数が必要です。` / `<n>個以上の引数が必要です。` |
| 引数上限超過 | `<FN>関数に指定できる引数は<n>個までです。` |
| 全角記号混入 | `全角記号「<c>」が入力されています。半角記号「<c2>」を入力してください。` |
| 参照不可タイプ | `計算式で利用できないフィールドタイプ(...)が指定されています。` |
| 演算子型不一致 | `演算子「<op>」とデータ型の組み合わせが正しくありません。` |
| 関数型不一致 | `<FN>関数と引数のデータ型の組み合わせが正しくありません。` |
| 配列型関数エラー | `配列型の値に対して適切な関数が利用されていません。` |
| 参照不可フィールド | `参照不可フィールドエラー` |
| 誤った演算子 | `「<c>」が入力されています。「<c>」を判定/計算するには「<c>」を入力してください。` |

### format の enum バリデーション

format に `CURRENCY` / `YEN` / `USD` / `STRING` / `SINGLE_LINE_TEXT` などを指定すると、deploy 前の `addFormFields` 時点で `[400] [CB_VA01]` + `properties[<code>].format: Enum値のいずれかでなければなりません。` で弾かれる。

### レコード入力時のエラー（UI 表示）

ドキュメントでは `#CONVERT!` / `#PRECISION!` / `#VALUE!` / `#ERROR!` の 4 種類が入力時に表示されるとされるが、**REST API 応答ではこれらのマーカーは現れず `value: ""` になる**。

| UI マーカー | 意味 | API での見え方 |
|---|---|---|
| `#CONVERT!` | 結果型が変換不可 | `value: ""` |
| `#PRECISION!` | 有効桁数超過 | `value: ""` |
| `#VALUE!` | データ型・演算子不適合 | `value: ""` |
| `#ERROR!` | 計算不可（0 除算等） | `value: ""` |

---

## 8. エミュレーター実装への示唆

現在のエミュレーターは **CALC を保存値そのまま返すだけ**（`src/handlers/validate.ts` の `SKIP_TYPES` に入っており検証・自動計算ともスキップ）。完全な実機互換には以下が必要:

1. **expression パーサー**（演算子優先度 ＋ 関数 11 種）
2. **deploy 時の式検証**（未定義フィールド / 循環 / 文法エラーで `GAIA_IL01`）
3. **`addFormFields` 時の format enum 検証**（上記 7 種のみ許容で `CB_VA01`）
4. **レコード write 時（add / update）に expression を評価して値を格納**
   - または read 時に都度計算
   - 参照される他 CALC の依存順序解決
5. **フォーマッタ**（format ごとに最終値を文字列化。DATETIME は Unix 秒 → ISO UTC、TIME 系は秒 → `HH:mm` など）
6. **値の除算精度: 小数第 4 位丸め**
7. **SINGLE_LINE_TEXT の `expression` サポート**（文字列 autoCalc）
8. **エラー結果は `value: ""`**（`#ERROR!` マーカーは出さない）
9. **空フィールドは 0 扱い**で計算に参加

段階的な実装方針の例:

- Phase 1: パーサー + 式の AST 化（計算式バリデーションだけ先行実装、deploy エラーを返す）
- Phase 2: 算術 `+ - * / ^` と数値参照のみ評価
- Phase 3: `SUM` / `ROUND` 系 / `IF` / `AND` / `OR` / `NOT` / 比較 / 日付演算
- Phase 4: `DATE_FORMAT` / `YEN` / `&` など文字列系（SINGLE_LINE_TEXT expression）
- Phase 5: CALC 間依存解決、循環検出
