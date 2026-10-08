import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage";

import { db, storage } from "./firebase";
import { toDate } from "./types";

/**
 * Task attachments, mirroring the Flutter app's `AttachmentService`.
 *
 * Metadata lives at `users/{uid}/tasks/{taskId}/attachments/{id}` and the file
 * at `users/{uid}/tasks/{taskId}/{id}` — the path `storage.rules` guards, so
 * ownership is decided by the path alone and never by client code.
 */

/** The largest file the Storage rules will accept. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export interface Attachment {
  id: string;
  taskId: string;
  /** Sanitised name used for storage and display. */
  fileName: string;
  /** Exactly what the file was called on the device it came from. */
  originalFileName: string;
  storagePath: string;
  downloadUrl: string;
  mimeType: string;
  fileSize: number;
  /** Images only; for now it is the image itself, as in the Flutter app. */
  thumbnailUrl: string | null;
  uploadedBy: string;
  createdAt: Date | null;
}

export function isImage(a: { mimeType: string }): boolean {
  return a.mimeType.startsWith("image/");
}
export function isVideo(a: { mimeType: string }): boolean {
  return a.mimeType.startsWith("video/");
}
export function isAudio(a: { mimeType: string }): boolean {
  return a.mimeType.startsWith("audio/");
}
export function isPdf(a: { mimeType: string }): boolean {
  return a.mimeType === "application/pdf";
}

/** "2.4 MB", for the file row in the task dialog. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The MIME types `storage.rules` accepts, by extension.
 *
 * The browser usually reports `file.type`, but it comes back empty for some
 * files on some platforms, and an empty type is rejected by the rules.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  bmp: "image/bmp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

export function mimeTypeFor(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/**
 * Strips characters that make for awkward storage object names.
 *
 * A name made only of separators sanitises to nothing meaningful, so those
 * fall back to a plain name rather than being shown as punctuation.
 */
export function sanitiseFileName(name: string): string {
  const cleaned = name.replace(/[^\w\s.-]/g, "_").trim();
  return /[a-zA-Z0-9]/.test(cleaned) ? cleaned : "file";
}

/** Mirrors `isAllowedType` in storage.rules, so the UI fails before uploading. */
export function isAllowedType(mimeType: string): boolean {
  return (
    /^image\//.test(mimeType) ||
    /^video\//.test(mimeType) ||
    /^audio\//.test(mimeType) ||
    Object.values(MIME_BY_EXTENSION).includes(mimeType)
  );
}

export class AttachmentTooLargeError extends Error {
  constructor(public readonly size: number) {
    super(`That file is ${(size / (1024 * 1024)).toFixed(1)} MB. The limit is 50 MB.`);
    this.name = "AttachmentTooLargeError";
  }
}

export class AttachmentTypeError extends Error {
  constructor(public readonly mimeType: string) {
    super("That kind of file cannot be attached.");
    this.name = "AttachmentTypeError";
  }
}

const attachmentsCollection = (uid: string, taskId: string) =>
  collection(db, "users", uid, "tasks", taskId, "attachments");

const taskRef = (uid: string, taskId: string) => doc(db, "users", uid, "tasks", taskId);

function mapAttachment(id: string, d: Record<string, unknown>): Attachment {
  return {
    id,
    taskId: (d.taskId as string) ?? "",
    fileName: (d.fileName as string) ?? "",
    originalFileName: (d.originalFileName as string) ?? (d.fileName as string) ?? "",
    storagePath: (d.storagePath as string) ?? "",
    downloadUrl: (d.downloadUrl as string) ?? "",
    mimeType: (d.mimeType as string) ?? "application/octet-stream",
    fileSize: (d.fileSize as number) ?? 0,
    thumbnailUrl: (d.thumbnailUrl as string | null) ?? null,
    uploadedBy: (d.uploadedBy as string) ?? "",
    createdAt: toDate(d.createdAt as never),
  };
}

function byCreatedAt(a: Attachment, b: Attachment): number {
  return +(a.createdAt ?? 0) - +(b.createdAt ?? 0);
}

/** Live attachments for one task. */
export function watchAttachments(
  uid: string,
  taskId: string,
  onChange: (items: Attachment[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    attachmentsCollection(uid, taskId),
    (snap) => {
      onChange(snap.docs.map((d) => mapAttachment(d.id, d.data())).sort(byCreatedAt));
    },
    (e) => onError?.(e),
  );
}

export interface UploadHandle {
  /** Resolves with the stored attachment, or rejects if it failed or was cancelled. */
  done: Promise<Attachment>;
  /** Aborts the transfer. `done` then rejects with a `storage/canceled` error. */
  cancel: () => void;
}

/**
 * Uploads one file, reporting progress as it goes.
 *
 * Returns a handle rather than a bare promise so the caller can cancel a
 * transfer that is still in flight, which section 7 of the brief requires.
 */
export function uploadAttachment(options: {
  uid: string;
  taskId: string;
  file: File;
  onProgress?: (fraction: number) => void;
}): UploadHandle {
  const { uid, taskId, file, onProgress } = options;
  const mimeType = mimeTypeFor(file);

  // Fail before touching the network, so the user gets the real reason rather
  // than an opaque permission error from the Storage rules.
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { done: Promise.reject(new AttachmentTooLargeError(file.size)), cancel: () => {} };
  }
  if (!isAllowedType(mimeType)) {
    return { done: Promise.reject(new AttachmentTypeError(mimeType)), cancel: () => {} };
  }

  const id = crypto.randomUUID();
  const safeName = sanitiseFileName(file.name);
  const storagePath = `users/${uid}/tasks/${taskId}/${id}`;

  const task: UploadTask = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: mimeType,
    customMetadata: { originalFileName: file.name, taskId },
  });

  const done = (async (): Promise<Attachment> => {
    await new Promise<void>((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          if (snap.totalBytes > 0) onProgress?.(snap.bytesTransferred / snap.totalBytes);
        },
        reject,
        resolve,
      );
    });

    const downloadUrl = await getDownloadURL(task.snapshot.ref);
    const createdAt = new Date();
    // Until a resizing Cloud Function exists, an image is its own thumbnail.
    const thumbnailUrl = mimeType.startsWith("image/") ? downloadUrl : null;

    await setDoc(doc(attachmentsCollection(uid, taskId), id), {
      taskId,
      fileName: safeName,
      originalFileName: file.name,
      storagePath,
      downloadUrl,
      mimeType,
      fileSize: file.size,
      thumbnailUrl,
      uploadedBy: uid,
      createdAt: Timestamp.fromDate(createdAt),
      updatedAt: serverTimestamp(),
    });

    await syncCount(uid, taskId);

    return {
      id,
      taskId,
      fileName: safeName,
      originalFileName: file.name,
      storagePath,
      downloadUrl,
      mimeType,
      fileSize: file.size,
      thumbnailUrl,
      uploadedBy: uid,
      createdAt,
    };
  })();

  return { done, cancel: () => task.cancel() };
}

/** Removes the metadata and the stored file together, so no orphan is left. */
export async function deleteAttachment(uid: string, attachment: Attachment): Promise<void> {
  await deleteDoc(doc(attachmentsCollection(uid, attachment.taskId), attachment.id));
  try {
    await deleteObject(ref(storage, attachment.storagePath));
  } catch (e) {
    // An already-missing object is fine; anything else is worth surfacing.
    if ((e as { code?: string }).code !== "storage/object-not-found") throw e;
  }
  await syncCount(uid, attachment.taskId);
}

/**
 * Writes the denormalised count and preview back onto the task.
 *
 * The board reads these so it never has to query each task's attachment
 * subcollection. The shape matches the Flutter app's `AttachmentPreview`
 * exactly, because that client reads the same field.
 */
async function syncCount(uid: string, taskId: string): Promise<void> {
  const snap = await getDocs(attachmentsCollection(uid, taskId));
  const items = snap.docs.map((d) => mapAttachment(d.id, d.data())).sort(byCreatedAt);

  // Prefer an image, so a task with a PDF and a photo shows the photo.
  const preview = items.find(isImage) ?? items[0];

  await updateDoc(taskRef(uid, taskId), {
    attachmentCount: items.length,
    attachmentPreview: preview
      ? {
          mimeType: preview.mimeType,
          thumbnailUrl: preview.thumbnailUrl,
          fileName: preview.originalFileName,
        }
      : null,
    updatedAt: serverTimestamp(),
  });
}
