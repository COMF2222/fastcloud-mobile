import { useState } from "react";
import { Radio, LoaderCircle } from "lucide-react";
import { startStation } from "./player";
import { run } from "./state";
import { useText } from "./ui";
import type { Track } from "./types";
import type { StationKind } from "./station";

export function StationButton({
  kind,
  tracks,
  iconOnly = false,
}: {
  kind: StationKind;
  tracks: Track[];
  iconOnly?: boolean;
}) {
  const t = useText();
  const [busy, setBusy] = useState(false);
  const label =
    kind === "artist"
      ? t("Волна по артисту", "Artist radio")
      : kind === "collection"
        ? t("Волна по подборке", "Collection radio")
        : t("Волна по треку", "Track radio");
  return (
    <button
      className={iconOnly ? "icon-button" : "secondary"}
      aria-label={label}
      aria-busy={busy}
      disabled={busy || !tracks.length}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void run(() => startStation(tracks, kind)).finally(() =>
          setBusy(false),
        );
      }}
    >
      {busy ? (
        <LoaderCircle className="station-loading" size={20} />
      ) : (
        <Radio size={20} />
      )}
      {!iconOnly && label}
    </button>
  );
}
