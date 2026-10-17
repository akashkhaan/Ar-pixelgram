import CryptoJS from 'crypto-js';

function decryptSaavnMediaUrl(encUrl: string): string {
  if (!encUrl) return '';
  try {
    const key = CryptoJS.enc.Utf8.parse('38346581');
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encUrl) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    const dec = decrypted.toString(CryptoJS.enc.Utf8);
    if (!dec || !dec.startsWith('http')) return '';
    return dec.replace('_96.', '_320.');
  } catch {
    return '';
  }
}

function decodeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function bigArtwork(url: string): string {
  if (!url) return '';
  return url
    .replace(/150x150/g, '500x500')
    .replace(/50x50/g, '500x500')
    .replace(/http:\/\//, 'https://');
}

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = (req.query?.q || req.query?.query || '').trim();
  if (!query) {
    return res.status(200).json({ results: [] });
  }

  try {
    const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=35&p=1&_marker=0&ctx=android&q=${encodeURIComponent(query)}`;
    const upstreamRes = await fetch(saavnUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (!upstreamRes.ok) {
      return res.status(200).json({ results: [] });
    }

    const data = (await upstreamRes.json()) as any;
    const rawResults = data?.results || [];

    const tracks = [];
    const seen = new Set<string>();

    for (const r of rawResults) {
      if (!r || !r.encrypted_media_url) continue;
      const audioUrl = decryptSaavnMediaUrl(r.encrypted_media_url);
      if (!audioUrl) continue;

      const id = 'saavn_' + (r.id || r.song);
      if (seen.has(id)) continue;
      seen.add(id);

      const durSec = typeof r.duration === 'string' ? parseInt(r.duration, 10) : Number(r.duration || 180);
      const durationMs = (!isNaN(durSec) && durSec > 0 ? durSec : 180) * 1000;

      tracks.push({
        id,
        title: decodeHtml(r.song || r.title || 'Untitled Track'),
        artist: decodeHtml(r.primary_artists || r.singers || r.artist || 'Unknown Artist'),
        album: decodeHtml(r.album || ''),
        artwork: bigArtwork(r.image || ''),
        previewUrl: audioUrl,
        durationMs,
        isFullSong: true,
      });
    }

    return res.status(200).json({ results: tracks });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, results: [] });
  }
}
