import { describe, it, expect, vi, beforeEach } from "vitest";
import { remove } from "../commands/remove.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const cpMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => cpMocks);

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => [] as string[]),
  rmdirSync: vi.fn(),
}));

vi.mock("node:fs", () => fsMocks);

vi.mock("chalk", () => ({
  default: {
    hex: () => (s: string) => s,
    dim: (s: string) => s,
  },
}));

vi.mock("../ui/display.js", () => ({
  showBanner: vi.fn(),
  showCancelled: vi.fn(),
}));

const promptMocks = vi.hoisted(() => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("../ui/prompt.js", () => promptMocks);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_HASH = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const ROOT = "/fake/root";

const VALID_MANIFEST = JSON.stringify({
  commit_hash: VALID_HASH,
  files_written: [".cursor/rules/core.mdc"],
  timestamp: "2026-04-14T12:00:00.000Z",
  version: "0.0.14",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Make manifest readable for this test run. */
function withManifest(content = VALID_MANIFEST) {
  fsMocks.readFileSync.mockImplementation((p: unknown) => {
    if (String(p).includes("manifest.json")) return content;
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
}

/** Make manifest missing for this test run. */
function withNoManifest() {
  fsMocks.readFileSync.mockImplementation(() => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
}

// ── Tests: manifest-based removal ─────────────────────────────────────────────

describe("remove — manifest-based removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue(ROOT);
    fsMocks.readdirSync.mockReturnValue([] as any);
  });

  it("uses commit_hash from manifest as the revert target", async () => {
    withManifest();
    // cat-file: commit exists
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("commit"))
      // git log for display
      .mockReturnValueOnce(Buffer.from("chore: install runshift 2026-04-14"))
      // git revert
      .mockReturnValueOnce(Buffer.from(""));

    await remove();

    const revertCall = (cpMocks.execFileSync.mock.calls as [string, string[]][]).find(
      ([, args]) => Array.isArray(args) && args.includes("revert"),
    );
    expect(revertCall).toBeDefined();
    expect(revertCall![1]).toContain(VALID_HASH);
  });

  it("shows error and returns when manifest hash is not in git history", async () => {
    withManifest();
    // cat-file throws → commit does not exist
    cpMocks.execFileSync.mockImplementationOnce(() => { throw new Error("not found"); });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();
    consoleSpy.mockRestore();

    // confirm should never be called — we bail out early
    expect(promptMocks.confirm).not.toHaveBeenCalled();
  });

  it("calls showCancelled when user declines confirmation", async () => {
    withManifest();
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("commit"))
      .mockReturnValueOnce(Buffer.from("chore: install 2026-04-14"));

    promptMocks.confirm.mockResolvedValueOnce(false);

    const { showCancelled } = await import("../ui/display.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();
    consoleSpy.mockRestore();

    expect(showCancelled).toHaveBeenCalled();
  });

  it("deletes manifest.json after successful revert", async () => {
    withManifest();
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("commit"))
      .mockReturnValueOnce(Buffer.from("chore: install 2026-04-14"))
      .mockReturnValueOnce(Buffer.from(""));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();
    consoleSpy.mockRestore();

    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(
      expect.stringContaining("manifest.json"),
    );
  });

  it("removes .runshift dir after revert when it is empty", async () => {
    withManifest();
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("commit"))
      .mockReturnValueOnce(Buffer.from("chore: install 2026-04-14"))
      .mockReturnValueOnce(Buffer.from(""));

    fsMocks.readdirSync.mockReturnValue([] as any);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();
    consoleSpy.mockRestore();

    expect(fsMocks.rmdirSync).toHaveBeenCalledWith(
      expect.stringContaining(".runshift"),
    );
  });

  it("does not remove .runshift dir when it still has other files", async () => {
    withManifest();
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("commit"))
      .mockReturnValueOnce(Buffer.from("chore: install 2026-04-14"))
      .mockReturnValueOnce(Buffer.from(""));

    fsMocks.readdirSync.mockReturnValue(["other-file.json"] as any);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();
    consoleSpy.mockRestore();

    expect(fsMocks.rmdirSync).not.toHaveBeenCalled();
  });

  it("logs error message and does not delete manifest when revert fails", async () => {
    withManifest();
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("commit"))
      .mockReturnValueOnce(Buffer.from("chore: install 2026-04-14"))
      .mockImplementationOnce(() => { throw new Error("revert failed"); });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();
    consoleSpy.mockRestore();

    expect(fsMocks.unlinkSync).not.toHaveBeenCalled();
  });

  it("returns null for manifest with invalid hash format", async () => {
    withManifest(JSON.stringify({
      commit_hash: "not-a-valid-sha",
      files_written: [],
      timestamp: "2026-04-14T12:00:00.000Z",
      version: "0.0.14",
    }));

    // Falls back to grep — stub it to return empty → "no runshift commit found"
    cpMocks.execFileSync.mockReturnValueOnce(Buffer.from(""));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();
    consoleSpy.mockRestore();

    // Never calls cat-file (invalid manifest → fallback path)
    const catFileCall = (cpMocks.execFileSync.mock.calls as [string, string[]][]).find(
      ([, args]) => Array.isArray(args) && args.includes("cat-file"),
    );
    expect(catFileCall).toBeUndefined();
  });
});

// ── Tests: fallback (no manifest) ─────────────────────────────────────────────

describe("remove — fallback commit-message grep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue(ROOT);
    withNoManifest();
  });

  it("shows fallback warning when no manifest exists", async () => {
    cpMocks.execFileSync.mockReturnValueOnce(Buffer.from(""));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();

    const warned = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes("No runshift manifest found"),
    );
    consoleSpy.mockRestore();

    expect(warned).toBe(true);
  });

  it("shows 'no runshift commit found' when grep returns empty", async () => {
    cpMocks.execFileSync.mockReturnValueOnce(Buffer.from(""));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();

    const notFound = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes("no runshift commit found"),
    );
    consoleSpy.mockRestore();

    expect(notFound).toBe(true);
  });

  it("shows 'no runshift commit found' when git log throws", async () => {
    cpMocks.execFileSync.mockImplementationOnce(() => { throw new Error("git error"); });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();

    const notFound = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes("no runshift commit found"),
    );
    consoleSpy.mockRestore();

    expect(notFound).toBe(true);
  });

  it("shows 'could not parse commit hash' when grep returns a malformed line", async () => {
    // Return a line whose first token is not a 40-char hex SHA
    cpMocks.execFileSync.mockReturnValueOnce(
      Buffer.from("deadbeef chore: install runshift 2026-04-14"),
    );

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();

    const badHash = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes("could not parse commit hash"),
    );
    consoleSpy.mockRestore();

    expect(badHash).toBe(true);
  });

  it("reverts using hash from grep output when manifest is absent", async () => {
    const LOG_LINE = `${VALID_HASH} chore: install runshift agent coordination rules 2026-04-14`;

    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from(LOG_LINE))  // git log grep
      .mockReturnValueOnce(Buffer.from(""));        // git revert

    fsMocks.readdirSync.mockReturnValue([] as any);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await remove();
    consoleSpy.mockRestore();

    const revertCall = (cpMocks.execFileSync.mock.calls as [string, string[]][]).find(
      ([, args]) => Array.isArray(args) && args.includes("revert"),
    );
    expect(revertCall).toBeDefined();
    expect(revertCall![1]).toContain(VALID_HASH);
  });
});
