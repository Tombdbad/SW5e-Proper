// bulkFormatSpeedFix.ts
import fs from "fs";
import path from "path";

const baseDir = "./src"; // root of your codebase
const importPath = `import { formatSpeed } from '@/utils/formatSpeed';`;

function walkDir(dir: string, callback: (file: string) => void) {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath, callback);
    } else if (/\.(tsx?|jsx?)$/.test(fullPath)) {
      callback(fullPath);
    }
  });
}

function patchFile(filePath: string) {
  let content = fs.readFileSync(filePath, "utf-8");

  const hasSpeedRender =
    /Object\.entries\([^)]+\.speed\)|typeof [^)]+\.speed === ['"]object['"]/s.test(
      content,
    );
  const alreadyImported = content.includes("formatSpeed");

  if (!hasSpeedRender) return;

  // Insert import if missing
  if (!alreadyImported) {
    const lines = content.split("\n");
    const importIndex = lines.findIndex((line) => line.startsWith("import"));
    lines.splice(importIndex + 1, 0, importPath);
    content = lines.join("\n");
  }

  // Replace inline speed rendering logic
  content = content.replace(
    /{(?:typeof )?[^}]*\.speed[^}]*\?[^:}]+:[^}]+}/gs,
    (match) => `{formatSpeed(${extractSpeedVar(match)})}`,
  );

  content = content.replace(
    /{Object\.entries\(([^)]+)\.speed\)[^}]+}/gs,
    (_, obj) => `{formatSpeed(${obj}.speed)}`,
  );

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`✔ Patched ${filePath}`);
}

function extractSpeedVar(code: string): string {
  const match = code.match(
    /(?:character|npc|vehicle|droid|species|starship)\b/i,
  );
  return match ? match[0] : "data";
}

walkDir(baseDir, patchFile);
