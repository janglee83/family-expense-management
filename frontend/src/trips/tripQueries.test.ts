import { describe, expect, it } from "vitest";
import { tripKeys } from "./queries/tripKeys";

describe("tripKeys", () => {
  it("builds a list key scoped to the family", () => {
    expect(tripKeys.list("fam-1")).toEqual(["trips", "fam-1"]);
  });

  it("builds a detail key that is a prefix-descendant of the list key", () => {
    const listKey = tripKeys.list("fam-1");
    const detailKey = tripKeys.detail("fam-1", "trip-1");
    expect(detailKey.slice(0, listKey.length)).toEqual(listKey);
  });
});
