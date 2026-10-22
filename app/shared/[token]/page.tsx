// New, not ported -- public, unauthenticated page for a share link
// (plan doc section 7). Deliberately outside /dashboard so it's exempt
// from middleware.ts's auth redirect (matcher only covers /dashboard
// and /login).

import { cookies } from "next/headers";
import { resolveShareLink } from "@/lib/actions/notes";
import { PROOF_COOKIE } from "@/lib/shareCode";
import { TopicContent } from "@/components/TopicContent";
import { AccessCodeForm } from "@/components/AccessCodeForm";

export default async function SharedTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { token } = await params;
  const { e } = await searchParams;

  // The access code is never read from the URL: it is POSTed to
  // unlockShareLink, which sets this httpOnly proof cookie.
  const proof = (await cookies()).get(PROOF_COOKIE)?.value;
  const result = await resolveShareLink(token, proof);

  if ("error" in result) {
    if (result.error === "needs_code") {
      return <AccessCodeForm token={token} error={e === "1" ? "wrong" : e === "wait" ? "wait" : undefined} />;
    }
    const message =
      result.error === "expired"
        ? "This link has expired."
        : "This link isn't valid — it may have been revoked.";
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-ink-soft">{message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <p className="mb-4 text-xs uppercase tracking-wide text-ink-soft">Shared note — read only</p>
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{result.topic.title}</h1>
      <TopicContent content={result.content} resources={result.resources} />
    </div>
  );
}
