import { useEffect, useMemo, useState } from "react";
import { cacheCoverForWork } from "../lib/covers";
import type { Work } from "../types";

export function Cover({
  work,
  size = "md",
}: {
  work: Work;
  size?: "sm" | "md" | "lg";
}) {
  const blobUrl = useMemo(
    () => (work.coverBlob ? URL.createObjectURL(work.coverBlob) : undefined),
    [work.coverBlob],
  );
  useEffect(
    () => () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    [blobUrl],
  );
  const src = blobUrl ?? work.cover;
  const [failedSrc, setFailedSrc] = useState<string>();
  useEffect(() => {
    if (!work.coverBlob && work.cover)
      void cacheCoverForWork(work.id, work.cover);
  }, [work.cover, work.coverBlob, work.id]);
  const failed = !src || failedSrc === src;
  return (
    <div
      className={`cover cover--${size}${failed ? " cover--fallback" : ""}`}
      aria-label={`Обложка: ${work.title}`}
    >
      {src && !failed ? (
        <img
          key={src}
          src={src}
          alt=""
          loading={size === "lg" ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={size === "lg" ? "high" : "auto"}
          onError={() => setFailedSrc(src)}
        />
      ) : null}
      <span>{work.title.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}
