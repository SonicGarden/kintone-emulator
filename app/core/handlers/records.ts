import { all, dbSession } from "../db";
import sqlParser from 'node-sql-parser';
import { FieldTypes, getFieldTypes } from "../query";
import type { HandlerArgs } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const replaceField = (param: { expression: any, fieldTypes: FieldTypes }) => {
  const { expression, fieldTypes } = param;
  switch (expression.type) {
    case 'binary_expr':
      // 左辺と右辺を再帰的に探索
      replaceField({ expression: expression.left, fieldTypes });
      replaceField({ expression: expression.right, fieldTypes });
      break;
    case 'column_ref':
      switch (fieldTypes[expression.column]) {
        case 'CREATED_TIME':
        case 'UPDATED_TIME':
        case 'DATETIME':
          expression.column = `datetime(body->>'$.${expression.column}.value', '+9 hours')`;
          break;
        case 'DATE':
          expression.column = `date(body->>'$.${expression.column}.value', '+9 hours')`;
          break;
        default:
          expression.column = `body->>'$.${expression.column}.value'`;
          break;
      }
      break;
    case 'var':
      if (expression.name === 'id' && expression.prefix === '$') {
        delete expression.prefix;
        delete expression.name;
        delete expression.members;
        expression.type = 'column_ref';
        expression.column = 'id';
        expression.table = null;
      }
      break;
    case 'function':
      switch (expression.name.name[0].value) {
        case 'NOW':
          expression.name.name[0].value = 'datetime';
          expression.args.value = [{ type: 'single_quote_string', value: 'now' }, { type: 'single_quote_string', value: '+9 hours' }];
          break;
      }
  }
}

const generateRecords = ({ recordResult, fieldTypes, fields }: { recordResult: { id: number, body: string, revision: number }[], fieldTypes: FieldTypes, fields: string[] }) => {
  return recordResult.map((record) => {
    const body = JSON.parse(record.body);
    for (const key in body) {
      body[key].type = fieldTypes[key];
    }
    if (fields.length > 0) {
      for (const key in body) {
        if (!fields.includes(key)) {
          delete body[key];
        }
      }
    }
    body['$revision'] = { value: record.revision.toString(), type: '__REVISION__' };
    body['$id'] = { value: record.id.toString(), type: 'RECORD_NUMBER' };
    return body;
  });
}

const hasWhereClause = (query: string) => {
  return !query.trim().toLowerCase().startsWith('order')
    && !query.trim().toLowerCase().startsWith('limit')
    && !query.trim().toLowerCase().startsWith('offset')
}

export const get = async ({
  request,
  params,
}: HandlerArgs) => {
  try {
    const db = dbSession(params.session);
    const url = new URL(request.url);
    const app = url.searchParams.get('app');
    const query = url.searchParams.get('query');
    const fields: string[] = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (key.startsWith('fields')) {
        fields.push(value);
      }
    }
    const fieldTypes = await getFieldTypes(db, app!);
    if (query === null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recordResult = await all<{ body: any, id: number, revision: number }>(db, `SELECT id, revision, body FROM records WHERE app_id = ?`, app);
      return Response.json({ totalCount: recordResult.length.toString(), records: generateRecords({ recordResult, fieldTypes, fields }) });

    }
    const parser = new sqlParser.Parser();
    const prefixSql = `select 1 from records ${hasWhereClause(query) ? 'where ' : ''}`;
    const ast = parser.astify(prefixSql + query!);

    if ('where' in ast && ast.where !== null) {
      replaceField({ expression: ast.where, fieldTypes });
    }
    if ('orderby' in ast && ast.orderby !== null) {
      for (const order of ast.orderby) {
        replaceField({ expression: order.expr, fieldTypes });
      }
    }
    const newQuery = parser.sqlify(ast, { database: 'sqlite' });
    const afterQuery = newQuery.replaceAll('"', '').replace(/SELECT 1 FROM records (WHERE)?/g, '');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recordResult = await all<{ body: any, id: number, revision: number }>(db, `SELECT id, revision, body FROM records WHERE app_id = ? ${hasWhereClause(query) ? 'and' : ''} ${afterQuery}`, app);
      return Response.json({
        totalCount: recordResult.length.toString(),
        records: generateRecords({ recordResult, fieldTypes, fields }),
      });
    } catch (e) {
      return Response.json(
        {
          id: '1505999166-897850006',
          code: 'CB_VA01',
          message: 'query: クエリ記法が間違っています。'

        }, { status: 400 });
    }
  } catch (e) {
    return Response.json({
      code: 'error',
      message: String(e)
    }, { status: 500 });
  }
}
