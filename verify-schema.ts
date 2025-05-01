
import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL!;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set!");
  process.exit(1);
}

// Define expected columns for each table
const expectedColumns = {
  characters: ['id', 'name', 'species', 'class', 'subclass', 'level', 'background', 'backstory', 'notes', 'bonds', 'proficiency_bonus'],
  campaigns: ['id', 'name', 'description', 'setting', 'player_characters', 'created_at', 'updated_at']
};

// Define the structure for verification results
interface ColumnVerification {
  table: string;
  column: string;
  exists: boolean;
  expected: boolean;
}

// Connection setup
const sqlClient = neon(DATABASE_URL);
const db = drizzle(sqlClient);

async function verifySchema() {
  console.log("🔍 Starting comprehensive database schema verification...");

  try {
    const results: ColumnVerification[] = [];
    const missingColumns: string[] = [];
    const unexpectedColumns: string[] = [];

    // Get all tables and their columns from information_schema
    const tablesAndColumns = await db.execute(sql`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
    `);

    // Create a map of existing columns by table
    const existingColumns: Record<string, string[]> = {};
    for (const row of tablesAndColumns) {
      const tableName = row.table_name;
      const columnName = row.column_name;

      if (!existingColumns[tableName]) {
        existingColumns[tableName] = [];
      }

      existingColumns[tableName].push(columnName);

      // Check if this column is expected
      const isExpected = expectedColumns[tableName as keyof typeof expectedColumns]?.includes(columnName);

      results.push({
        table: tableName,
        column: columnName,
        exists: true,
        expected: !!isExpected
      });

      if (!isExpected && tableName in expectedColumns) {
        unexpectedColumns.push(`${tableName}.${columnName}`);
      }
    }

    // Check for missing expected columns
    for (const [tableName, columns] of Object.entries(expectedColumns)) {
      for (const columnName of columns) {
        if (!existingColumns[tableName]?.includes(columnName)) {
          results.push({
            table: tableName,
            column: columnName,
            exists: false,
            expected: true
          });

          missingColumns.push(`${tableName}.${columnName}`);
        }
      }
    }

    // Print verification summary
    console.log("\n📊 Schema Verification Summary:");

    // Print results by table
    for (const tableName of Object.keys(expectedColumns)) {
      const tableResults = results.filter(r => r.table === tableName);

      console.log(`\n📋 Table: ${tableName}`);
      console.log("  Column".padEnd(25) + "Status".padEnd(15) + "Expected");
      console.log("  " + "-".repeat(50));

      for (const result of tableResults) {
        const statusText = result.exists ? "✅ Exists" : "❌ Missing";
        const expectedText = result.expected ? "Yes" : "No";
        console.log(`  ${result.column.padEnd(25)}${statusText.padEnd(15)}${expectedText}`);
      }
    }

    // Log missing and unexpected columns
    if (missingColumns.length > 0) {
      console.log("\n❌ Missing columns:");
      missingColumns.forEach(col => console.log(`  - ${col}`));
    } else {
      console.log("\n✅ No missing columns detected");
    }

    if (unexpectedColumns.length > 0) {
      console.log("\n⚠️ Unexpected columns:");
      unexpectedColumns.forEach(col => console.log(`  - ${col}`));
    } else {
      console.log("\n✅ No unexpected columns detected");
    }

    // Save verification report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const report = {
      timestamp,
      results,
      missingColumns,
      unexpectedColumns,
      success: missingColumns.length === 0
    };

    const reportsDir = path.join(__dirname, 'schema-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(reportsDir, `schema-verification-${timestamp}.json`),
      JSON.stringify(report, null, 2)
    );

    console.log(`\n📝 Verification report saved to schema-reports/schema-verification-${timestamp}.json`);

    // Exit with appropriate code
    const success = missingColumns.length === 0;
    console.log(success ? "\n✅ Schema is up to date!" : "\n❌ Schema validation failed!");

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Error during schema verification:", error);

    // Save error report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const errorReport = {
      timestamp,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : String(error)
    };

    const reportsDir = path.join(__dirname, 'schema-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(reportsDir, `schema-error-${timestamp}.json`),
      JSON.stringify(errorReport, null, 2)
    );

    console.log(`📝 Error report saved to schema-reports/schema-error-${timestamp}.json`);

    process.exit(1);
  }
}

// Run the verification
verifySchema();
