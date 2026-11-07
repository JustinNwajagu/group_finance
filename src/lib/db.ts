import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import snowflake from "snowflake-sdk";

type SnowflakeConn = snowflake.Connection;

const snowflakeConfigured =
  Boolean(process.env.SNOWFLAKE_ACCOUNT?.trim()) &&
  Boolean(
    (process.env.SNOWFLAKE_USERNAME ?? process.env.SNOWFLAKE_USER)?.trim(),
  ) &&
  Boolean(process.env.SNOWFLAKE_PASSWORD?.trim()) &&
  Boolean(process.env.SNOWFLAKE_WAREHOUSE?.trim()) &&
  Boolean(process.env.SNOWFLAKE_DATABASE?.trim()) &&
  Boolean(process.env.SNOWFLAKE_SCHEMA?.trim());

let snowflakeConn: Promise<SnowflakeConn> | undefined;
let local: Promise<PGlite> | undefined;

export function dbBackend(): "snowflake" | "local" {
  return snowflakeConfigured ? "snowflake" : "local";
}

/** Convert `$1`-style placeholders to Snowflake `?` binds in appearance order. */
function toSnowflakeSql(
  text: string,
  params: unknown[],
): { sqlText: string; binds: snowflake.Binds } {
  const indexes = [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  const sqlText = text.replace(/\$(\d+)/g, "?");
  const binds = indexes.map((i) => params[i - 1]) as snowflake.Binds;
  return { sqlText, binds };
}

function lowerKeys<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.toLowerCase()] = value;
  }
  return out as T;
}

function connectSnowflake(): Promise<SnowflakeConn> {
  return new Promise((resolve, reject) => {
    const connection = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!.trim(),
      username: (
        process.env.SNOWFLAKE_USERNAME ?? process.env.SNOWFLAKE_USER
      )!.trim(),
      password: process.env.SNOWFLAKE_PASSWORD!.trim(),
      warehouse: process.env.SNOWFLAKE_WAREHOUSE!.trim(),
      database: process.env.SNOWFLAKE_DATABASE!.trim(),
      schema: process.env.SNOWFLAKE_SCHEMA!.trim(),
      role: process.env.SNOWFLAKE_ROLE?.trim() || undefined,
      clientSessionKeepAlive: true,
    });
    connection.connect((err) => {
      if (err) reject(err);
      else resolve(connection);
    });
  });
}

function snowflakeExecute<T>(
  connection: SnowflakeConn,
  sqlText: string,
  binds: snowflake.Binds = [],
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          ((rows ?? []) as Record<string, unknown>[]).map((row) =>
            lowerKeys<T>(row),
          ),
        );
      },
    });
  });
}

async function getSnowflake(): Promise<SnowflakeConn> {
  snowflakeConn ??= connectSnowflake().catch((error: unknown) => {
    snowflakeConn = undefined;
    throw error;
  });
  return snowflakeConn;
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  // Top-level *.sql only — Snowflake scripts live under migrations/snowflake/
  const topLevel = (await readdir("migrations").catch(() => []))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of topLevel) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  return db;
}

/**
 * Run a parameterized query.
 * - Snowflake when SNOWFLAKE_* secrets are set (shared durable store).
 * - In-memory PGlite locally when they are not (sample data only; not shared).
 */
export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (snowflakeConfigured) {
    const connection = await getSnowflake();
    const { sqlText, binds } = toSnowflakeSql(text, params);
    return snowflakeExecute<T>(connection, sqlText, binds);
  }

  local ??= startLocal().catch((error: unknown) => {
    local = undefined;
    throw error;
  });
  return (await (await local).query<T>(text, params)).rows;
}
