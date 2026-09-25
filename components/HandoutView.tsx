// Ported from jaladedev/school_app's components/HandoutView.tsx (SHA
// 466c538). topicMeta is generalized: school_app's version shows
// subject/level/term/week (formatLevel, EducationLevel) which don't
// exist in this app's data model -- replaced with a plain space name
// and optional subtitle line the caller composes however it likes.

import { TopicContent, type LinkedTopic } from "@/components/TopicContent";
import { PrintButton } from "@/components/PrintButton";
import type { TopicResource } from "@/types/database";

export function HandoutView({
  content,
  resources,
  topics = [],
  topicMeta,
}: {
  content: string;
  resources: TopicResource[];
  topics?: LinkedTopic[];
  topicMeta?: {
    title: string;
    subtitle?: string | null; // e.g. space name, or "Space Name · 22 Sep 2026"
  };
}) {
  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-ink-soft">
          Printable version — resource embeds, math, and links render the same as the note itself.
        </p>
        <PrintButton />
      </div>
      <div className="rounded-2xl border border-rule bg-white p-4 sm:p-8 print:border-0 print:p-0 print:shadow-none">
        {topicMeta && (
          <div className="mb-6 border-b-2 border-ink pb-4">
            <h1 className="font-display text-2xl font-semibold text-ink">{topicMeta.title}</h1>
            {topicMeta.subtitle && (
              <p className="mt-1 text-sm text-ink-soft">{topicMeta.subtitle}</p>
            )}
          </div>
        )}
        <TopicContent content={content} resources={resources} linkedTopics={topics} />
      </div>
    </div>
  );
}
