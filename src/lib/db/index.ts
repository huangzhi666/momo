import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getDataDir, getDbPath } from '@/lib/env'
import { MIGRATION_SQL } from './migrate'
import * as schema from './schema'

type DbBundle = {
  sqlite: Database.Database
  db: BetterSQLite3Database<typeof schema>
  path: string
}

const globalForDb = globalThis as unknown as { __lexiloopDb?: DbBundle }

function createBundle(): DbBundle {
  const dbPath = getDbPath()
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.mkdirSync(getDataDir(), { recursive: true })
  }
  const sqlite = new Database(dbPath)
  if (dbPath !== ':memory:') {
    sqlite.pragma('journal_mode = WAL')
  }
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.exec(MIGRATION_SQL)
  const db = drizzle(sqlite, { schema })
  return { sqlite, db, path: dbPath }
}

export function getDbBundle(): DbBundle {
  if (!globalForDb.__lexiloopDb) {
    globalForDb.__lexiloopDb = createBundle()
  }
  return globalForDb.__lexiloopDb
}

export function getDb() {
  return getDbBundle().db
}

export function getRawDb() {
  return getDbBundle().sqlite
}

export function closeDb() {
  if (globalForDb.__lexiloopDb) {
    globalForDb.__lexiloopDb.sqlite.close()
    delete globalForDb.__lexiloopDb
  }
}

export { schema }
