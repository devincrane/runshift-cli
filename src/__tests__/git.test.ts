import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGitState } from "../context/git.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const cpMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => cpMocks);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getGitState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns isGitRepo: false when rev-parse throws (not a git repo)", () => {
    cpMocks.execFileSync.mockImplementationOnce(() => {
      throw new Error("not a git repository");
    });

    const state = getGitState();
    expect(state).toEqual({ isGitRepo: false, branch: "", isDirty: false });
  });

  it("returns correct branch name and isDirty: false for a clean repo", () => {
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("true"))    // rev-parse --is-inside-work-tree
      .mockReturnValueOnce(Buffer.from("main\n"))  // branch --show-current
      .mockReturnValueOnce(Buffer.from(""));        // status --porcelain (empty = clean)

    const state = getGitState();
    expect(state).toEqual({ isGitRepo: true, branch: "main", isDirty: false });
  });

  it("returns isDirty: true when git status --porcelain is non-empty", () => {
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("true"))
      .mockReturnValueOnce(Buffer.from("feature/xyz\n"))
      .mockReturnValueOnce(Buffer.from(" M src/foo.ts\n"));

    const state = getGitState();
    expect(state.isDirty).toBe(true);
    expect(state.branch).toBe("feature/xyz");
  });

  it("returns branch: 'unknown' when branch detection throws", () => {
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("true"))
      .mockImplementationOnce(() => { throw new Error("fatal: not a branch"); })
      .mockReturnValueOnce(Buffer.from(""));

    const state = getGitState();
    expect(state.isGitRepo).toBe(true);
    expect(state.branch).toBe("unknown");
    expect(state.isDirty).toBe(false);
  });

  it("returns isDirty: false when git status throws", () => {
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("true"))
      .mockReturnValueOnce(Buffer.from("main\n"))
      .mockImplementationOnce(() => { throw new Error("status failed"); });

    const state = getGitState();
    expect(state.isGitRepo).toBe(true);
    expect(state.isDirty).toBe(false);
  });

  it("trims trailing newline from branch name", () => {
    cpMocks.execFileSync
      .mockReturnValueOnce(Buffer.from("true"))
      .mockReturnValueOnce(Buffer.from("  main  \n"))
      .mockReturnValueOnce(Buffer.from(""));

    const state = getGitState();
    expect(state.branch).toBe("main");
  });
});
