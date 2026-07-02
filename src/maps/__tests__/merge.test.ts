import { describe, expect, it } from "vitest";
import { upsertById } from "../merge";

interface Item {
  id: string;
  value: number;
}

describe("upsertById", () => {
  it("creates: an empty list plus one entry yields that entry", () => {
    expect(upsertById<Item>([], { id: "a", value: 1 })).toEqual([{ id: "a", value: 1 }]);
  });

  it("adds: a new id is appended after existing entries", () => {
    const existing: Item[] = [{ id: "a", value: 1 }, { id: "b", value: 2 }];
    expect(upsertById(existing, { id: "c", value: 3 })).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "c", value: 3 },
    ]);
  });

  it("replaces: an existing id updates in place, keeping its index", () => {
    const existing: Item[] = [{ id: "a", value: 1 }, { id: "b", value: 2 }, { id: "c", value: 3 }];
    const result = upsertById(existing, { id: "b", value: 99 });
    expect(result).toEqual([{ id: "a", value: 1 }, { id: "b", value: 99 }, { id: "c", value: 3 }]);
    expect(result.findIndex((x) => x.id === "b")).toBe(1); // same slot, not moved to the end
  });

  it("preserve-others: replacing one entry leaves every other entry byte-for-byte untouched", () => {
    const untouched: Item = { id: "a", value: 1 };
    const existing: Item[] = [untouched, { id: "b", value: 2 }];
    const result = upsertById(existing, { id: "b", value: 42 });
    expect(result[0]).toBe(untouched); // same object reference — not cloned/rebuilt
  });

  it("does not mutate the input array", () => {
    const existing: Item[] = [{ id: "a", value: 1 }];
    const frozen = Object.freeze([...existing]);
    expect(() => upsertById(frozen as Item[], { id: "a", value: 2 })).not.toThrow();
    expect(existing).toEqual([{ id: "a", value: 1 }]); // original untouched
  });

  it("re-exporting the same id twice is idempotent", () => {
    const once = upsertById<Item>([], { id: "a", value: 5 });
    const twice = upsertById(once, { id: "a", value: 5 });
    expect(twice).toEqual([{ id: "a", value: 5 }]);
  });
});
