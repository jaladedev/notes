// New, not ported -- public, unauthenticated page for a share link
// (plan doc section 7). Deliberately outside /dashboard so it's exempt
// from middleware.ts's auth redirect (matcher only covers /dashboard
// and /login).

import { resolveShareLink } from "@/lib/actions/notes";
import { TopicContent } from "@/components/TopicContent";
import { AccessCodeForm } from "@/components/AccessCodeForm";

export default async function SharedTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { token } = await params;
  const { code } = await searchParams;

  const result = await resolveShareLink(token, code);

  if ("error" in result) {
    if (result.error === "needs_code") {
      return <AccessCodeForm />;
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
