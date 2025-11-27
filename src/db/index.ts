import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import dotenv from "dotenv";
dotenv.config();
import * as schema from "./schema"; 

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export const db = drizzle(pool,{ schema });