import { execSync } from "node:child_process";

export interface GitState {
  isGitRepo: boolean;
  branch: string;
  isDirty: boolean;
}

export function getGitState(): GitState {
  try {
    execSync("git rev-parse --is-inside-work-tree", { stdio: "pipe" });
  } catch {
    return { isGitRepo: false, branch: "", isDirty: false };
  }

  let branch = "";
  try {
    branch = execSync("git branch --show-current", { stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    branch = "unknown";
  }

  let isDirty = false;
  try {
    const status = execSync("git status --porcelain", { stdio: "pipe" })
      .toString()
      .trim();
    isDirty = status.length > 0;
  } catch {
    isDirty = false;
  }

  return { isGitRepo: true, branch, isDirty };
}
