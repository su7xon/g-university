import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import path from 'path';
import fs from 'fs';

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface TransactionClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
}

let pool: pg.Pool | null = null;
let pgliteInstance: PGlite | null = null;
let isUsingPglite = false;

export async function getDb(): Promise<{
  query: <T = any>(sql: string, params?: any[]) => Promise<QueryResult<T>>;
  transaction: <T = any>(fn: (tx: TransactionClient) => Promise<T>) => Promise<T>;
}> {
  if (!pool && !pgliteInstance) {
    await initDb();
  }

  return {
    query,
    transaction,
  };
}

export async function initDb(options?: { inMemoryOnly?: boolean; dataDir?: string }): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  // If running in tests or inMemory requested, prefer fast isolated PGlite
  if (options?.inMemoryOnly || process.env.NODE_ENV === 'test') {
    pgliteInstance = new PGlite();
    isUsingPglite = true;
    await applySchemaToPglite(pgliteInstance);
    return;
  }

  // Attempt real PostgreSQL connection first if DATABASE_URL is configured
  if (databaseUrl && !options?.inMemoryOnly) {
    try {
      const candidatePool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 1500,
      });
      await candidatePool.query('SELECT 1');
      pool = candidatePool;
      isUsingPglite = false;
      console.log('Connected to PostgreSQL via DATABASE_URL');
      await applySchemaToPg(pool);
      return;
    } catch (err: any) {
      console.log('PostgreSQL connection unavailable (' + (err.message || 'offline') + '). Falling back to embedded PGlite engine.');
    }
  }

  // Embedded PGlite fallback for local/container dev without Postgres daemon
  const dir = options?.dataDir || path.resolve(process.cwd(), '.data/pglite');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  pgliteInstance = new PGlite(dir);
  isUsingPglite = true;
  await applySchemaToPglite(pgliteInstance);
  console.log(`Embedded PostgreSQL (PGlite) initialized at: ${dir}`);
}

async function applySchemaToPglite(pgInstance: PGlite): Promise<void> {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'Member',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'Open',
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      due_date TIMESTAMP WITH TIME ZONE,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
    CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);
    CREATE INDEX IF NOT EXISTS idx_work_items_assignee ON work_items(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_work_items_team ON work_items(team_id);
    CREATE INDEX IF NOT EXISTS idx_work_items_created_at ON work_items(created_at);

    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      from_value TEXT,
      to_value TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_activity_events_item ON activity_events(work_item_id, created_at);

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(work_item_id, created_at);

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

    CREATE TABLE IF NOT EXISTS outbox_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'notify_assignee',
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_jobs(status, next_retry_at);
  `;

  await pgInstance.exec(schemaSql);
}

async function applySchemaToPg(poolClient: pg.Pool): Promise<void> {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'Member',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'Open',
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      due_date TIMESTAMP WITH TIME ZONE,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
    CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);
    CREATE INDEX IF NOT EXISTS idx_work_items_assignee ON work_items(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_work_items_team ON work_items(team_id);
    CREATE INDEX IF NOT EXISTS idx_work_items_created_at ON work_items(created_at);

    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      from_value TEXT,
      to_value TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_activity_events_item ON activity_events(work_item_id, created_at);

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(work_item_id, created_at);

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

    CREATE TABLE IF NOT EXISTS outbox_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'notify_assignee',
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_jobs(status, next_retry_at);
  `;

  await poolClient.query(schemaSql);
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
  if (!pool && !pgliteInstance) {
    await initDb();
  }

  if (pool) {
    const res = await pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length,
    };
  } else if (pgliteInstance) {
    const res = await pgliteInstance.query(sql, params);
    return {
      rows: (res.rows || []) as T[],
      rowCount: res.affectedRows ?? (res.rows ? res.rows.length : 0),
    };
  }

  throw new Error('Database client not initialized');
}

export async function transaction<T = any>(
  fn: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  if (!pool && !pgliteInstance) {
    await initDb();
  }

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: TransactionClient = {
        query: async <R = any>(sql: string, params: any[] = []) => {
          const res = await client.query(sql, params);
          return {
            rows: res.rows as R[],
            rowCount: res.rowCount ?? res.rows.length,
          };
        },
      };
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else if (pgliteInstance) {
    return await pgliteInstance.transaction(async (tx) => {
      const txClient: TransactionClient = {
        query: async <R = any>(sql: string, params: any[] = []) => {
          const res = await tx.query(sql, params);
          return {
            rows: (res.rows || []) as R[],
            rowCount: res.affectedRows ?? (res.rows ? res.rows.length : 0),
          };
        },
      };
      return await fn(txClient);
    });
  }

  throw new Error('Database client not initialized');
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
}
