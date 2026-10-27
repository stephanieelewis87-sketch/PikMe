import path from "node:path";
import { SCHEMA } from "./schema";

// One small query interface over two Postgres engines:
// - DATABASE_URL set: a real Postgres server (Neon, Supabase, Railway, local).
// - DATABASE_URL unset: PGlite, an embedded Postgres saved under data/pglite,
//   so the app runs locally with no setup.
// Both speak the same SQL, so the rest of the app doesn't care which is in use.

export type Sql = {
  query<T>(text: string, params?: unknown[]): Promise<T[]>;
};

type Engine = Sql & {
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
};

async function connectPostgres(url: string): Promise<Engine> {
  const { Pool } = await import("pg");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Hosted providers require TLS; some (like Supabase) sign with their own CA,
  // so the connection is encrypted without pinning a certificate.
  const pool = new Pool({
    connectionString: url,
    max: 5,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  return {
    async exec(text: string) {
      await pool.query(text);
    },
    async query<T>(text: string, params?: unknown[]) {
      return (await pool.query(text, params)).rows as T[];
    },
    async transaction<T>(fn: (tx: Sql) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query<R>(text: string, params?: unknown[]) {
            return (await client.query(text, params)).rows as R[];
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function connectPglite(): Promise<Engine> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PIKME_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  const db = await PGlite.create(path.join(/*turbopackIgnore: true*/ dir, "pglite"));
  return {
    async exec(text: string) {
      await db.exec(text);
    },
    async query<T>(text: string, params?: unknown[]) {
      return (await db.query<T>(text, params)).rows;
    },
    async transaction<T>(fn: (tx: Sql) => Promise<T>) {
      return db.transaction((tx) =>
        fn({
          async query<R>(text: string, params?: unknown[]) {
            return (await tx.query<R>(text, params)).rows;
          },
        }),
      );
    },
  };
}

// Kept on globalThis so dev-mode hot reloads reuse one connection.
const g = globalThis as unknown as { pikmeDb?: Promise<Engine> };

function engine(): Promise<Engine> {
  g.pikmeDb ??= (async () => {
    const url = process.env.DATABASE_URL;
    const e = url ? await connectPostgres(url) : await connectPglite();
    await e.exec(SCHEMA);
    return e;
  })().catch((err) => {
    g.pikmeDb = undefined;
    throw err;
  });
  return g.pikmeDb;
}

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  return (await engine()).query<T>(text, params);
}

export async function transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  return (await engine()).transaction(fn);
}
