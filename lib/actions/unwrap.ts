// Client-safe companion to lib/actions/result.ts. Kept in its own file
// (type-only import) so client components can use it without pulling the
// server logger that result.ts imports into the browser bundle.
//
// For client flows that are already written as "try { ... } catch (err)
// { toast(err.message) }" and chain several steps (the note editor's
// create-then-upload sequence, a diff view that loads two versions):
// unwrap() turns a failed ActionResult back into a thrown Error *on the
// client*, where the message survives (Next.js only scrubs errors thrown
// across the server-action boundary), so the existing catch blocks keep
// working unchanged.

import type { ActionResult } from "@/lib/actions/result";

export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
