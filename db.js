import postgres from 'postgres';
import 'dotenv/config'; // ✅ Add this so it loads the .env file

const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString, {
  ssl: 'require', // Supabase requires SSL
   prepare: false, 
});

export default sql;