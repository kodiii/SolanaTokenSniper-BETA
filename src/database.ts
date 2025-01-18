import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { NewTokenRecord } from './types';

let db: Awaited<ReturnType<typeof open>> | null = null;

export async function initializeDatabase(): Promise<void> {
  db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      time INTEGER,
      mint TEXT PRIMARY KEY,
      name TEXT,
      creator TEXT
    )
  `);
}

export async function insertNewToken(token: NewTokenRecord): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  await db!.run(
    'INSERT OR REPLACE INTO tokens (time, mint, name, creator) VALUES (?, ?, ?, ?)',
    [token.time, token.mint, token.name, token.creator]
  );
}

export async function selectTokenByNameAndCreator(
  name: string,
  creator: string
): Promise<NewTokenRecord[]> {
  if (!db) {
    await initializeDatabase();
  }

  return new Promise((resolve, reject) => {
    db!.all(
      'SELECT * FROM tokens WHERE name = ? OR creator = ?',
      [name, creator],
      (err: Error | null, rows: NewTokenRecord[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

export async function createTableHoldings(db: Awaited<ReturnType<typeof open>>): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      Time INTEGER NOT NULL,
      Token TEXT PRIMARY KEY,
      TokenName TEXT,
      Balance REAL,
      SolPaid REAL,
      SolFeePaid REAL,
      SolPaidUSDC REAL,
      SolFeePaidUSDC REAL,
      PerTokenPaidUSDC REAL,
      Slot INTEGER,
      Program TEXT
    )
  `);
}
