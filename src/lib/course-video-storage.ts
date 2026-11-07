import { Upload } from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

export const COURSE_VIDEO_BUCKET = "course-videos";
const configuredMaxSizeMib = Number(import.meta.env["VITE_COURSE_VIDEO_MAX_SIZE_MIB"]);
export const COURSE_VIDEO_MAX_SIZE_MIB =
  Number.isSafeInteger(configuredMaxSizeMib) && configuredMaxSizeMib > 0
    ? configuredMaxSizeMib
    : 50;
export const COURSE_VIDEO_MAX_SIZE_BYTES = COURSE_VIDEO_MAX_SIZE_MIB * 1024 * 1024;

const MIME_TYPES = new Set(["video/mp4", "video/webm"]);

export function isCourseVideoPath(path: string): boolean {
  return path.startsWith(`${COURSE_VIDEO_BUCKET}/courses/`);
}

export function getCourseVideoObjectPath(path: string): string {
  if (!isCourseVideoPath(path)) {
    throw new Error("Invalid course video storage path.");
  }
  return path.slice(COURSE_VIDEO_BUCKET.length + 1);
}

export function getCourseVideoFilename(path: string): string {
  const objectPath = getCourseVideoObjectPath(path);
  const name = objectPath.split("/").at(-1);
  return name || "Uploaded video";
}

export function validateCourseVideo(file: File): string | null {
  if (!MIME_TYPES.has(file.type)) {
    return "Choose an MP4 or WebM video file.";
  }
  if (file.size === 0) {
    return "The selected video file is empty.";
  }
  if (file.size > COURSE_VIDEO_MAX_SIZE_BYTES) {
    return `The video exceeds the ${COURSE_VIDEO_MAX_SIZE_MIB} MiB upload limit.`;
  }
  return null;
}

function safeFilename(name: string) {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  const cleaned = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "lesson-video";
}

export async function uploadCourseVideo(
  file: File,
  courseId: string,
  sectionId: string,
  onProgress: (percentage: number) => void,
): Promise<string> {
  const validationError = validateCourseVideo(file);
  if (validationError) throw new Error(validationError);

  const [{ data: sessionData, error: sessionError }, url, key] = [
    await supabase.auth.getSession(),
    import.meta.env["VITE_SUPABASE_URL"],
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
  ] as const;
  if (sessionError) throw new Error(sessionError.message);
  if (!sessionData.session?.access_token) {
    throw new Error("Sign in again before uploading a course video.");
  }
  if (!url || !key) {
    throw new Error("Supabase Storage is not configured for video uploads.");
  }

  const extension = file.type === "video/webm" ? "webm" : "mp4";
  let objectPath = `courses/${courseId}/${sectionId}/${crypto.randomUUID()}/${safeFilename(file.name)}.${extension}`;
  const upload = new Upload(file, {
    endpoint: `${url.replace(/\/+$/, "")}/storage/v1/upload/resumable`,
    headers: {
      authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: key,
      "x-upsert": "false",
    },
    metadata: {
      bucketName: COURSE_VIDEO_BUCKET,
      objectName: objectPath,
      contentType: file.type,
      cacheControl: "3600",
    },
    chunkSize: 6 * 1024 * 1024,
    retryDelays: [0, 3000, 5000, 10000, 20000],
    onProgress: (bytesSent, bytesTotal) => {
      onProgress(Math.min(100, Math.round((bytesSent / bytesTotal) * 100)));
    },
  });

  const previousUploads = await upload.findPreviousUploads();
  const previousUpload = previousUploads.find(
    (previous) =>
      previous.metadata["bucketName"] === COURSE_VIDEO_BUCKET &&
      previous.metadata["contentType"] === file.type &&
      previous.metadata["objectName"]?.startsWith("courses/"),
  );
  if (previousUpload?.metadata["objectName"]) {
    objectPath = previousUpload.metadata["objectName"];
    upload.resumeFromPreviousUpload(previousUpload);
  }

  await new Promise<void>((resolve, reject) => {
    upload.options.onError = (error) => reject(error);
    upload.options.onSuccess = () => resolve();
    upload.start();
  });

  return `${COURSE_VIDEO_BUCKET}/${objectPath}`;
}
