package com.arpixelgram.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.effect.BitmapOverlay;
import androidx.media3.effect.OverlayEffect;
import androidx.media3.effect.OverlaySettings;
import androidx.media3.effect.TextureOverlay;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.Transformer;
import com.google.common.collect.ImmutableList;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * WhatsApp Status ke liye reel video par Instagram jaisa badge chhapta hai:
 * upar left me creator ki DP + @username, aur neeche app logo + "View on Pixelgram".
 * Kuch bhi fail ho to original video hi share hoti hai (callback me null).
 */
public final class WaStatusWatermark {
    public interface Callback {
        /** @param result watermark wali video, ya null agar nahi ban payi */
        void onDone(File result);
    }

    private static final long TIMEOUT_MS = 120_000L;

    private WaStatusWatermark() {}

    /** Background thread se call karo (DP download hoti hai). Callback main thread par aata hai. */
    public static void apply(Context ctx, File input, String username, String avatarUrl, Callback cb) {
        final Handler main = new Handler(Looper.getMainLooper());
        final Bitmap badge;
        try {
            int[] size = displaySize(input);
            Bitmap avatar = downloadAvatar(avatarUrl);
            Bitmap icon = appIcon(ctx);
            badge = buildBadge(size[0], size[1], username, avatar, icon);
        } catch (Throwable t) {
            t.printStackTrace();
            main.post(() -> cb.onDone(null));
            return;
        }

        final File out = new File(input.getParentFile(), "pixelgram_status_" + System.currentTimeMillis() + ".mp4");
        final AtomicBoolean finished = new AtomicBoolean(false);

        main.post(() -> {
            final Transformer[] holder = new Transformer[1];
            final Runnable timeout = () -> {
                if (finished.compareAndSet(false, true)) {
                    try { if (holder[0] != null) holder[0].cancel(); } catch (Throwable ignored) {}
                    out.delete();
                    cb.onDone(null);
                }
            };
            try {
                OverlaySettings settings = new OverlaySettings.Builder()
                    // badge ka upar-left kona video ke upar-left ke paas
                    .setOverlayFrameAnchor(-1f, 1f)
                    .setBackgroundFrameAnchor(-0.92f, 0.93f)
                    .build();
                BitmapOverlay overlay = BitmapOverlay.createStaticBitmapOverlay(badge, settings);
                OverlayEffect effect = new OverlayEffect(ImmutableList.<TextureOverlay>of(overlay));
                EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(input)))
                    .setEffects(new Effects(Collections.emptyList(), ImmutableList.of(effect)))
                    .build();

                Transformer transformer = new Transformer.Builder(ctx)
                    .setVideoMimeType(MimeTypes.VIDEO_H264)
                    .addListener(new Transformer.Listener() {
                        @Override
                        public void onCompleted(Composition composition, ExportResult result) {
                            main.removeCallbacks(timeout);
                            if (!finished.compareAndSet(false, true)) return;
                            if (out.exists() && out.length() > 1000) {
                                out.setReadable(true, false);
                                cb.onDone(out);
                            } else {
                                out.delete();
                                cb.onDone(null);
                            }
                        }

                        @Override
                        public void onError(Composition composition, ExportResult result, ExportException e) {
                            main.removeCallbacks(timeout);
                            e.printStackTrace();
                            if (!finished.compareAndSet(false, true)) return;
                            out.delete();
                            cb.onDone(null);
                        }
                    })
                    .build();
                holder[0] = transformer;
                main.postDelayed(timeout, TIMEOUT_MS);
                transformer.start(item, out.getAbsolutePath());
            } catch (Throwable t) {
                t.printStackTrace();
                main.removeCallbacks(timeout);
                if (finished.compareAndSet(false, true)) {
                    out.delete();
                    cb.onDone(null);
                }
            }
        });
    }

    /** Video ki dikhne wali width/height (rotation ke hisab se). */
    private static int[] displaySize(File input) throws Exception {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(input.getAbsolutePath());
            int w = parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int h = parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            int rot = 0;
            if (android.os.Build.VERSION.SDK_INT >= 17) {
                rot = parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
            }
            if (w <= 0 || h <= 0) throw new IllegalStateException("No video size");
            if (rot % 180 != 0) return new int[] { h, w };
            return new int[] { w, h };
        } finally {
            try { r.release(); } catch (Throwable ignored) {}
        }
    }

    private static int parse(String s) {
        try { return s == null ? 0 : Integer.parseInt(s.trim()); } catch (Exception e) { return 0; }
    }

    private static Bitmap downloadAvatar(String avatarUrl) {
        if (avatarUrl == null || !avatarUrl.startsWith("http")) return null;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(avatarUrl).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            if (conn.getResponseCode() / 100 != 2) return null;
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            try (InputStream in = conn.getInputStream()) {
                byte[] buf = new byte[16 * 1024];
                int n;
                int total = 0;
                while ((n = in.read(buf)) != -1) {
                    total += n;
                    if (total > 8 * 1024 * 1024) return null;
                    bos.write(buf, 0, n);
                }
            }
            byte[] data = bos.toByteArray();
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 256) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            return BitmapFactory.decodeByteArray(data, 0, data.length, opts);
        } catch (Throwable t) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static Bitmap appIcon(Context ctx) {
        try {
            Drawable d = ctx.getPackageManager().getApplicationIcon(ctx.getApplicationInfo());
            Bitmap b = Bitmap.createBitmap(192, 192, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, 192, 192);
            d.draw(c);
            return b;
        } catch (Throwable t) {
            return null;
        }
    }

    private static void drawCircle(Canvas c, Bitmap src, float cx, float cy, float radius) {
        int side = Math.min(src.getWidth(), src.getHeight());
        Bitmap square = Bitmap.createBitmap(src, (src.getWidth() - side) / 2, (src.getHeight() - side) / 2, side, side);
        Bitmap scaled = Bitmap.createScaledBitmap(square, Math.max(1, Math.round(radius * 2)), Math.max(1, Math.round(radius * 2)), true);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        BitmapShader shader = new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setTranslate(cx - radius, cy - radius);
        shader.setLocalMatrix(m);
        p.setShader(shader);
        c.drawCircle(cx, cy, radius, p);
    }

    static Bitmap buildBadge(int videoW, int videoH, String username, Bitmap avatar, Bitmap icon) {
        int base = Math.min(videoW, videoH);
        int h = Math.max(48, Math.round(base * 0.15f));
        float pad = h * 0.16f;
        float avatarR = (h - pad * 2) / 2f;

        String name = "@" + (username == null || username.trim().isEmpty() ? "pixelgram" : username.trim());

        Paint namePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        namePaint.setColor(Color.WHITE);
        namePaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        namePaint.setTextSize(h * 0.30f);
        namePaint.setShadowLayer(h * 0.04f, 0, h * 0.02f, 0x99000000);

        Paint subPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        subPaint.setColor(0xF2FFFFFF);
        subPaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        subPaint.setTextSize(h * 0.23f);
        subPaint.setShadowLayer(h * 0.04f, 0, h * 0.02f, 0x99000000);

        String sub = "View on Pixelgram";
        float iconSize = h * 0.26f;
        float textX = pad + avatarR * 2 + pad * 0.9f;
        float maxTextW = videoW * 0.72f - textX - pad * 1.4f;

        // lamba username ho to "…" laga ke chhota
        if (namePaint.measureText(name) > maxTextW) {
            while (name.length() > 2 && namePaint.measureText(name + "…") > maxTextW) {
                name = name.substring(0, name.length() - 1);
            }
            name = name + "…";
        }
        float subW = iconSize + h * 0.08f + subPaint.measureText(sub);
        float contentW = Math.max(namePaint.measureText(name), subW);
        int w = Math.round(textX + contentW + pad * 1.4f);

        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);

        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(0x73000000);
        c.drawRoundRect(new RectF(0, 0, w, h), h / 2f, h / 2f, bg);

        float cx = pad + avatarR;
        float cy = h / 2f;
        // DP ke chaaron taraf Instagram jaisa gradient ring
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setShader(new android.graphics.LinearGradient(cx - avatarR, cy + avatarR, cx + avatarR, cy - avatarR,
            new int[] { 0xFFFEDA75, 0xFFFA7E1E, 0xFFD62976, 0xFF962FBF }, null, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, avatarR, ring);
        float innerR = avatarR * 0.86f;
        if (avatar != null) {
            drawCircle(c, avatar, cx, cy, innerR);
        } else if (icon != null) {
            drawCircle(c, icon, cx, cy, innerR);
        } else {
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(0xFF444444);
            c.drawCircle(cx, cy, innerR, fill);
        }

        float nameBaseline = h * 0.47f;
        c.drawText(name, textX, nameBaseline, namePaint);

        float subBaseline = h * 0.80f;
        float subX = textX;
        if (icon != null) {
            float top = subBaseline - iconSize * 0.86f;
            Bitmap ic = Bitmap.createScaledBitmap(icon, Math.max(1, Math.round(iconSize)), Math.max(1, Math.round(iconSize)), true);
            Paint ip = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            BitmapShader s = new BitmapShader(ic, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            android.graphics.Matrix m = new android.graphics.Matrix();
            m.setTranslate(subX, top);
            s.setLocalMatrix(m);
            ip.setShader(s);
            c.drawRoundRect(new RectF(subX, top, subX + iconSize, top + iconSize), iconSize * 0.24f, iconSize * 0.24f, ip);
            subX += iconSize + h * 0.08f;
        }
        c.drawText(sub, subX, subBaseline, subPaint);
        return b;
    }
}
