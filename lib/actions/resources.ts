"use server";

// Ported from jaladedev/school_app (lib/actions/teacher.ts, lines 944-1380)
// at clone SHA 466c538. Video/link/mermaid resource variants are dropped
// for the v1 cut (file upload only) -- see plan doc section 3. Ownership
// check (assertTeacherOwnsTopic) is remapped from subjects_taught to
// space membership.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { TOPIC_RESOURCE_BUCKET } from "@/lib/storageBuckets";
import type { ResourceType } from "@/types/database";

const MAX_TOPIC_RESOURCE_BYTES = 20 * 1024 * 1024;
const RESOURCE_TYPES = new Map<string, Extract<ResourceType, "image" | "pdf" | "audio" | "video">>([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["application/pdf", "pdf"],
  ["audio/mpeg", "audio"],
  ["audio/wav", "audio"],
  ["audio/ogg", "audio"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
]);

async function assertTeacherOwnsTopic(
  supabase: ReturnType<typeof createClient>,
  topicId: string
) {
  const { data: topic } = await supabase
    .from("topics")
    .select("space_id")
    .eq("id", topicId)
    .single();
  if (!topic) throw new Error("Topic not found.");
  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);
  return topic;
}

export async function uploadTopicResource(topicId: string, noteId: string, formData: FormData) {
  const { id: teacherId } = await requireUser();

  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  if (!(file instanceof File) || !file.size) throw new Error("Choose a file to upload.");
  if (file.size > MAX_TOPIC_RESOURCE_BYTES) throw new Error("Resources must be 20 MB or smaller.");
  const resourceType = RESOURCE_TYPES.get(file.type);
  if (!resourceType)
    throw new Error("Use an image, PDF, MP3/WAV/OGG audio, or MP4/WebM video file.");

  const supabase = createClient();
  await assertTeacherOwnsTopic(supabase, topicId);

  const admin = createAdminClient();
  const { error: bucketError } = await admin.storage.createBucket(TOPIC_RESOURCE_BUCKET, {
    public: false,
    fileSizeLimit: `${MAX_TOPIC_RESOURCE_BYTES}`,
    allowedMimeTypes: [...RESOURCE_TYPES.keys()],
  });
  if (bucketError && !/already exists/i.test(bucketError.message)) throwDbError(bucketError);

  const extension =
    file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "file";
  // Per-topic path prefix. There's no cross-school bucket to collide
  // with (each school has its own project/bucket -- plan doc section 6),
  // so this only needs to be unique within one school.
  const objectPath = `${topicId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from(TOPIC_RESOURCE_BUCKET)
    .upload(objectPath, file, { contentType: file.type });
  if (uploadError) throwDbError(uploadError);

  const { data: latestResource } = await admin
    .from("topic_resources")
    .select("sequence_order")
    .eq("topic_id", topicId)
    .order("sequence_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error: insertError } = await admin
    .from("topic_resources")
    .insert({
      topic_id: topicId,
      note_id: noteId,
      resource_type: resourceType,
      title: title || file.name,
      file_url: objectPath,
      sequence_order: (latestResource?.sequence_order ?? 0) + 1,
      uploaded_by: teacherId,
    })
    .select()
    .single();
  if (insertError) {
    await admin.storage.from(TOPIC_RESOURCE_BUCKET).remove([objectPath]);
    throwDbError(insertError);
  }

  revalidatePath(`/dashboard/teacher/notes/${topicId}`);
  revalidatePath(`/dashboard/student/topics/${topicId}`);

  // Sign before returning -- this goes straight into the editor's live
  // resource list and renders immediately (see upstream comment).
  const { data: signed } = await admin.storage
    .from(TOPIC_RESOURCE_BUCKET)
    .createSignedUrl(objectPath, 6 * 60 * 60);
  return { ...inserted, file_url: signed?.signedUrl ?? inserted.file_url };
}

export async function updateTopicResource(resourceId: string, formData: FormData) {
  await requireUser();
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("topic_resources")
    .select("id, topic_id, resource_type, file_url")
    .eq("id", resourceId)
    .single();
  if (!existing) throw new Error("Resource not found.");

  await assertTeacherOwnsTopic(supabase, existing.topic_id);

  const titleRaw = formData.get("title");
  const title = typeof titleRaw === "string" ? titleRaw.trim() : undefined;
  const file = formData.get("file");

  const update: Record<string, unknown> = {};
  if (title !== undefined) update.title = title || null;

  const admin = createAdminClient();
  let newObjectPath: string | null = null;

  if (file instanceof File && file.size) {
    if (file.size > MAX_TOPIC_RESOURCE_BYTES)
      throw new Error("Resources must be 20 MB or smaller.");
    const resourceType = RESOURCE_TYPES.get(file.type);
    if (!resourceType)
      throw new Error("Use an image, PDF, MP3/WAV/OGG audio, or MP4/WebM video file.");

    const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "file";
    newObjectPath = `${existing.topic_id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from(TOPIC_RESOURCE_BUCKET)
      .upload(newObjectPath, file, { contentType: file.type });
    if (uploadError) throwDbError(uploadError);

    update.resource_type = resourceType;
    update.file_url = newObjectPath;
  }

  if (Object.keys(update).length === 0) {
    throw new Error("Nothing to update — give a new title or file.");
  }

  const { data: resource, error } = await supabase
    .from("topic_resources")
    .update(update as any)
    .eq("id", resourceId)
    .select("*")
    .single();

  if (error) {
    if (newObjectPath) await admin.storage.from(TOPIC_RESOURCE_BUCKET).remove([newObjectPath]);
    throwDbError(error);
  }

  if (newObjectPath && existing.file_url) {
    await admin.storage.from(TOPIC_RESOURCE_BUCKET).remove([existing.file_url]);
  }

  revalidatePath(`/dashboard/teacher/notes/${existing.topic_id}`);
  revalidatePath(`/dashboard/student/topics/${existing.topic_id}`);

  if (newObjectPath) {
    const { data: signed } = await admin.storage
      .from(TOPIC_RESOURCE_BUCKET)
      .createSignedUrl(newObjectPath, 6 * 60 * 60);
    return { ...resource, file_url: signed?.signedUrl ?? resource.file_url };
  }
  return resource;
}

/**
 * Hard-deletes the storage object. This is safe here in a way it would
 * NOT have been under a shared multi-tenant bucket: with one bucket per
 * school (plan doc section 6), there is no path any other school's
 * content could be sharing.
 */
export async function deleteTopicResource(resourceId: string) {
  await requireUser();
  const supabase = createClient();

  const { data: resource } = await supabase
    .from("topic_resources")
    .select("id, file_url, topic_id")
    .eq("id", resourceId)
    .single();
  if (!resource) throw new Error("Resource not found.");

  await assertTeacherOwnsTopic(supabase, resource.topic_id);

  const admin = createAdminClient();
  if (resource.file_url) {
    await admin.storage.from(TOPIC_RESOURCE_BUCKET).remove([resource.file_url]);
  }

  const { error: deleteError } = await admin.from("topic_resources").delete().eq("id", resourceId);
  if (deleteError) throwDbError(deleteError);

  revalidatePath(`/dashboard/teacher/notes/${resource.topic_id}`);
  revalidatePath(`/dashboard/student/topics/${resource.topic_id}`);
}

// ---------- Video embed, link preview, and Mermaid diagram resources ----------
// Ported from teacher.ts lines 1024-1252. Ownership check remapped to
// assertTeacherOwnsTopic (space-scoped) same as the rest of this file.

import { videoEmbedUrl } from "@/lib/video-embed";
import { fetchLinkMetadata } from "@/lib/linkPreview";

export async function createVideoEmbedResource(
  topicId: string,
  noteId: string,
  url: string,
  title: string
) {
  const { id: teacherId } = await requireUser();
  const trimmedUrl = url.trim();
  if (!videoEmbedUrl(trimmedUrl)) throw new Error("Use a valid YouTube or Vimeo HTTPS URL.");
  const supabase = createClient();
  await assertTeacherOwnsTopic(supabase, topicId);

  const { data: latest } = await supabase
    .from("topic_resources")
    .select("sequence_order")
    .eq("topic_id", topicId)
    .order("sequence_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("topic_resources")
    .insert({
      topic_id: topicId,
      note_id: noteId,
      resource_type: "link",
      title: title.trim() || "Embedded video",
      content: trimmedUrl,
      sequence_order: (latest?.sequence_order ?? 0) + 1,
      uploaded_by: teacherId,
    })
    .select()
    .single();
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/notes/${topicId}`);
  revalidatePath(`/dashboard/student/topics/${topicId}`);
  return data;
}

// A generic link preview visits the page for og:title/description/image
// (SSRF-guarded, see lib/linkPreview.ts), unlike createVideoEmbedResource
// which only needs client-side URL pattern matching.
export async function createLinkResource(topicId: string, noteId: string, url: string) {
  const { id: teacherId } = await requireUser();
  const supabase = createClient();
  await assertTeacherOwnsTopic(supabase, topicId);

  const metadata = await fetchLinkMetadata(url.trim());

  const { data: latest } = await supabase
    .from("topic_resources")
    .select("sequence_order")
    .eq("topic_id", topicId)
    .order("sequence_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("topic_resources")
    .insert({
      topic_id: topicId,
      note_id: noteId,
      resource_type: "link",
      title: metadata.title,
      content: url.trim(),
      file_url: metadata.image,
      description: metadata.description,
      sequence_order: (latest?.sequence_order ?? 0) + 1,
      uploaded_by: teacherId,
    })
    .select()
    .single();
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/notes/${topicId}`);
  revalidatePath(`/dashboard/student/topics/${topicId}`);
  return data;
}

/** Re-fetches og:title/description/image for an existing `link` resource, same id. */
export async function refreshLinkPreview(resourceId: string) {
  await requireUser();
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("topic_resources")
    .select("id, topic_id, resource_type, content")
    .eq("id", resourceId)
    .single();

  if (!existing) throw new Error("Resource not found.");
  if (existing.resource_type !== "link") {
    throw new Error("Only link resources can be refreshed this way.");
  }
  if (!existing.content) throw new Error("This link has no URL to refresh from.");

  await assertTeacherOwnsTopic(supabase, existing.topic_id);

  const metadata = await fetchLinkMetadata(existing.content);

  const { data: resource, error } = await supabase
    .from("topic_resources")
    .update({
      title: metadata.title,
      description: metadata.description,
      file_url: metadata.image,
    })
    .eq("id", resourceId)
    .select("*")
    .single();

  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/notes/${existing.topic_id}`);
  revalidatePath(`/dashboard/student/topics/${existing.topic_id}`);
  return resource;
}

export async function createMermaidResource(
  topicId: string,
  noteId: string,
  title: string,
  mermaidCode: string
) {
  const { id: teacherId } = await requireUser();
  const trimmedCode = mermaidCode.trim();
  if (!trimmedCode) {
    throw new Error("The diagram is empty — write some Mermaid code first.");
  }
  const supabase = createClient();
  await assertTeacherOwnsTopic(supabase, topicId);

  const { data: latestResource } = await supabase
    .from("topic_resources")
    .select("sequence_order")
    .eq("topic_id", topicId)
    .order("sequence_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: resource, error } = await supabase
    .from("topic_resources")
    .insert({
      topic_id: topicId,
      note_id: noteId,
      resource_type: "diagram_mermaid",
      title: title.trim() || "Diagram",
      content: trimmedCode,
      file_url: null,
      sequence_order: (latestResource?.sequence_order ?? 0) + 1,
      uploaded_by: teacherId,
    })
    .select("*")
    .single();

  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/notes/${topicId}`);
  revalidatePath(`/dashboard/student/topics/${topicId}`);
  return resource;
}

// Edits an existing diagram in place (same resource id) -- any
// [[resource:ID]] marker pointing at it keeps resolving.
export async function updateMermaidResource(
  resourceId: string,
  title: string,
  mermaidCode: string
) {
  await requireUser();
  const trimmedCode = mermaidCode.trim();
  if (!trimmedCode) {
    throw new Error("The diagram is empty — write some Mermaid code first.");
  }
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("topic_resources")
    .select("id, topic_id, resource_type")
    .eq("id", resourceId)
    .single();

  if (!existing) throw new Error("Diagram not found.");
  if (existing.resource_type !== "diagram_mermaid") {
    throw new Error("Only Mermaid diagrams can be edited this way.");
  }

  await assertTeacherOwnsTopic(supabase, existing.topic_id);

  const { data: resource, error } = await supabase
    .from("topic_resources")
    .update({
      title: title.trim() || "Diagram",
      content: trimmedCode,
    })
    .eq("id", resourceId)
    .select("*")
    .single();

  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/notes/${existing.topic_id}`);
  revalidatePath(`/dashboard/student/topics/${existing.topic_id}`);
  return resource;
}
