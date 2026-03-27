import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { GeneratedFile } from "./types.js";
import { showWriting, showCommit } from "./ui/display.js";

export function writeFiles(root: string, files: GeneratedFile[]): void {
  for (const file of files) {
    const fullPath = path.join(root, file.path);
    const dir = path.dirname(fullPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, file.content, "utf-8");
    showWriting(file.path);
  }
}

export function commitFiles(root: string, files: GeneratedFile[]): boolean {
  try {
    const filePaths = files.map((f) => `"${f.path}"`).join(" ");

    execSync(`git add ${filePaths}`, {
      cwd: root,
      stdio: "pipe",
    });

    execSync(
      'git commit -m "chore: install runshift agent governance rules"',
      { cwd: root, stdio: "pipe" },
    );

    showCommit();
    return true;
  } catch {
    return false;
  }
}
