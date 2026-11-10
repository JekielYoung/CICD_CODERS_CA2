const fs = require("fs");
const path = require("path");
const pool = require("../server/db");

async function initTables() {
  let client;

  try {
    // Connect to PostgreSQL
    client = await pool.connect();

    // Read schema.sql
    const schemaPath = path.join(__dirname, "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf8");

    // Start transaction
    await client.query("BEGIN");

    // Use PostgreSQL's public schema
    await client.query("SET LOCAL search_path TO public");

    // Execute schema.sql
    await client.query(sql);

    // Save changes
    await client.query("COMMIT");

    console.log("✅ Tables created successfully!");

  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    console.error("❌ Error:", error.message);
    process.exitCode = 1;

  } finally {
    if (client) {
      client.release();
    }

    await pool.end();
  }
}

initTables();