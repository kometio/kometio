import {
  applyStarterResponseSchema,
  starterOfferSchema,
  type ApplyStarterBody,
  type ApplyStarterResponse,
  type StarterOffer,
} from '@kometio/api-contracts';
import type { StarterId } from '@kometio/shared-types';
import { request } from './http-client';

/** What a site can be started from, and whether this one still can (docs/adr/0136). */
export async function getStarterOffer(siteId: string): Promise<StarterOffer> {
  return starterOfferSchema.parse(await request(`/sites/${siteId}/starters`));
}

export async function applyStarter(
  siteId: string,
  starterId: StarterId,
): Promise<ApplyStarterResponse> {
  const body: ApplyStarterBody = { starterId };
  return applyStarterResponseSchema.parse(
    await request(`/sites/${siteId}/starters`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}
