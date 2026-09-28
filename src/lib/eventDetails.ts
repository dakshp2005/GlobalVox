// Optional campaign details the voice agent answers callers' questions with.

export const EVENT_DETAIL_LIMITS = {
  eventTime: 100,
  venueDetails: 500,
  faqNotes: 2000,
} as const;

type Key = keyof typeof EVENT_DETAIL_LIMITS;

/**
 * Cleans the optional detail fields of a request body. Fields that are absent are left out
 * (so a PATCH doesn't wipe them); empty strings become null; over-long values are rejected.
 */
export function cleanEventDetails(
  body: Record<string, unknown>
): { ok: true; data: Partial<Record<Key, string | null>> } | { ok: false; error: string } {
  const data: Partial<Record<Key, string | null>> = {};
  for (const key of Object.keys(EVENT_DETAIL_LIMITS) as Key[]) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== "string") {
      return { ok: false, error: `${key} must be text` };
    }
    const value = (raw ?? "").trim();
    if (value.length > EVENT_DETAIL_LIMITS[key]) {
      return { ok: false, error: `${key} is too long (max ${EVENT_DETAIL_LIMITS[key]} characters)` };
    }
    data[key] = value === "" ? null : value;
  }
  return { ok: true, data };
}
