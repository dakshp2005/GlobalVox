import Papa from "papaparse";

export interface ParsedInviteeRow {
  externalId: string | null;
  name: string;
  phone: string;
  email: string | null;
  valid: boolean;
  invalidReason: string | null;
}

// Loose but sane E.164-ish check: optional leading +, 7-15 digits.
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,14}[0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseInviteeCsv(csvText: string): {
  rows: ParsedInviteeRow[];
  parseErrors: string[];
} {
  const result = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const parseErrors = result.errors.map(
    (e) => `Row ${e.row ?? "?"}: ${e.message}`
  );

  const seenPhones = new Set<string>();
  const rows: ParsedInviteeRow[] = result.data.map((raw) => {
    const externalId = (raw.id ?? "").trim() || null;
    const name = (raw.name ?? "").trim();
    const phone = (raw.phone ?? "").trim();
    const emailRaw = (raw.email ?? "").trim();
    const email = emailRaw || null;

    const reasons: string[] = [];
    if (!name) reasons.push("missing name");
    if (!phone) reasons.push("missing phone");
    else if (!PHONE_RE.test(phone)) reasons.push("invalid phone format");
    else if (seenPhones.has(phone)) reasons.push("duplicate phone in file");
    if (email && !EMAIL_RE.test(email)) reasons.push("invalid email format");

    if (phone && PHONE_RE.test(phone)) seenPhones.add(phone);

    return {
      externalId,
      name: name || "(unknown)",
      phone: phone || "(missing)",
      email,
      valid: reasons.length === 0,
      invalidReason: reasons.length ? reasons.join("; ") : null,
    };
  });

  return { rows, parseErrors };
}
