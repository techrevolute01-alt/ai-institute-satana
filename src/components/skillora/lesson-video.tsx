import { useState } from "react";

function getEmbedUrl(videoUrl: string) {
  try {
    const url = new URL(videoUrl);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id =
        url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function LessonVideo({
  videoUrl,
  title,
  onEnded,
}: {
  videoUrl: string;
  title: string;
  onEnded?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const embedUrl = getEmbedUrl(videoUrl);
  const validHttpsUrl = (() => {
    try {
      const url = new URL(videoUrl);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  })();

  if (!validHttpsUrl) {
    return (
      <p className="rounded-md bg-paper p-4 text-sm text-destructive">
        This video URL is invalid or insecure.
      </p>
    );
  }

  if (failed) {
    return (
      <p className="rounded-md bg-paper p-4 text-sm text-muted-foreground">
        This video could not be loaded.{" "}
        <a href={videoUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
          Open the video in a new tab
        </a>
        .
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md bg-black border border-line">
      {embedUrl ? (
        <iframe
          className="aspect-video w-full"
          src={embedUrl}
          title={title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          onError={() => setFailed(true)}
        />
      ) : (
        <video
          className="aspect-video w-full"
          controls
          playsInline
          preload="metadata"
          src={videoUrl}
          onEnded={onEnded}
          onError={() => setFailed(true)}
        >
          Your browser does not support video playback.
        </video>
      )}
    </div>
  );
}
