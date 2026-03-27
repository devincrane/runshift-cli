import ora from "ora";
import { collectRepoContext, addFileToContext } from "../context/collector.js";
import { getGitState } from "../context/git.js";
import {
  showBanner,
  showNotGitRepo,
  showDirtyWarning,
  showBranchInfo,
  showScanResults,
  showFindings,
  showFileList,
  showSummary,
  showSuccess,
  showError,
} from "../ui/display.js";
import { confirm, promptChoice, promptFilePath } from "../ui/prompt.js";
import { writeFiles, commitFiles } from "../writer.js";
import type { InitResponse } from "../types.js";

const API_URL =
  process.env.RUNSHIFT_DEV === "true"
    ? "http://localhost:3000/api/cli/init"
    : "https://runshift.ai/api/cli/init";

const TIMEOUT_MS = 240_000;

export async function init(): Promise<void> {
  showBanner();

  // ── 1. Git safety ─────────────────────────────────────────────────
  const git = getGitState();

  if (!git.isGitRepo) {
    showNotGitRepo();
    process.exit(0);
  }

  showBranchInfo(git.branch);

  if (git.isDirty) {
    showDirtyWarning();
    const proceed = await confirm("  continue with uncommitted changes? (y/n) ");
    if (!proceed) {
      process.exit(0);
    }
  }

  // ── 2. Collect context ────────────────────────────────────────────
  const root = process.cwd();
  const context = collectRepoContext(root);

  // ── 3. Show scan results + prompt ─────────────────────────────────
  showScanResults(context);

  let choice = await promptChoice("  proceed? [y] add more files? [a] cancel? [n] ");

  while (choice === "a") {
    const filePath = await promptFilePath("  file path: ");
    if (filePath) {
      const added = addFileToContext(root, filePath, context);
      if (!added) {
        console.log(`  could not read ${filePath}\n`);
      }
    }
    showScanResults(context);
    choice = await promptChoice("  proceed? [y] add more files? [a] cancel? [n] ");
  }

  if (choice === "n") {
    process.exit(0);
  }

  // ── 4. Call API ───────────────────────────────────────────────────
  const spinner = ora({
    text: "relay is reading your repository...",
    color: "yellow",
  }).start();

  console.log("calling:", API_URL);

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    spinner.stop();
    if (err instanceof Error && err.name === "AbortError") {
      showError("network", "request timed out after 120s");
    } else {
      showError("network");
    }
    process.exit(1);
  }

  if (!response.ok) {
    spinner.stop();
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const msg = (body.message ?? body.error) as string | undefined;

    if (response.status === 429) {
      showError("rate-limit");
    } else if (response.status === 400) {
      showError("validation", msg);
    } else {
      showError("server", msg);
    }
    process.exit(1);
  }

  let data: InitResponse;
  try {
    data = (await response.json()) as InitResponse;
  } catch {
    spinner.stop();
    showError("server", "invalid response from relay");
    process.exit(1);
  }

  spinner.stop();
  console.log();

  // ── 5. Show findings + file list ──────────────────────────────────
  showSummary(data.summary);
  showFindings(data.findings);
  showFileList(data.files);

  // ── 6. Confirm write ──────────────────────────────────────────────
  const writeConfirm = await confirm("  write these files? (y/n) ");
  if (!writeConfirm) {
    process.exit(0);
  }

  // ── 7. Re-check git before writing ────────────────────────────────
  const gitNow = getGitState();
  if (gitNow.isDirty && !git.isDirty) {
    const proceed = await confirm("  working tree changed since scan — continue? (y/n) ");
    if (!proceed) {
      process.exit(0);
    }
  }

  // ── 8. Write + commit ─────────────────────────────────────────────
  console.log();
  writeFiles(root, data.files);
  console.log();

  const committed = commitFiles(root, data.files);
  if (!committed) {
    console.log("  ⚠ files written but git commit failed\n");
  }

  // ── 9. Success ────────────────────────────────────────────────────
  showSuccess();
}
