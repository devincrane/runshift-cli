import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFiles, commitFiles } from "../writer.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const cpMocks = vi.hoisted(() => ({
  spawnSync: vi.fn(() => ({ status: 0 as number | null })),
  execFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => cpMocks);

// realpathSync: identity by default — simulates no symlinks and all paths
// resolve to themselves. Override per-test to simulate symlink resolution.
const fsMocks = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  realpathSync: vi.fn((p: string) => p),
}));

vi.mock("node:fs", () => fsMocks);

vi.mock("../ui/display.js", () => ({
  showWriting: vi.fn(),
  showCommit: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROOT = "/tmp/testroot";

// ── writeFiles — path traversal protection ────────────────────────────────────

describe("writeFiles — path traversal protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.realpathSync.mockImplementation((p: string) => p);
  });

  it('throws for path "../../../etc/passwd"', () => {
    expect(() =>
      writeFiles(ROOT, [{ path: "../../../etc/passwd", content: "x", action: "create" }]),
    ).toThrow("path traversal blocked");
  });

  it('throws for path "../../.bashrc"', () => {
    expect(() =>
      writeFiles(ROOT, [{ path: "../../.bashrc", content: "x", action: "create" }]),
    ).toThrow("path traversal blocked");
  });

  it("accepts a path within the root and writes the file", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: "src/rules/core.mdc", content: "# rules", action: "create" }]),
    ).not.toThrow();
  });
});

// ── writeFiles — denylist and symlink protection ──────────────────────────────

describe("writeFiles — denylist and symlink protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.realpathSync.mockImplementation((p: string) => p);
  });

  it("throws for .git/hooks/pre-commit", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: ".git/hooks/pre-commit", content: "x", action: "create" }]),
    ).toThrow("refusing to write to sensitive path");
  });

  it("throws for .github/workflows/deploy.yml", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: ".github/workflows/deploy.yml", content: "x", action: "create" }]),
    ).toThrow("refusing to write to sensitive path");
  });

  it("throws for symlink that resolves into .git/hooks/", () => {
    // Simulate a safe-looking path that is actually a symlink pointing into .git
    fsMocks.realpathSync.mockImplementation((p: string) => {
      if (p === ROOT + "/safe-link") return ROOT + "/.git/hooks/pre-commit";
      return p;
    });

    expect(() =>
      writeFiles(ROOT, [{ path: "safe-link", content: "x", action: "create" }]),
    ).toThrow("refusing to write to sensitive path");
  });

  it("throws for package.json at repo root", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: "package.json", content: "{}", action: "create" }]),
    ).toThrow("refusing to write to sensitive path");
  });

  it("succeeds for nested/package.json (not root)", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: "nested/package.json", content: "{}", action: "create" }]),
    ).not.toThrow();
  });

  it("throws for .bashrc at repo root", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: ".bashrc", content: "export PATH=...", action: "create" }]),
    ).toThrow("refusing to write to sensitive path");
  });

  it("throws for .zshrc in a subdirectory", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: "home/.zshrc", content: "...", action: "create" }]),
    ).toThrow("refusing to write to sensitive path");
  });

  it("throws for .profile at repo root", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: ".profile", content: "...", action: "create" }]),
    ).toThrow("refusing to write to sensitive path");
  });

  it("throws for Makefile at repo root", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: "Makefile", content: "all:\n\techo hi", action: "create" }]),
    ).toThrow("refusing to write to sensitive path");
  });

  it("succeeds for Makefile in a subdirectory (not root)", () => {
    expect(() =>
      writeFiles(ROOT, [{ path: "scripts/Makefile", content: "all:\n\techo hi", action: "create" }]),
    ).not.toThrow();
  });
});

// ── commitFiles — git add uses spawnSync, git commit uses execFileSync ────────

describe("commitFiles — git add uses spawnSync, git commit uses execFileSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cpMocks.execFileSync.mockReturnValue(undefined);
  });

  it("calls spawnSync with 'git' and 'add' args", () => {
    commitFiles(ROOT, [{ path: "foo.md", content: "x", action: "create" }]);

    expect(cpMocks.spawnSync).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["add"]),
      expect.any(Object),
    );
  });

  it("returns false when spawnSync git add exits with non-zero status", () => {
    cpMocks.spawnSync.mockReturnValueOnce({ status: 1 });

    const result = commitFiles(ROOT, [{ path: "foo.md", content: "x", action: "create" }]);

    expect(result).toBe(false);
    expect(cpMocks.execFileSync).not.toHaveBeenCalled();
  });

  it("returns false when execFileSync git commit throws", () => {
    cpMocks.execFileSync.mockImplementationOnce(() => { throw new Error("commit failed"); });

    const result = commitFiles(ROOT, [{ path: "foo.md", content: "x", action: "create" }]);

    expect(result).toBe(false);
  });

  it("returns true on successful add and commit", () => {
    const result = commitFiles(ROOT, [{ path: "foo.md", content: "x", action: "create" }]);

    expect(result).toBe(true);
  });

  it("does not pass file paths to execFileSync via shell string (no 'git add' in execFileSync calls)", () => {
    commitFiles(ROOT, [{ path: "foo.md", content: "x", action: "create" }]);

    const addViaExec = (cpMocks.execFileSync.mock.calls as [string, string[]][]).find(
      ([cmd, args]) => cmd === "git" && Array.isArray(args) && args.includes("add"),
    );
    expect(addViaExec).toBeUndefined();
  });
});

// ── Dependency pinning ────────────────────────────────────────────────────────

describe("dependency pinning — runtime deps have no ^ prefix", () => {
  it("chalk, figlet, and ora are pinned to exact versions in package.json", async () => {
    const pkg = (await import("../../package.json")) as unknown as {
      default: { dependencies: Record<string, string> };
    };
    const { dependencies: deps } = pkg.default;

    expect(deps["chalk"]).not.toMatch(/^\^/);
    expect(deps["figlet"]).not.toMatch(/^\^/);
    expect(deps["ora"]).not.toMatch(/^\^/);
  });
});
