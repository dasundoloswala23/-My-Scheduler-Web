"use client";

import {
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Paperclip,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteAttachment,
  isAudio,
  isImage,
  isPdf,
  isVideo,
  readableSize,
  uploadAttachment,
  watchAttachments,
  type Attachment,
  type UploadHandle,
} from "@/lib/attachments";
import { useAuth } from "@/lib/auth-context";

/** A transfer in flight, or one that failed and can be retried. */
interface Pending {
  id: string;
  file: File;
  progress: number;
  error: string | null;
  handle: UploadHandle | null;
}

/**
 * Attachments for one task: upload with progress, cancel, retry and delete,
 * image thumbnails with a click-to-open viewer, and typed icons for everything
 * else.
 */
export function AttachmentSection({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    return watchAttachments(
      user.uid,
      taskId,
      (next) => {
        setItems(next);
        setLoaded(true);
      },
      (e) => {
        setLoadError(e.message);
        setLoaded(true);
      },
    );
  }, [user, taskId]);

  function start(file: File) {
    if (!user) return;
    const id = crypto.randomUUID();

    const handle = uploadAttachment({
      uid: user.uid,
      taskId,
      file,
      onProgress: (fraction) =>
        setPending((p) => p.map((x) => (x.id === id ? { ...x, progress: fraction } : x))),
    });

    setPending((p) => [...p, { id, file, progress: 0, error: null, handle }]);

    handle.done
      .then(() => setPending((p) => p.filter((x) => x.id !== id)))
      .catch((e: unknown) => {
        const code = (e as { code?: string }).code;
        // A cancel is a deliberate act, not a failure to report.
        if (code === "storage/canceled") {
          setPending((p) => p.filter((x) => x.id !== id));
          return;
        }
        const message = e instanceof Error ? e.message : "Upload failed.";
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error: message } : x)));
      });
  }

  function onPick(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) start(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(attachment: Attachment) {
    if (!user) return;
    if (!window.confirm(`Delete "${attachment.originalFileName}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteAttachment(user.uid, attachment);
      toast.success("Attachment deleted");
    } catch {
      toast.error("Could not delete that attachment. Please try again.");
    }
  }

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-bold">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          {items.length > 0 && <span className="text-muted">({items.length})</span>}
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-semibold"
        >
          <Upload className="h-3.5 w-3.5" /> Add file
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {loadError && (
        <p className="rounded-lg border border-line px-3 py-2 text-[12.5px] text-danger">
          Could not load attachments. {loadError}
        </p>
      )}

      {!loaded && !loadError && (
        <p className="text-[12.5px] text-muted">Loading attachments…</p>
      )}

      {loaded && !loadError && items.length === 0 && pending.length === 0 && (
        <p className="text-[12.5px] text-muted">
          No files yet. Images, PDFs, documents, video and audio up to 50 MB.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface-variant px-3 py-2"
          >
            <AttachmentThumb attachment={a} onView={() => setViewing(a)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{a.originalFileName}</p>
              <p className="text-[11.5px] text-muted">{readableSize(a.fileSize)}</p>
            </div>
            <a
              href={a.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[12px] font-semibold text-primary"
            >
              Open
            </a>
            <button
              type="button"
              aria-label={`Delete ${a.originalFileName}`}
              onClick={() => remove(a)}
              className="shrink-0 text-muted hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}

        {pending.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-line bg-surface-variant px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{p.file.name}</p>
                <p className="text-[11.5px] text-muted">
                  {p.error ? p.error : `${Math.round(p.progress * 100)}% · ${readableSize(p.file.size)}`}
                </p>
              </div>
              {p.error ? (
                <button
                  type="button"
                  aria-label="Retry upload"
                  onClick={() => {
                    setPending((list) => list.filter((x) => x.id !== p.id));
                    start(p.file);
                  }}
                  className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Cancel upload"
                  onClick={() => p.handle?.cancel()}
                  className="shrink-0 text-muted hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {!p.error && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-divider">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(p.progress * 100)}%` }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {viewing && <ImageViewer attachment={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

function AttachmentThumb({
  attachment,
  onView,
}: {
  attachment: Attachment;
  onView: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (isImage(attachment) && attachment.thumbnailUrl && !failed) {
    return (
      <button type="button" onClick={onView} className="shrink-0" aria-label="View image">
        {/* A plain <img>: next/image cannot optimise an arbitrary Storage host
            in a static export, and a thumbnail must never block the row. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.thumbnailUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-11 w-11 rounded-lg object-cover"
        />
      </button>
    );
  }

  const Icon = isPdf(attachment)
    ? FileText
    : isVideo(attachment)
      ? FileVideo
      : isAudio(attachment)
        ? FileAudio
        : isImage(attachment)
          ? ImageIcon
          : FileText;

  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface">
      <Icon className="h-5 w-5 text-muted" />
    </span>
  );
}

function ImageViewer({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={attachment.originalFileName}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-5 top-5 rounded-full bg-surface p-2"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.downloadUrl}
        alt={attachment.originalFileName}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-xl object-contain"
      />
    </div>
  );
}
