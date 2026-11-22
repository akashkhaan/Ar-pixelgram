// Run: node --test src/lib/profile/professionalStats.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCompact, summarizeProfessionalStats } from './professionalStats.js';

const NOW = Date.parse('2026-11-22T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

test('total views = reel views + video views', () => {
  const s = summarizeProfessionalStats({
    reels: [{ id: 'r1', views_count: 1200, created_at: daysAgo(2) }, { id: 'r2', views_count: 300, created_at: daysAgo(40) }],
    videos: [{ id: 'v1', views_count: 2600, created_at: daysAgo(5) }],
    now: NOW,
  });
  assert.equal(s.reelViews, 1500);
  assert.equal(s.videoViews, 2600);
  assert.equal(s.totalViews, 4100);
});

test('last 30 days only counts content posted in last 30 days', () => {
  const s = summarizeProfessionalStats({
    reels: [{ id: 'r1', views_count: 1200, created_at: daysAgo(2) }, { id: 'r2', views_count: 300, created_at: daysAgo(40) }],
    videos: [{ id: 'v1', views_count: 2600, created_at: daysAgo(31) }],
    now: NOW,
  });
  assert.equal(s.recentViews, 1200);
});

test('bad or missing counts are treated as zero', () => {
  const s = summarizeProfessionalStats({ reels: [{ id: 'r', views_count: null }, { id: 'x', views_count: -5 }], now: NOW });
  assert.equal(s.totalViews, 0);
  assert.deepEqual(s.top, []);
});

test('top content sorted by views, max 5', () => {
  const reels = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, views_count: i + 1 }));
  const s = summarizeProfessionalStats({ reels, now: NOW });
  assert.equal(s.top.length, 5);
  assert.equal(s.top[0].id, 'r6');
});

test('compact number format', () => {
  assert.equal(formatCompact(950), '950');
  assert.equal(formatCompact(4100), '4.1k');
  assert.equal(formatCompact(4000), '4k');
  assert.equal(formatCompact(2500000), '2.5M');
});
