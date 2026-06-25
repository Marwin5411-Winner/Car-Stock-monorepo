/**
 * Diff a campaign's current vehicle-model set against the requested next set.
 *
 * Editing a campaign sends the full `vehicleModelIds` list. The naive update
 * (delete every campaign_vehicle_models row, then recreate) cascade-deletes
 * every saved formula, because CampaignModelFormula has `onDelete: Cascade`
 * on its (campaignId, vehicleModelId) relation. Diffing means rows for
 * unchanged models are never touched, so their formulas survive.
 */
export function diffModelSet(
  currentIds: string[],
  nextIds: string[]
): { toAdd: string[]; toRemove: string[] } {
  const current = new Set(currentIds);
  const next = new Set(nextIds);
  const toAdd = [...next].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !next.has(id));
  return { toAdd, toRemove };
}
