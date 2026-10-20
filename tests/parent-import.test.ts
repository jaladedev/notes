import { describe, expect, it } from "vitest";
import {
  findDuplicateParentRows,
  parseChildEmails,
  unresolvedChildren,
  validateParentRow,
} from "@/lib/parentImport";

describe("parseChildEmails", () => {
  it("splits on ; and |, trims, lower-cases, de-duplicates", () => {
    expect(parseChildEmails(" Ada@School.test ; tunde@school.test | ada@school.test ")).toEqual([
      "ada@school.test",
      "tunde@school.test",
    ]);
  });
  it("returns nothing for blank or missing cells", () => {
    expect(parseChildEmails("")).toEqual([]);
    expect(parseChildEmails("  ;  ; ")).toEqual([]);
    expect(parseChildEmails(undefined)).toEqual([]);
  });
});

describe("validateParentRow", () => {
  const ok = { fullName: "Mrs Obi", email: "obi@example.com", children: "ada@school.test" };
  it("accepts a good row, with or without children", () => {
    expect(validateParentRow(ok)).toBeNull();
    expect(validateParentRow({ fullName: "Mr X", email: "x@example.com" })).toBeNull();
  });
  it("requires a name and email", () => {
    expect(validateParentRow({ ...ok, fullName: " " })).toMatch(/Missing/);
    expect(validateParentRow({ ...ok, email: "" })).toMatch(/Missing/);
  });
  it("rejects malformed parent and child emails", () => {
    expect(validateParentRow({ ...ok, email: "not-an-email" })).toMatch(/valid email/);
    expect(validateParentRow({ ...ok, children: "ada@school.test; broken" })).toMatch(/Child "broken"/);
  });
  it("caps children per row", () => {
    const many = Array.from({ length: 11 }, (_, i) => `k${i}@s.test`).join(";");
    expect(validateParentRow({ ...ok, children: many })).toMatch(/at most 10/);
  });
  it("rejects a parent listing themself as a child", () => {
    expect(validateParentRow({ ...ok, children: "OBI@example.com" })).toMatch(/own child/);
  });
});

describe("findDuplicateParentRows", () => {
  it("flags later repeats (case-insensitive) and keeps the first", () => {
    const rows = [
      { fullName: "A", email: "a@x.test" },
      { fullName: "B", email: "b@x.test" },
      { fullName: "A again", email: "A@x.test" },
    ];
    expect([...findDuplicateParentRows(rows)]).toEqual([2]);
  });
  it("ignores blank emails", () => {
    expect(findDuplicateParentRows([{ fullName: "A", email: "" }, { fullName: "B", email: "" }]).size).toBe(0);
  });
});

describe("unresolvedChildren", () => {
  it("lists the child emails with no matching student", () => {
    expect(unresolvedChildren(["a@s.test", "ghost@s.test"], new Set(["a@s.test"]))).toEqual(["ghost@s.test"]);
  });
});
