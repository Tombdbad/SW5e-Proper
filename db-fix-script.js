// db-fix-script.js
// Script to identify and fix duplicate declarations in server/db.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get current file directory (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the database file
const dbFilePath = path.join(__dirname, "server", "db.ts");

// Function to analyze and fix the file
function analyzeAndFixDuplicates() {
  console.log("Starting analysis of server/db.ts...");

  // Check if file exists
  if (!fs.existsSync(dbFilePath)) {
    console.error("Error: server/db.ts file not found!");
    return;
  }

  // Create backup
  const backupPath = `${dbFilePath}.bak`;
  fs.copyFileSync(dbFilePath, backupPath);
  console.log(`Backup created at ${backupPath}`);

  // Read file content
  const content = fs.readFileSync(dbFilePath, "utf8");
  const lines = content.split("\n");

  // Track declarations
  const sqlDeclarations = [];
  const dbDeclarations = [];

  // Find all declarations
  lines.forEach((line, index) => {
    // Check for sql declarations
    if (/\b(const|let|var)\s+sql\b/.test(line)) {
      sqlDeclarations.push({ lineNum: index + 1, content: line.trim() });
    }

    // Check for db declarations/exports
    if (/\b(const|let|var|export\s+const|export\s+default)\s+db\b/.test(line)) {
      dbDeclarations.push({ lineNum: index + 1, content: line.trim() });
    }
  });

  // Report findings
  console.log("\n--- Analysis Results ---");
  console.log(`Found ${sqlDeclarations.length} 'sql' declarations:`);
  sqlDeclarations.forEach((d) =>
    console.log(`Line ${d.lineNum}: ${d.content}`),
  );

  console.log(`\nFound ${dbDeclarations.length} 'db' declarations/exports:`);
  dbDeclarations.forEach((d) => console.log(`Line ${d.lineNum}: ${d.content}`));

  // Only attempt to fix if there are duplicates
  if (sqlDeclarations.length > 1 || dbDeclarations.length > 1) {
    console.log("\n--- Fixing Duplicates ---");

    // Create a new version of the file content
    let newContent = content;

    // Keep track of line numbers that need to be removed
    // (Sort in descending order to avoid index shifting when removing lines)
    const linesToRemove = [];

    // Keep first sql declaration, mark others for removal
    if (sqlDeclarations.length > 1) {
      sqlDeclarations.slice(1).forEach((d) => {
        linesToRemove.push(d.lineNum - 1); // Adjust for 0-based array index
      });
    }

    // Keep first db declaration, mark others for removal
    if (dbDeclarations.length > 1) {
      dbDeclarations.slice(1).forEach((d) => {
        linesToRemove.push(d.lineNum - 1); // Adjust for 0-based array index
      });
    }

    // Sort in descending order to avoid index issues when removing lines
    linesToRemove.sort((a, b) => b - a);

    // Create new array of lines with duplicates removed
    const newLines = [...lines];
    linesToRemove.forEach((lineIndex) => {
      console.log(`Removing line ${lineIndex + 1}: ${lines[lineIndex].trim()}`);
      newLines.splice(lineIndex, 1);
    });

    // Write the fixed content back to the file
    fs.writeFileSync(dbFilePath, newLines.join("\n"));
    console.log(`\nFixed file saved to ${dbFilePath}`);
    console.log("Please restart your server to test the changes.");
  } else {
    console.log("\nNo duplicates found. No changes needed.");
  }
}

// Run the function
analyzeAndFixDuplicates();
