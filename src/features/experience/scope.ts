/** Maßgebliches Bundesland: das des Ausbildungsbetriebs, sonst das im Profil gewählte. */
export interface BundeslandSource { bundesland?: string | null }

export function effectiveBundesland(
  profile: BundeslandSource | null | undefined,
  company: BundeslandSource | null | undefined,
): { code: string | null; source: "company" | "profile" | null } {
  if (company?.bundesland) return { code: company.bundesland, source: "company" };
  if (profile?.bundesland) return { code: profile.bundesland, source: "profile" };
  return { code: null, source: null };
}
