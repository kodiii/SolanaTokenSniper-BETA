import { insertHolding } from './tracker/db';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { config } from './config';
import path from 'path';
import fs from 'fs';

async function insertTestToken() {
  const holding = {
    Time: Date.now(),
    Token: 'Eu8hEhTf2MrKmUbxMD1PCdCpKbWKFBdYwCmsoaS3VGCX',
    TokenName: 'TestToken',
    Balance: 1000,
    SolPaid: 0.1,
    SolFeePaid: 0.01,
    SolPaidUSDC: 10,
    SolFeePaidUSDC: 1,
    PerTokenPaidUSDC: 0.01,
    Slot: 0,
    Program: config.liquidity_pool.radiyum_program_id
  };

  try {
    // Get absolute path for database
    const dbPath = path.resolve(process.cwd(), config.swap.db_name_tracker_holdings);
    console.log('Database path:', dbPath);
    
    // Enable verbose logging for sqlite3
    const verbose = sqlite3.verbose();
    console.log('SQLite3 version:', verbose.VERSION);
    
    console.log('Opening database...');
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    });

    console.log('Creating holdings table...');
    // Create tables with error logging
    try {
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
        );
      `);
      console.log('Table created successfully');
    } catch (error) {
      console.error('Error creating table:', error);
      throw error;
    }

    console.log('Inserting test token...');
    // Insert the holding directly with error logging
    try {
      const { Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program } = holding;
      const result = await db.run(
        `INSERT INTO holdings (Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program]
      );
      console.log('Insert result:', result);
    } catch (error) {
      console.error('Error inserting token:', error);
      throw error;
    }

    console.log('Test token inserted successfully');

    // Verify database contents with error logging
    try {
      console.log('\nVerifying database structure:');
      const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table';");
      console.log('Tables in database:', tables);

      console.log('\nVerifying holdings:');
      const holdings = await db.all('SELECT * FROM holdings');
      console.log('Current holdings in database:', holdings);

      if (holdings.length === 0) {
        console.error('WARNING: No holdings found in database after insertion!');
      }
    } catch (error) {
      console.error('Error verifying database:', error);
      throw error;
    }

    await db.close();
    console.log('\nDatabase operations completed successfully');
    
    // Verify the database file exists and has content
    if (fs.existsSync(dbPath)) {
      console.log('Database file exists at:', dbPath);
      const stats = fs.statSync(dbPath);
      console.log('Database file size:', stats.size, 'bytes');
      
      // Read and verify the database directly
      console.log('\nVerifying database with new connection:');
      const verifyDb = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });
      const verifyHoldings = await verifyDb.all('SELECT * FROM holdings');
      console.log('Holdings from verification:', verifyHoldings);
      await verifyDb.close();
    } else {
      console.error('Database file does not exist at:', dbPath);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1); // Exit with error code
  }
}

insertTestToken();
