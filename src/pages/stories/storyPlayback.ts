/** Story playback rules for the viewer. Pure and browser-safe so they can be tested in Node. */

/** Images stay on screen for this long, like Instagram. */
export const STORY_IMAGE_DURATION_MS = 5000;

/** How far the top progress bar should fill (0–1) for the current story. */
export function getStoryProgress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const ratio = elapsedMs / durationMs;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return ratio;
}
