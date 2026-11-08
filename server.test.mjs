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

test('share link gives WhatsApp the video thumbnail and sends people to the video page', async (t) => {
  const server = createMusicApiServer(async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/videos')) {
      return new Response(JSON.stringify([{ id: 'x', user_id: 'u1', title: 'My <Video>', description: 'Nice', thumbnail_url: 'https://img.example/thumb.jpg' }]), { status: 200 });
    }
    if (u.includes('/rest/v1/profiles')) {
      return new Response(JSON.stringify([{ user_id: 'u1', username: 'manish' }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();
  const id = 'd8ead5b2-dd7d-421d-ba8a-d22294e1da43';
  const res = await fetch(`http://127.0.0.1:${port}/s/video/${id}`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<meta property="og:image" content="https:\/\/img\.example\/thumb\.jpg">/);
  assert.match(html, /<meta property="og:title" content="My &lt;Video&gt;">/);
  assert.match(html, new RegExp(`url=https://ar-pixelgram\\.onrender\\.com/videos/${id}`));
});

test('share link for a reel without a cover falls back to the creator photo, never the mp4', async (t) => {
  const server = createMusicApiServer(async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/reels')) {
      return new Response(JSON.stringify([{ id: 'r', user_id: 'u1', thumbnail_url: 'https://cdn.example/clip.mp4', caption: 'hi' }]), { status: 200 });
    }
    if (u.includes('/rest/v1/profiles')) {
      return new Response(JSON.stringify([{ user_id: 'u1', username: 'manish', avatar_url: 'https://img.example/me.jpg' }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();
  const id = 'd8ead5b2-dd7d-421d-ba8a-d22294e1da43';
  const html = await (await fetch(`http://127.0.0.1:${port}/s/reel/${id}`)).text();
  assert.match(html, /og:image" content="https:\/\/img\.example\/me\.jpg"/);
  assert.match(html, new RegExp(`/reels\\?r=${id}`));
});

test('share link rejects unknown ids', async (t) => {
  const server = createMusicApiServer(async () => new Response('[]'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/s/video/not-an-id`);
  assert.equal(res.status, 404);
});

test('profile share link gives WhatsApp the profile photo as a small JPG (webp/large photos are converted)', async (t) => {
  const server = createMusicApiServer(async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/profiles')) {
      return new Response(JSON.stringify([{ user_id: 'u1', username: 'akash_57', full_name: 'Akash', avatar_url: 'https://img.example/dp.webp' }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();
  const id = '352daec4-a4fa-4f1a-ab0e-6e9a0c478a9b';
  const html = await (await fetch(`http://127.0.0.1:${port}/s/profile/${id}`)).text();
  assert.match(html, /og:image" content="https:\/\/wsrv\.nl\/\?url=https%3A%2F%2Fimg\.example%2Fdp\.webp&amp;w=400&amp;h=400&amp;fit=cover&amp;output=jpg/);
  assert.match(html, new RegExp(`url=https://ar-pixelgram\\.onrender\\.com/profile/${id}`));
});
