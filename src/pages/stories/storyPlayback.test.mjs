import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY_IMAGE_DURATION_MS, getStoryProgress } from './storyPlayback.ts';

test('image stories last a fixed five seconds', () => {
  assert.equal(STORY_IMAGE_DURATION_MS, 5000);
});

test('progress grows with elapsed time and clamps to the ends', () => {
  assert.equal(getStoryProgress(0, 5000), 0);
  assert.equal(getStoryProgress(2500, 5000), 0.5);
  assert.equal(getStoryProgress(5000, 5000), 1);
  assert.equal(getStoryProgress(9000, 5000), 1);
});

test('progress never divides by a missing or zero duration', () => {
  assert.equal(getStoryProgress(1000, 0), 0);
  assert.equal(getStoryProgress(1000, Number.NaN), 0);
});
