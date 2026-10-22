import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signPlatformRequest } from "@/lib/platformAuth";

const SECRET = "k".repeat(40);

// Records what the routes ask the database to do; no real Supabase.
const calls: { table: string; op: string; args?: unknown }[] = [];
const state = { deleteRows: [{ id: "x" }] as { id: string }[] };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({
      data: [{ state: "active", academic_year: "2026/2027", starts_on: "2026-09-01", ends_on: "2027-07-31", days_left: 9 }],
      error: null,
    }),
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === "settings" ? { school_name: "Test School" } : { name: "0036_x.sql" } }),
        single: async () => ({ data: { id: "new-id" }, error: null }),
        insert: (args: unknown) => { calls.push({ table, op: "insert", args }); return chain; },
        delete: () => { calls.push({ table, op: "delete" }); return chain; },
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: calls.at(-1)?.op === "delete" ? state.deleteRows : [], count: 3, error: null }),
      };
      return chain;
    },
  }),
}));

import { GET as statusGET } from "@/app/api/platform/status/route";
import { DELETE, GET as subsGET, POST } from "@/app/api/platform/subscriptions/route";

function signed(method: string, path: string, body = "", secret = SECRET) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPlatformRequest({ secret, timestamp, method, pathAndQuery: path, body });
  return new NextRequest(`https://school.example${path}`, {
    method,
    body: body || undefined,
    headers: { "x-platform-timestamp": String(timestamp), "x-platform-signature": signature },
  });
}

beforeEach(() => {
  calls.length = 0;
  state.deleteRows = [{ id: "x" }];
  process.env.PLATFORM_SECRET = SECRET;
});

describe("platform API auth", () => {
  it("404s everything while PLATFORM_SECRET is unset", async () => {
    delete process.env.PLATFORM_SECRET;
    expect((await statusGET(signed("GET", "/api/platform/status"))).status).toBe(404);
    expect((await POST(signed("POST", "/api/platform/subscriptions", "{}"))).status).toBe(404);
  });
  it("401s an unsigned request and a request signed with the wrong secret", async () => {
    const unsigned = new NextRequest("https://school.example/api/platform/status");
    expect((await statusGET(unsigned)).status).toBe(401);
    expect((await statusGET(signed("GET", "/api/platform/status", "", "z".repeat(40)))).status).toBe(401);
  });
  it("never touches the database for a rejected request", async () => {
    await POST(new NextRequest("https://school.example/api/platform/subscriptions", { method: "POST", body: "{}" }));
    expect(calls).toHaveLength(0);
  });
});

describe("GET /api/platform/status", () => {
  it("returns the snapshot for a signed request", async () => {
    const res = await statusGET(signed("GET", "/api/platform/status"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.schoolName).toBe("Test School");
    expect(json.latestMigration).toBe("0036_x.sql");
    expect(json.subscription).toMatchObject({ state: "active", daysLeft: 9 });
    expect(json.activeUsers).toEqual({ admin: 3, teacher: 3, student: 3, parent: 3 });
  });
});

describe("/api/platform/subscriptions", () => {
  it("lists subscriptions", async () => {
    expect((await subsGET(signed("GET", "/api/platform/subscriptions"))).status).toBe(200);
  });
  it("adds a validated subscription", async () => {
    const body = JSON.stringify({ academicYear: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-07-31", note: "Paid" });
    const res = await POST(signed("POST", "/api/platform/subscriptions", body));
    expect(res.status).toBe(201);
    expect(calls.find((c) => c.op === "insert")?.args).toEqual({
      academic_year: "2026/2027", starts_on: "2026-09-01", ends_on: "2027-07-31", note: "Paid",
    });
  });
  it("400s a bad body without inserting", async () => {
    const bad = JSON.stringify({ academicYear: "2026/2027", startsOn: "2027-08-01", endsOn: "2027-07-31" });
    expect((await POST(signed("POST", "/api/platform/subscriptions", bad))).status).toBe(400);
    expect((await POST(signed("POST", "/api/platform/subscriptions", "not json"))).status).toBe(400);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });
  it("deletes by uuid, rejects a non-uuid, and 404s a missing id", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect((await DELETE(signed("DELETE", `/api/platform/subscriptions?id=${id}`))).status).toBe(200);
    expect((await DELETE(signed("DELETE", "/api/platform/subscriptions?id=1%27%20or%201=1"))).status).toBe(400);
    state.deleteRows = [];
    expect((await DELETE(signed("DELETE", `/api/platform/subscriptions?id=${id}`))).status).toBe(404);
  });
});
