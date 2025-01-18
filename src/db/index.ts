import { Database } from 'sqlite';
import { Database as SQLite3Database } from 'sqlite3';

export async function createTableHoldings(db: Database<SQLite3Database>): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      Time INTEGER NOT NULL,
      Token TEXT NOT NULL,
      TokenName TEXT NOT NULL,
      Balance REAL NOT NULL,
      SolPaid REAL NOT NULL,
      SolFeePaid REAL NOT NULL,
      SolPaidUSDC REAL NOT NULL,
      SolFeePaidUSDC REAL NOT NULL,
      PerTokenPaidUSDC REAL NOT NULL,
      Slot INTEGER NOT NULL,
      Program TEXT NOT NULL
    )
  `);
}

export async function removeHolding(db: Database<SQLite3Database>, tokenMint: string): Promise<void> {
  await db.run('DELETE FROM holdings WHERE Token = ?', [tokenMint]);
}
