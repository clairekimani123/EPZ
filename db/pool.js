import mysql from 'mysql2/promise';
import 'dotenv/config';

// --------------------------------------------------------------------------
// Same idea as before: one shared connection pool, imported everywhere else
// that needs to talk to the database. mysql2/promise gives us async/await
// support out of the box (the plain "mysql2" package uses old-style
// callbacks instead, which is why we specifically import "mysql2/promise").
// --------------------------------------------------------------------------

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});