import snowflake from 'snowflake-sdk';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
export type Row = Record<string, unknown>;
export interface SqlExecutor { execute(sql: string, binds?: (string | number)[]): Promise<Row[]> }
export function field(row: Row, name: string): unknown { return row[name] ?? row[name.toUpperCase()]; }
export function identifier(value: string, parts = 1): string {
  const segments = value.split('.');
  if (segments.length !== parts || segments.some(part => part.length > 255 || !/^[A-Z][A-Z0-9_]*$/i.test(part))) throw new Error('Invalid configured Snowflake object identifier.');
  return segments.map(part => `"${part.toUpperCase()}"`).join('.');
}
export function literal(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}
type ConnectionOptions = { account: string; username: string; password?: string; authenticator?: string; role: string; warehouse: string };
// Reads one named snow CLI connection; role and warehouse always come from the caller, never the file.
export async function connectionFromToml(name: string, role: string, warehouse: string, path = join(homedir(), '.snowflake', 'connections.toml')): Promise<ConnectionOptions> {
  const entry = (parse(await readFile(path, 'utf8')) as Record<string, Record<string, unknown> | undefined>)[name];
  const text = (key: string) => typeof entry?.[key] === 'string' ? entry[key] as string : undefined;
  const account = text('account'), username = text('user') ?? text('username');
  if (!account || !username) throw new Error('Snowflake connection is not configured.');
  return { account, username, password: text('password'), authenticator: text('authenticator')?.toUpperCase(), role, warehouse };
}
// Keeps idle sessions alive; terminated-connection errors are raised before the statement is sent, so one retry is safe.
const keepAlive = { clientSessionKeepAlive: true, clientSessionKeepAliveHeartbeatFrequency: 900 };
const isTerminated = (error: Error) => /terminated connection|session (no longer exists|expired)|authentication token has expired/i.test(error.message);
// Lazily opens a single shared connection and reopens it if it dies. Real errors are logged server-side only.
export function createTomlExecutor(load: () => Promise<ConnectionOptions>): SqlExecutor {
  let ready: Promise<snowflake.Connection> | undefined;
  const connect = () => ready ??= load().then(options => new Promise<snowflake.Connection>((resolve, reject) => {
    snowflake.createConnection({ ...options, ...keepAlive }).connect((error, connection) => {
      if (error) { ready = undefined; console.error('[snowflake] connect failed:', error.message); reject(new Error('Provider connection failed.')); } else resolve(connection);
    });
  }));
  const run = (connection: snowflake.Connection, sql: string, binds?: (string | number)[]) => new Promise<Row[]>((resolve, reject) => connection.execute({ sqlText: sql, binds, complete: (error, _statement, rows) => error ? reject(error) : resolve((rows ?? []) as Row[]) }));
  return {
    async execute(sql, binds) {
      let connection = await connect();
      if (!connection.isUp()) { ready = undefined; connection = await connect(); }
      try { return await run(connection, sql, binds); }
      catch (error) {
        if (isTerminated(error as Error)) {
          console.warn('[snowflake] connection terminated, reconnecting');
          ready = undefined;
          try { return await run(await connect(), sql, binds); } catch (retry) { error = retry; }
        }
        console.error('[snowflake] query failed:', (error as Error).message, '| SQL:', sql.slice(0, 200));
        throw new Error('Snowflake operation failed. Review provider-side query history.');
      }
    }
  };
}
// This factory is intentionally not wired to the demo HTTP server.
export async function createSnowflakeExecutor(): Promise<SqlExecutor & { close(): Promise<void> }> {
  const { SNOWFLAKE_ACCOUNT: account, SNOWFLAKE_USER: username, SNOWFLAKE_ROLE: role, SNOWFLAKE_WAREHOUSE: warehouse, SNOWFLAKE_PRIVATE_KEY_PATH: keyPath } = process.env;
  if (!account || !username || !role || !keyPath) throw new Error('Provider key-pair connection is not configured.');
  const privateKey = await readFile(keyPath, 'utf8');
  const connection = snowflake.createConnection({ account, username, role, warehouse, authenticator: 'SNOWFLAKE_JWT', privateKey, ...keepAlive });
  await new Promise<void>((resolve, reject) => connection.connect(error => error ? reject(new Error('Provider connection failed.')) : resolve()));
  return {
    execute(sql, binds) { return new Promise((resolve, reject) => { connection.execute({ sqlText: sql, binds, complete: (error, _statement, rows) => error ? reject(new Error('Snowflake operation failed. Review provider-side query history.')) : resolve((rows ?? []) as Row[]) }); }); },
    close() { return new Promise((resolve, reject) => connection.destroy(error => error ? reject(new Error('Provider disconnect failed.')) : resolve())); }
  };
}