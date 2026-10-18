import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { createMusicApiServer, mapSaavnResults } from './server.mjs';

const key = Buffer.from('38346581', 'utf8');

function encryptMediaUrl(url) {
  const cipher = createCipheriv('des-ede3-ecb', Buffer.concat([key, key, key]), null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]).toString('base64');
}

test('maps Saavn tracks to full-length tracks and decrypts the stream URL', () => {
  const tracks = mapSaavnResults([
    {
      id: 'track-1',
      song: 'Pistol &amp; Roses',
      primary_artists: 'Sumit Pata',
      album: 'Singles',
      duration: '140',
      image: [{ quality: '500x500', link: 'https://images.example/cover.jpg' }],
      encrypted_media_url: encryptMediaUrl('https://cdn.example/pistol_96.mp4'),
    },
    { id: 'missing-audio', song: 'Unavailable track', duration: '200' },
  ]);

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].id, 'saavn_track-1');
  assert.equal(tracks[0].title, 'Pistol & Roses');
  assert.equal(tracks[0].artist, 'Sumit Pata');
  assert.equal(tracks[0].durationMs, 140_000);
  assert.equal(tracks[0].previewUrl, 'https://cdn.example/pistol_320.mp4');
  assert.equal(tracks[0].isFullSong, true);
});

test('search endpoint returns full tracks and allows the configured frontend origin', async (t) => {
  let requestedUrl;
  const server = createMusicApiServer(async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({
        results: [{
          id: 'track-2',
          song: 'Long Song',
          duration: '177',
          encrypted_media_url: encryptMediaUrl('https://cdn.example/long_96.mp4'),
        }],
      }),
    };
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/music-search?q=long%20song`, {
    headers: { Origin: 'https://ar-pixelgram.onrender.com' },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://ar-pixelgram.onrender.com');
  assert.equal(requestedUrl.searchParams.get('q'), 'long song');
  assert.equal(body.results[0].durationMs, 177_000);
  assert.equal(body.results[0].isFullSong, true);
});

test('search endpoint rejects unknown origins and malformed routes', async (t) => {
  const server = createMusicApiServer(async () => {
    throw new Error('should not fetch');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const address = server.address();
  const denied = await fetch(`http://127.0.0.1:${address.port}/api/music-search?q=test`, {
    headers: { Origin: 'https://untrusted.example' },
  });
  const missing = await fetch(`http://127.0.0.1:${address.port}/missing`);

  assert.equal(denied.status, 403);
  assert.equal(missing.status, 404);
});
