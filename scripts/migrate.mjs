import { readdir, readFile } from "node:fs/promises";
import snowflake from "snowflake-sdk";

const account = process.env.SNOWFLAKE_ACCOUNT?.trim() ?? "";
const username = (
  process.env.SNOWFLAKE_USERNAME ?? process.env.SNOWFLAKE_USER
)?.trim() ?? "";
const password = process.env.SNOWFLAKE_PASSWORD?.trim() ?? "";
const warehouse = process.env.SNOWFLAKE_WAREHOUSE?.trim() ?? "";
const database = process.env.SNOWFLAKE_DATABASE?.trim() ?? "";
const schema = process.env.SNOWFLAKE_SCHEMA?.trim() ?? "";
const role = process.env.SNOWFLAKE_ROLE?.trim() || undefined;

const files = (await readdir("migrations/snowflake").catch(() => []))
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (
  !account ||
  !username ||
  !password ||
  !warehouse ||
  !database ||
  !schema ||
  files.length === 0
) {
  console.log("migrate: nothing to do (Snowflake not fully configured)");
  process.exit(0);
}

function connect() {
  return new Promise((resolve, reject) => {
    const connection = snowflake.createConnection({
      account,
      username,
      password,
      warehouse,
      database,
      schema,
      role,
    });
    connection.connect((err) => (err ? reject(err) : resolve(connection)));
  });
}

function exec(connection, sqlText, binds = []) {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve(rows ?? [])),
    });
  });
}

const connection = await connect();
try {
  await exec(
    connection,
    `create table if not exists schema_migrations (
       name varchar primary key,
       applied_at timestamp_tz not null default current_timestamp()
     )`,
  );
  const doneRows = await exec(
    connection,
    "select name from schema_migrations",
  );
  const done = new Set(doneRows.map((r) => r.NAME ?? r.name));
  for (const file of files.filter((f) => !done.has(f))) {
    const body = await readFile(`migrations/snowflake/${file}`, "utf8");
    // Run statement-by-statement; Snowflake execute is one statement at a time.
    const statements = body
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await exec(connection, statement);
    }
    await exec(
      connection,
      "insert into schema_migrations (name) values (?)",
      [file],
    );
    console.log(`migrate: applied ${file}`);
  }
} finally {
  await new Promise((resolve) => connection.destroy(() => resolve()));
}
