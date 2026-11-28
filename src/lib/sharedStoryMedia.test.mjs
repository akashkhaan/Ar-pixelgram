import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSharedStoryVideoUrl, isSharedVideoUrl, mergeSharedStoryMedia } from './sharedStoryMedia.mjs';

const reel = { kind: 'reel', id: 'r1', ownerUsername: 'old_name', thumbnailUrl: '/old.jpg' };

test('a shared reel keeps its original playable video URL', () => {
  assert.equal(getSharedStoryVideoUrl({ ...reel, mediaUrl: 'https://cdn.test/reel.mp4' }), 'https://cdn.test/reel.mp4');
});

test('long videos also play from their original URL', () => {
  assert.equal(getSharedStoryVideoUrl({ kind: 'video', id: 'v1', mediaUrl: '/video.webm?x=1' }), '/video.webm?x=1');
});

test('a photo post thumbnail is never mistaken for playable video', () => {
  assert.equal(getSharedStoryVideoUrl({ kind: 'post', id: 'p1', mediaUrl: '/photo.jpg' }), null);
});

test('video posts support common mobile formats and signed URLs', () => {
  assert.equal(isSharedVideoUrl('/upload.MOV?token=secret'), true);
  assert.equal(getSharedStoryVideoUrl({ kind: 'post', id: 'p2', mediaUrl: '/upload.MOV?token=secret' }), '/upload.MOV?token=secret');
});

test('missing or blank media cannot create an empty video player', () => {
  assert.equal(getSharedStoryVideoUrl({ ...reel, mediaUrl: '  ' }), null);
  assert.equal(getSharedStoryVideoUrl(reel), null);
});

test('resolving refreshes the creator username and original media', () => {
  const result = mergeSharedStoryMedia(reel, {
    user_id: 'owner1',
    video_url: '/fresh.mp4',
    thumbnail_url: '/fresh.jpg',
    profile: { username: 'akash_57', avatar_url: '/avatar.jpg' },
  });
  assert.equal(result.ownerUsername, 'akash_57');
  assert.equal(result.ownerAvatarUrl, '/avatar.jpg');
  assert.equal(result.mediaUrl, '/fresh.mp4');
  assert.equal(result.thumbnailUrl, '/fresh.jpg');
});

test('old shared stories without media become playable after resolution', () => {
  const result = mergeSharedStoryMedia(reel, { video_url: '/recovered.mp4' });
  assert.equal(getSharedStoryVideoUrl(result), '/recovered.mp4');
  assert.equal(result.ownerUsername, 'old_name');
});

test('an unavailable original preserves the stored share fallback', () => {
  assert.deepEqual(mergeSharedStoryMedia(reel, null), reel);
});

test('photo post resolution stays a photo while video post resolution plays', () => {
  const photo = mergeSharedStoryMedia({ kind: 'post', id: 'p3' }, { image_url: '/photo.png' });
  const video = mergeSharedStoryMedia({ kind: 'post', id: 'p4' }, { image_url: '/post.mp4' });
  assert.equal(getSharedStoryVideoUrl(photo), null);
  assert.equal(photo.thumbnailUrl, '/photo.png');
  assert.equal(getSharedStoryVideoUrl(video), '/post.mp4');
});
