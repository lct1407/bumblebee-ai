/** Client for the /api/changelog endpoints. */
import { api } from "@/lib/api-client";

export interface ReleaseStanza {
  version: string;
  date: string | null;
  sections: Record<string, string[]>;
}

export const ChangelogApi = {
  list: (limit = 5) =>
    api.get<{ releases: ReleaseStanza[]; total: number }>(
      `/api/changelog?limit=${limit}`,
    ).then((r) => r.data),
  latest: () =>
    api.get<ReleaseStanza>("/api/changelog/latest").then((r) => r.data),
};
