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
- 空フィールドの扱い: 演算の中では **0 として計算される**（`a + b` で両方空なら `"0"`）。ただし式がフィールドの単独参照（`a`）なら `""`（「未入力の扱い」参照）
- レコード追加時に CALC 自体の値が `record` に含まれていなくても問題ない（サーバーが自動計算する）
- **計算不能（0 除算など）の場合は `value: ""`**（kintone ヘルプに書かれている `#ERROR!` / `#VALUE!` などのマーカーは返ってこない。UI 表示のみ）
- **フォーマット不一致で結果が破棄された場合も `value: ""`**（CALC の format=NUMBER に文字列結果を返した場合など）
- addRecord 時点で**どのフィールドも書き込まれなかった**レコードでは、CALC フィールド自体が応答に含まれないことがある（フィールドレコードが生成されていない）

---

## 3. 算術演算

### 除算の精度

**商はアプリの数値精度の小数部の桁数で丸められる**（displayScale の設定に関係なく）。既定の精度（小数 4 桁）では小数第 4 位になる。丸めは除算に限らない（「数値精度による丸めと桁数」参照）。

| 式 | 結果 |
|---|---|
| `1 / 3` | `"0.3333"` |
| `10 / 3` | `"3.3333"` |
| `1 / 7` | `"0.1429"` |
| `2 / 6` | `"0.3333"` |

`displayScale` を `0` / `4` / `10` にしても API 応答は全て `"0.3333"`（displayScale は UI 表示桁のみ）。数値精度を小数 10 桁にすると `"0.3333333333"` になる。

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

### 未入力の扱い（観察日: 2026-09-26）

未入力は 0 とは別の値（以下「未入力」）として扱われ、使われる場所によって結果が変わる。

| 使われ方 | 結果 | 例（`n` が未入力） |
|---|---|---|
| 式がフィールドの単独参照 | `""` | `n` → `""`、`(n)` → `""`、DATE の `d` → `""` |
| CALC から未入力の CALC を単独参照 | `""` | `c`（`c` の値が `""`）→ `""` |
| `IF` の分岐先 | 未入力のまま | `IF(1 > 0, n, 2)` → `""` |
| 算術・比較 | 0 として扱う | `-n` → `0`、`n + 1` → `1`、`n = 0` → `1`、`d + 86400` → `86400` |
| `SUM` / `ROUND` の引数 | 0 として扱う | `SUM(n)` → `0`、`ROUND(n, 0)` → `0` |
| `&` での連結（文字列の自動計算） | `""` として連結 | `n & "x"` → `"x"`、`n & ""` → `""` |

```
a: {}           →  a + b = 0
a: { value: "" } →  a + b = 0
a: "5"          →  a + b = 5
b: "3"          →  a + b = 3
a: "-5", b: "3" →  a + b = -2
```

### 数値精度による丸めと桁数（観察日: 2026-09-26）

計算はアプリ設定の数値精度（`numberPrecision`。既定は 16 桁 / 小数 4 桁 / HALF_EVEN）に従う。

- **数値リテラルと、演算・関数の途中結果を 1 つずつ丸める**（最後に 1 回ではない）。丸めかたは `roundingMode`
  - 既定の精度: `1 / 3 * 3` → `0.9999`、`2 / 3 * 3` → `2.0001`、`0.00015 * 10000` → `2`（リテラルの `0.00015` がまず `0.0002` になる）、`0.00015 + 0.00015` → `0.0004`
  - 5 桁 / 小数 2 桁 / UP: `1 / 3` → `0.34`、`1 / 3 * 3` → `1.02`、`-0.00001` → `-0.01`
  - 30 桁 / 小数 10 桁: `1 / 3` → `0.3333333333`、`0.00015 * 10000` → `1.5`
- **途中の値でも、丸めた後の整数部が `digits - decimalPlaces` 桁を超えると結果は `""`**
  - 既定の精度: `999999999999 + 1` → `""`、`n * 10 / 10`（n = 999999999999）→ `""`
  - 5 桁 / 小数 2 桁: リテラルの `10000` や `99999` だけで超えるので、`0.01 * 10000` → `""`
- べき乗 `^` は結果だけを丸める（5 桁 / 小数 2 桁でも `2 ^ -20` → `0.01`。途中の `2 ^ 20` は桁数を超えるのにエラーにならない）
- 倍精度浮動小数点の誤差は出ない（`0.1 + 0.2` → `0.3`、`999999999999.9999 + 0` はそのまま）
- 計算式に `1e3` のような指数表記のリテラルは書けない（deploy 時に GAIA_IL01「計算式の文法が正しくありません。」）

### 値の型（観察日: 2026-09-26）

値には数値・文字列・真偽値・未入力の区別がある。

- **`IF` の条件と `AND` / `OR` / `NOT` の引数は真偽値でなければならない**。数値を渡すと結果は `""`（`IF(1, 1, 2)` / `IF(n, 1, 2)` / `AND(1, 1)` / `NOT(1)` / `AND(1 > 0, 1)`）
- 真偽値を算術に使うと `""`（`(1 > 0) + 1` / `SUM(1 > 0, 1)`）
- 真偽値は CALC の結果としては `"1"` / `"0"`、`&` での連結では `"true"` / `"false"`（`(1 > 0) & "x"` → `"truex"`）

---

## 4. 関数

### `SUM(...)`
- 可変長引数の合計
- SUBTABLE 内の NUMBER フィールドコードを渡すとテーブル全行の合計になる。空セルは 0 扱い
- 観察: SUBTABLE に `qty: [10, 20, ""]` → `SUM(qty) = "30"`
- **テーブルに行が 1 つも無いと `SUM(qty)` はエラーになり、結果は `""`**。未入力（0 扱い）とは違い、`SUM(qty) + 1` も `IF(1 > 0, SUM(qty), 0)` も `""`。空の行が 1 つでもあれば `0`

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

- `ROUND` は **0 から遠い方への四捨五入**（`ROUND(-2.5, 0)` → `-3`、`ROUND(-0.5, 0)` → `-1`、`ROUND(1.25, 1)` → `1.3`）。アプリの `roundingMode`（既定は HALF_EVEN）とは関係ない
- `ROUNDUP` は 0 から遠い方へ、`ROUNDDOWN` は 0 に近い方へ（`ROUNDUP(-1.21, 1)` → `-1.3`、`ROUNDDOWN(-1.29, 1)` → `-1.2`）

### `YEN(x, n)` / `DATE_FORMAT(value, format, timezone)`
- どちらも文字列結果のため CALC format には適合せず `""` になる
- 用途は SINGLE_LINE_TEXT の `expression` 側
- `DATE_FORMAT` の第 1 引数は UNIX timestamp（秒）でも DATETIME フィールド参照でも可
- `timezone` は `"Asia/Tokyo"` / `"UTC"` / `"system"` 等を受け付ける

### `CONTAINS(field, value)`

第 1 引数のフィールド型ごとに動作する条件:

| 第 1 引数の型 | 挙動 |
|---|---|
| CHECK_BOX / MULTI_SELECT（top-level） | 配列に value が含まれれば `1`、なければ `0` |
| SUBTABLE 内 SINGLE_LINE_TEXT / DROP_DOWN / RADIO_BUTTON | いずれかの行の値と一致すれば `1`、なければ `0` |
| top-level の DROP_DOWN / RADIO_BUTTON / SINGLE_LINE_TEXT 等 | 型不適合で実行時 `""`（実機も同じ） |
| SUBTABLE 内 NUMBER / CHECK_BOX | **deploy 時に GAIA_IL01**（`配列型の値に対して適切な関数が利用されていません。`） |

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

## 8. エミュレーター実装状況

`packages/core/src/calc/` 配下に lexer / parser / validator / evaluator / compute を実装済み。
`record.ts` / `records.ts` / `setup-app.ts` の write パスで `computeCalcFields` が走り、
addFormFields / setup/app.json では `validateFieldsForInsert` が deploy 時相当の検証を行う。

### 実装済み機能

| カテゴリ | 内容 |
|---|---|
| 演算子 | `+ - * / ^ &` / `= != <> < <= > >=` / 単項 `+ -` |
| 関数 | `SUM` / `IF` / `AND` / `OR` / `NOT` / `ROUND` / `ROUNDUP` / `ROUNDDOWN` / `YEN` / `DATE_FORMAT` / `CONTAINS` |
| フィールド参照 | NUMBER / CALC / DATE / DATETIME / TIME / CREATED_TIME / UPDATED_TIME / SINGLE_LINE_TEXT / DROP_DOWN / RADIO_BUTTON / CHECK_BOX / MULTI_SELECT |
| SUBTABLE | 内部 NUMBER を `SUM(qty)` で展開、内部 SLT / DROP_DOWN / RADIO_BUTTON を `CONTAINS(name, "x")` で検索 |
| format 出力 | NUMBER / NUMBER_DIGIT / DATETIME / DATE / TIME / HOUR_MINUTE / DAY_HOUR_MINUTE |
| autoCalc | CALC + SINGLE_LINE_TEXT の `expression`（top-level / SUBTABLE 内ともに対応） |
| SUBTABLE 内 autoCalc | 行ごとに「top-level + 同じ行の inner」をスコープに評価。CONTAINS の同じ行 CHECK_BOX / MULTI_SELECT 参照を含む |
| deploy 時検証 | 構文 / 未定義フィールド / 未知関数 / 引数数 / 全角記号 / 循環参照 / 参照不可タイプ |
| 評価時の挙動 | 数値は 10 進数で計算し、リテラルと途中の値をアプリの数値精度で丸めて桁数超過を "" にする。未入力は単独参照なら ""・演算では 0。IF / AND / OR / NOT は真偽値のみ受け付ける。0 除算は ""、文字列結果が CALC 数値 format に流れたら ""、CREATED_TIME / UPDATED_TIME は書き込み時の "now" を使用 |

### 未対応機能

実機で正常に動く挙動のうち、以下はエミュレーターで再現していない:

| 項目 | 影響 | 備考 |
|---|---|---|
| LOOKUP key=LINK 制約の deploy 時検出 | 実機は GAIA_IL01 で deploy 拒否、当エミュレーターは通す | 影響軽微 |
| 演算子・関数の **型不一致 deploy 時検出** | 実機は GAIA_IL01 で「演算子「X」とデータ型の組み合わせが正しくありません。」等を返す。当エミュレーターは deploy 通過、実行時に `""` で代用 | 影響軽微 |
| 「配列型関数エラー」の deploy 時検出 | 同上 | 影響軽微 |
| LOOKUP フィールドの計算参照 | 値が NUMBER/SLT としてコピーされる前提で動くはずだが未検証 | 実用上はおおむね動く想定 |
| CREATOR / MODIFIER の参照 | 実機では参照可だが値がオブジェクト `{code, name}` のため当エミュレーターでは 0 扱い | 影響軽微 |
| `displayScale` / `unit` / `unitPosition` / `NUMBER_DIGIT` のカンマ区切り | API 応答には影響しない（実機も UI 専用）— 互換性問題なし | — |
| `DAY_HOUR_MINUTE` の "X 日 Y 時間 Z 分" 表記 | 同上、API では HOUR_MINUTE と同じ "HH:MM" | — |
| 指数表記のリテラル（`1e3`）の deploy 時拒否 | 実機は GAIA_IL01（文法エラー）、当エミュレーターは通す | 影響軽微 |
| `CONTAINS` を算術に使ったとき | 当エミュレーターは真偽値として扱い `""` にする（`IF` の条件に書けるようにするため）。実機で確かめていない | — |
| SUBTABLE 内の式から top-level の CALC を参照 | 当エミュレーターは SUBTABLE 内を先に計算する（top-level の `SUM(inner_calc)` のため）ので、同じ保存で計算し直す前の値（新規なら未入力）を見る。format が DATETIME などの CALC は保存値の文字列を数値に戻せず未入力になる。実機の挙動は確かめていない | 影響軽微 |
| 小さい数値精度での日付値 | DATE / DATETIME の UNIX 秒（10 桁）も桁数検査の対象にしている。整数部 10 桁未満の精度で日付フィールドを参照したときの実機の挙動は確かめていない | — |
| 計算式の UI エラーマーカー (`#ERROR!` / `#VALUE!` 等) | API 応答には現れず実機も `""` を返す | — |

### 実装フェーズ（履歴）

- Phase 1: パーサー + 式の AST 化（deploy 時検証のみ先行実装）
- Phase 2: 算術 `+ - * / ^` と数値参照の評価
- Phase 3: `SUM` / `ROUND` 系 / `IF` / `AND` / `OR` / `NOT` / 比較 / 日付演算 / format 別出力
- Phase 4: `DATE_FORMAT` / `YEN` / `&` 連結 / SINGLE_LINE_TEXT の `expression`
- Phase 4.1: `CONTAINS`（CHECK_BOX / MULTI_SELECT のみ）/ CREATED_TIME / UPDATED_TIME 参照
