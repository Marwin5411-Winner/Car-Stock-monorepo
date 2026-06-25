import { describe, expect, test } from 'bun:test';
import { diffModelSet } from '../modules/campaigns/campaign-model-set.helpers';

// Regression guard for the data-loss bug: editing a campaign used to delete
// EVERY campaign_vehicle_models row and recreate them, which cascade-deleted
// every saved formula (CampaignModelFormula -> onDelete: Cascade). The fix
// diffs the model set so unchanged models keep their row — and their formulas.
describe('diffModelSet', () => {
  test('no change => nothing to add or remove (formulas must survive)', () => {
    const { toAdd, toRemove } = diffModelSet(['A', 'B', 'C'], ['A', 'B', 'C']);
    expect(toAdd).toEqual([]);
    expect(toRemove).toEqual([]);
  });

  test('adding a model only adds the new one', () => {
    const { toAdd, toRemove } = diffModelSet(['A', 'B'], ['A', 'B', 'C']);
    expect(toAdd).toEqual(['C']);
    expect(toRemove).toEqual([]);
  });

  test('removing a model only removes the dropped one', () => {
    const { toAdd, toRemove } = diffModelSet(['A', 'B', 'C'], ['A', 'C']);
    expect(toAdd).toEqual([]);
    expect(toRemove).toEqual(['B']);
  });

  test('swapping a model removes the old and adds the new', () => {
    const { toAdd, toRemove } = diffModelSet(['A', 'B'], ['B', 'C']);
    expect(toAdd).toEqual(['C']);
    expect(toRemove).toEqual(['A']);
  });

  test('clearing all models removes them all', () => {
    const { toAdd, toRemove } = diffModelSet(['A', 'B'], []);
    expect(toAdd).toEqual([]);
    expect(toRemove).toEqual(['A', 'B']);
  });

  test('order of inputs does not matter and duplicates are ignored', () => {
    const { toAdd, toRemove } = diffModelSet(['B', 'A', 'A'], ['A', 'B', 'B']);
    expect(toAdd).toEqual([]);
    expect(toRemove).toEqual([]);
  });
});
