import { describe, it, expect } from "vitest";
import {
  DEFAULT_STORE_FLOOR,
  READER_MIN_SCORE,
  getMatchStoreFloor,
  loadExistingScoreKeys,
  scoreKey,
  shouldStoreScore,
} from "@/lib/match-storage";

describe("getMatchStoreFloor", () => {
  it("defaults to the lowest score any screen reads", () => {
    expect(DEFAULT_STORE_FLOOR).toBe(READER_MIN_SCORE);
    expect(getMatchStoreFloor(undefined)).toBe(40);
    expect(getMatchStoreFloor("")).toBe(40);
    expect(getMatchStoreFloor("abc")).toBe(40);
  });

  it("honours a lower floor and 0 (store everything, the old behaviour)", () => {
    expect(getMatchStoreFloor("25")).toBe(25);
    expect(getMatchStoreFloor("0")).toBe(0);
    expect(getMatchStoreFloor("12.9")).toBe(12);
  });

  it("clamps to the reader minimum so a bad env var can never drop a displayed score", () => {
    expect(getMatchStoreFloor("90")).toBe(40);
    expect(getMatchStoreFloor("41")).toBe(40);
    expect(getMatchStoreFloor("-5")).toBe(0);
  });
});

describe("shouldStoreScore", () => {
  it("drops a NEW pair below the floor and keeps one at or above it", () => {
    expect(shouldStoreScore({ score: 39, alreadyStored: false, floor: 40 })).toBe(false);
    expect(shouldStoreScore({ score: 40, alreadyStored: false, floor: 40 })).toBe(true);
    expect(shouldStoreScore({ score: 92, alreadyStored: false, floor: 40 })).toBe(true);
  });

  it("always updates a pair that already has a row, so it can never go stale", () => {
    expect(shouldStoreScore({ score: 3, alreadyStored: true, floor: 40 })).toBe(true);
  });

  it("stores everything when the floor is 0", () => {
    expect(shouldStoreScore({ score: 0, alreadyStored: false, floor: 0 })).toBe(true);
  });

  it("falls back to the env/default floor when none is passed", () => {
    expect(shouldStoreScore({ score: 10, alreadyStored: false })).toBe(false);
  });
});

// A fake that behaves like PostgREST: honours .range() but never returns more
// than `serverCap` rows, silently truncating — the behaviour that broke only_unscored.
function fakeClient(rows: Array<{ job_post_id: string; job_seeker_id: string }>, serverCap: number, failOnCall?: number) {
  const requests: Array<{ seekers: string[]; from: number; to: number }> = [];
  let calls = 0;
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            in(_col: string, seekers: string[]) {
              return {
                order(_a: string) {
                  return {
                    order(_b: string) {
                      return {
                        async range(from: number, to: number) {
                          calls++;
                          requests.push({ seekers, from, to });
                          if (failOnCall && calls === failOnCall) return { data: null, error: { message: "db down" } };
                          const wanted = rows
                            .filter((r) => seekers.includes(r.job_seeker_id))
                            .sort((a, b) => a.job_post_id.localeCompare(b.job_post_id) || a.job_seeker_id.localeCompare(b.job_seeker_id));
                          return { data: wanted.slice(from, Math.min(to + 1, from + serverCap)), error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, requests };
}

const makeRows = (seekers: string[], posts: number) =>
  seekers.flatMap((s) => Array.from({ length: posts }, (_, i) => ({ job_seeker_id: s, job_post_id: `p${String(i).padStart(5, "0")}` })));

describe("loadExistingScoreKeys", () => {
  it("returns every existing pair past PostgREST's 1,000-row cap (the only_unscored bug)", async () => {
    const rows = makeRows(["a", "b"], 1250); // 2,500 rows
    const { client } = fakeClient(rows, 1000);
    const result = await loadExistingScoreKeys(client, ["a", "b"]);
    expect(result.complete).toBe(true);
    expect(result.keys.size).toBe(2500);
    expect(result.keys.has(scoreKey("a", "p00000"))).toBe(true);
    expect(result.keys.has(scoreKey("b", "p01249"))).toBe(true);
  });

  it("stays correct when the server cap is lower than the page size", async () => {
    const { client } = fakeClient(makeRows(["a"], 1800), 500);
    const result = await loadExistingScoreKeys(client, ["a"]);
    expect(result.complete).toBe(true);
    expect(result.keys.size).toBe(1800);
  });

  it("does not repeat or skip rows across pages", async () => {
    const { client, requests } = fakeClient(makeRows(["a"], 2200), 1000);
    await loadExistingScoreKeys(client, ["a"]);
    // 1000 + 1000 + 200, then an empty page ends the loop.
    expect(requests.map((r) => r.from)).toEqual([0, 1000, 2000, 2200]);
  });

  it("splits a large seeker list so the in(...) URL stays short", async () => {
    const seekers = Array.from({ length: 120 }, (_, i) => `s${i}`);
    const { client, requests } = fakeClient(makeRows(seekers.slice(0, 3), 5), 1000);
    const result = await loadExistingScoreKeys(client, seekers);
    expect(result.complete).toBe(true);
    const chunkSizes = Array.from(new Set(requests.map((r) => r.seekers.length)));
    expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(50);
    expect(result.keys.size).toBe(15);
  });

  it("reports an incomplete lookup (callers must then store everything) instead of guessing", async () => {
    const { client } = fakeClient(makeRows(["a"], 2500), 1000, 2); // second page fails
    const result = await loadExistingScoreKeys(client, ["a"]);
    expect(result.complete).toBe(false);
    expect(result.error).toBe("db down");
    expect(result.keys.size).toBe(1000); // what loaded before the failure
  });

  it("handles no seekers and no rows", async () => {
    const { client } = fakeClient([], 1000);
    expect(await loadExistingScoreKeys(client, [])).toEqual({ keys: new Set(), complete: true });
    expect((await loadExistingScoreKeys(client, ["a"])).keys.size).toBe(0);
  });
});
