import "server-only";

import { cache } from "react";

import { getDb } from "./db/client";

export interface GarageSettings {
  countryCode: string | null;
  timezone: string;
  currencyCode: string | null;
}

/**
 * The singleton garage profile (Phase 1A). `countryCode` is the default region for phone
 * normalisation; when the profile is missing it is null and phone input is refused (no guessing).
 */
export const getGarageSettings = cache(async (): Promise<GarageSettings> => {
  const profile = await getDb().garageProfile.findUnique({ where: { singleton: true } });
  return {
    countryCode: profile?.countryCode ?? null,
    timezone: profile?.timezone ?? "UTC",
    currencyCode: profile?.currencyCode ?? null,
  };
});
