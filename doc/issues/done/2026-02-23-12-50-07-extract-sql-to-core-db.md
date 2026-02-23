app/core/handlers/ ではSQLを直接実行しないようにしてください。
app/core/db/ というディレクトリ以下にSQLを実行するコードを配置してください。
app/core/db.ts app/core/fields.ts app/core/query.ts のコードや app/core/handlers/ を整理して、わかりやすくファイルを分割して app/core/db/ に配置してください。
