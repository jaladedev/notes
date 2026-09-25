"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  renameSpace,
  deleteSpace,
  addSpaceMember,
  removeSpaceMember,
  createTopic,
  renameTopic,
  deleteTopic,
  setSpaceClass,
} from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

type Member = { profile_id: string; role: string; profiles: { full_name: string } | null };
type Topic = { id: string; title: string; week_number: number | null };
type CurriculumInfo = {
  subjectName: string | null;
  educationLevel: string | null;
  levelNumber: number | null;
  academicYear: string | null;
  term: number | null;
} | null;

export function SpaceSettingsPanel({
  spaceId,
  spaceName,
  members,
  topics,
  curriculum,
  classes = [],
  currentClassId = null,
}: {
  spaceId: string;
  spaceName: string;
  members: Member[];
  topics: Topic[];
  curriculum?: CurriculumInfo;
  classes?: { id: string; name: string }[];
  currentClassId?: string | null;
}) {
  const router = useRouter();
  const [classId, setClassId] = useState(currentClassId ?? "");
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(spaceName);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicWeek, setNewTopicWeek] = useState<string>("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"teacher" | "reviewer" | "admin" | "student">(
    "teacher"
  );

  function run(action: () => Promise<unknown>, failMessage: string) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : failMessage, "error");
      }
    });
  }

  return (
    <div className="space-y-6">
      {curriculum && curriculum.subjectName && (
        <section className="rounded-xl border border-rule bg-paper p-4 text-sm text-ink-soft">
          <span className="font-medium text-ink">{curriculum.subjectName}</span> ·{" "}
          {curriculum.educationLevel}
          {curriculum.levelNumber} · {curriculum.academicYear} · Term {curriculum.term}
        </section>
      )}

      <section className="rounded-xl border border-rule bg-white p-4">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Class</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Linking a class means every student in that class&apos;s roster can read this space —
          no need to add them individually below.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => setSpaceClass(spaceId, classId || null),
              "Couldn't update the linked class."
            );
          }}
          className="flex gap-2"
        >
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            title="Class whose roster can read this space"
            className="flex-1 rounded-lg border border-rule bg-white px-3 py-2 text-sm"
          >
            <option value="">No class linked</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg border border-rule px-3 py-2 text-sm hover:bg-paper disabled:opacity-60"
          >
            Save
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-rule bg-white p-4">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Space name</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => renameSpace(spaceId, name), "Couldn't rename the space.");
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            title="Space name"
            className="flex-1 rounded-lg border border-rule bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isPending}
            title="Save the new space name"
            className="rounded-lg border border-rule px-3 py-2 text-sm hover:bg-paper disabled:opacity-60"
          >
            Save
          </button>
        </form>
        <button
          type="button"
          disabled={isPending}
          title="Permanently delete this space and everything in it"
          onClick={() => {
            if (!confirm(`Delete "${spaceName}"? This deletes every topic and note in it.`)) return;
            run(async () => {
              await deleteSpace(spaceId);
              router.push("/dashboard/admin/spaces");
            }, "Couldn't delete the space.");
          }}
          className="mt-3 text-xs font-medium text-clay hover:underline"
        >
          Delete this space
        </button>
      </section>

      <section className="rounded-xl border border-rule bg-white p-4">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Members</h2>
        <ul className="mb-3 space-y-1">
          {members.map((m) => (
            <li
              key={m.profile_id}
              className="flex items-center justify-between rounded-md bg-paper px-3 py-1.5 text-sm"
            >
              <span>
                {m.profiles?.full_name ?? m.profile_id}{" "}
                <span className="text-xs uppercase tracking-wide text-ink-soft">{m.role}</span>
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => removeSpaceMember(spaceId, m.profile_id), "Couldn't remove that member.")}
                title={`Remove ${m.profiles?.full_name ?? "this member"} from the space`}
                className="text-xs font-medium text-clay hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await addSpaceMember(spaceId, memberEmail, memberRole);
              setMemberEmail("");
            }, "Couldn't add that member.");
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            type="email"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            placeholder="colleague@example.com"
            title="Email of the existing account to add"
            className="flex-1 rounded-lg border border-rule bg-white px-3 py-2 text-sm"
          />
          <select
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value as typeof memberRole)}
            title="Role to grant this member in the space"
            className="rounded-lg border border-rule bg-white px-2 py-2 text-sm"
          >
            <option value="teacher">Teacher</option>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
            <option value="student">Student</option>
          </select>
          <button
            type="submit"
            disabled={isPending || !memberEmail.trim()}
            className="rounded-lg bg-marigold px-3 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
          >
            Add
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-soft">
          They need an existing account (signed up via /login flow isn&apos;t built yet — create
          their account in the Supabase dashboard first; see README).
        </p>
      </section>

      <section className="rounded-xl border border-rule bg-white p-4">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Topics</h2>
        <ul className="mb-3 space-y-1">
          {topics.map((t) => (
            <TopicRow key={t.id} topic={t} isPending={isPending} run={run} />
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await createTopic(
                spaceId,
                newTopicTitle,
                newTopicWeek ? Number(newTopicWeek) : undefined
              );
              setNewTopicTitle("");
              setNewTopicWeek("");
            }, "Couldn't create that topic.");
          }}
          className="flex gap-2"
        >
          <input
            value={newTopicTitle}
            onChange={(e) => setNewTopicTitle(e.target.value)}
            placeholder="New topic title"
            title="Title for the new topic"
            className="flex-1 rounded-lg border border-rule bg-white px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={13}
            value={newTopicWeek}
            onChange={(e) => setNewTopicWeek(e.target.value)}
            placeholder="Wk"
            title="Week number (optional, for display/ordering only)"
            className="w-16 rounded-lg border border-rule bg-white px-2 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isPending || !newTopicTitle.trim()}
            className="rounded-lg bg-marigold px-3 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
          >
            Add topic
          </button>
        </form>
      </section>
    </div>
  );
}

function TopicRow({
  topic,
  isPending,
  run,
}: {
  topic: Topic;
  isPending: boolean;
  run: (action: () => Promise<unknown>, failMessage: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);

  if (editing) {
    return (
      <li className="flex items-center gap-2 rounded-md bg-paper px-3 py-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded border border-rule bg-white px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(async () => {
              await renameTopic(topic.id, title);
              setEditing(false);
            }, "Couldn't rename that topic.")
          }
          className="text-xs font-medium text-leaf hover:underline"
        >
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-soft hover:underline">
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded-md bg-paper px-3 py-1.5 text-sm">
      <span>
        {topic.week_number && (
          <span className="mr-2 text-xs uppercase tracking-wide text-ink-soft">
            Wk {topic.week_number}
          </span>
        )}
        {topic.title}
      </span>
      <span className="flex gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-ink-soft hover:underline">
          Rename
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!confirm(`Delete "${topic.title}"? This deletes all its notes and resources.`)) return;
            run(() => deleteTopic(topic.id), "Couldn't delete that topic.");
          }}
          className="text-xs font-medium text-clay hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </span>
    </li>
  );
}
