import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStoryTapDirection } from './storyNavigation.ts';

test('right-side taps advance through three stories', () => {
  let index = 0;
  for (let tap = 0; tap < 2; tap++) {
    index += getStoryTapDirection(300, 0, 360) === 'next' ? 1 : -1;
  }
  assert.equal(index, 2);
});

test('left-side tap returns from the second story to the first', () => {
  const index = 1 + (getStoryTapDirection(40, 0, 360) === 'previous' ? -1 : 1);
  assert.equal(index, 0);
});

test('tap regions use viewer position, not the whole window', () => {
  assert.equal(getStoryTapDirection(420, 400, 360), 'previous');
  assert.equal(getStoryTapDirection(720, 400, 360), 'next');
});
