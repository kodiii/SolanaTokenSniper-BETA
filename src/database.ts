import { Database } from 'sqlite3';
import { NewTokenRecord } from './types';

let db: Database | null = null;

export async function initializeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    db = new Database(':memory:', (err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      
      db!.run(`
        CREATE TABLE IF NOT EXISTS tokens (
          time INTEGER,
          mint TEXT PRIMARY KEY,
          name TEXT,
          creator TEXT
        )
      `, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

export async function insertNewToken(token: NewTokenRecord): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  return new Promise((resolve, reject) => {
    const stmt = db!.prepare(
      'INSERT OR REPLACE INTO tokens (time, mint, name, creator) VALUES (?, ?, ?, ?)'
    );
    
    stmt.run(
      token.time,
      token.mint,
      token.name,
      token.creator,
      (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
    
    stmt.finalize();
  });
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
