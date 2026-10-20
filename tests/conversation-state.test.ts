import { describe, expect, it } from "vitest";
import { conversationBucket, isMessageVisible, latestVisible } from "@/lib/conversationState";

const none = { archived_at: null, deleted_at: null };

describe("conversationBucket", () => {
  it("is inbox by default", () => {
    expect(conversationBucket(none, "2026-10-01T10:00:00Z")).toBe("inbox");
    expect(conversationBucket(none, null)).toBe("inbox");
  });
  it("is archived when archived", () => {
    expect(conversationBucket({ archived_at: "2026-10-02T00:00:00Z", deleted_at: null }, "2026-10-01T10:00:00Z")).toBe("archived");
  });
  it("is hidden once deleted and nothing newer has arrived", () => {
    const m = { archived_at: null, deleted_at: "2026-10-03T00:00:00Z" };
    expect(conversationBucket(m, "2026-10-02T10:00:00Z")).toBe("hidden");
    expect(conversationBucket(m, null)).toBe("hidden");
    expect(conversationBucket(m, "2026-10-03T00:00:00Z")).toBe("hidden"); // not strictly newer
  });
  it("comes back when a message arrives after the deletion", () => {
    const m = { archived_at: null, deleted_at: "2026-10-03T00:00:00Z" };
    expect(conversationBucket(m, "2026-10-04T09:00:00Z")).toBe("inbox");
  });
});

describe("message visibility after deletion", () => {
  it("shows everything when never deleted", () => {
    expect(isMessageVisible("2020-01-01T00:00:00Z", null)).toBe(true);
  });
  it("hides messages at or before the deletion and shows later ones", () => {
    expect(isMessageVisible("2026-10-03T00:00:00Z", "2026-10-03T00:00:00Z")).toBe(false);
    expect(isMessageVisible("2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z")).toBe(false);
    expect(isMessageVisible("2026-10-03T00:00:01Z", "2026-10-03T00:00:00Z")).toBe(true);
  });
  it("finds the latest message the member can still see", () => {
    const msgs = [
      { id: "old", created_at: "2026-10-01T00:00:00Z" },
      { id: "new", created_at: "2026-10-05T00:00:00Z" },
    ];
    expect(latestVisible(msgs, null)?.id).toBe("new");
    expect(latestVisible(msgs, "2026-10-02T00:00:00Z")?.id).toBe("new");
    expect(latestVisible(msgs, "2026-10-06T00:00:00Z")).toBeNull();
  });
});
