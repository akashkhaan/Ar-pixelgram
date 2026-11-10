package com.arpixelgram.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** Upload AND publish run here, not in the Activity or its suspended WebView. */
public class BackgroundUploadService extends Service {
    static volatile boolean running;
    private static final String CHANNEL = "pixelgram_background_uploads";
    private static final int NOTIFICATION_ID = 8812;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private PowerManager.WakeLock wake;
    private volatile boolean stopped;
    private volatile int latestStartId;
    private Notification notification(String title, int progress, boolean terminal, String body, String url) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("notifUrl", url);
        PendingIntent pending = PendingIntent.getActivity(this, NOTIFICATION_ID, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body)
            .setContentIntent(pending).setOnlyAlertOnce(true).setOngoing(!terminal).setAutoCancel(terminal);
        if (!terminal) n.setProgress(100, Math.min(99, progress), progress == 0);
        return n.build();
    }
    @Override public void onCreate() {
        super.onCreate();
        running = true;
        if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager.class).createNotificationChannel(
            new NotificationChannel(CHANNEL, "Background media uploads", NotificationManager.IMPORTANCE_LOW));
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        latestStartId = startId;
        Notification n = notification("Pixelgram • Uploading", 0, false, "Preparing upload", "/profile");
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIFICATION_ID, n);
        worker.execute(this::drain);
        return START_REDELIVER_INTENT;
    }
    private void drain() {
        if (stopped) return;
        int startId = latestStartId;
        PowerManager pm = (PowerManager)getSystemService(POWER_SERVICE);
        if (pm != null && (wake == null || !wake.isHeld())) {
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pixelgram:media_upload");
            wake.acquire(6 * 60 * 60 * 1000L);
        }
        JSONObject last = null;
        for (JSONObject job : NativeUploadStore.list(this)) {
            if (stopped) return;
            if (!NativeUploadStore.active(job)) continue;
            last = job;
            try {
                job.put("status", "uploading"); NativeUploadStore.write(this, job);
                transfer(job, "media", job.getString("bucket"), job.getString("path"), job.getString("contentType"));
                if (job.optLong("coverSize") > 0) {
                    try { transfer(job, "cover", job.getString("coverBucket"), job.getString("coverPath"), "image/jpeg"); }
                    catch (Exception e) {
                        job.getJSONObject("row").put("thumbnail_url", JSONObject.NULL);
                        job.getJSONObject("fallback").put("thumbnail_url", JSONObject.NULL);
                    }
                }
                progress(job, 99);
                publish(job);
                job.put("status", "complete"); job.put("progress", 100);
                NativeUploadStore.releasePrivateData(this, job);
            } catch (Exception e) {
                if (stopped) return; // Process shutdown leaves durable work resumable.
                try { job.put("status", "error"); job.put("error", e.getMessage() == null ? "Upload fail hua" : e.getMessage());
                    NativeUploadStore.releasePrivateData(this, job); } catch (Exception ignored) {}
            }
        }
        boolean remaining = false;
        for (JSONObject j : NativeUploadStore.list(this)) if (NativeUploadStore.active(j)) remaining = true;
        if (remaining) { worker.execute(this::drain); return; }
        if (wake != null && wake.isHeld()) wake.release();
        // A later enqueue has its own worker; do not stop that newer service start.
        if (latestStartId != startId) return;
        if (last != null) {
            boolean success = "complete".equals(last.optString("status"));
            String url = "video".equals(last.optString("kind")) ? "/videos/" + last.optString("recordId")
                : "reel".equals(last.optString("kind")) ? "/reels?r=" + last.optString("recordId")
                : "post".equals(last.optString("kind")) ? "/post/" + last.optString("recordId") : "/stories";
            stopForeground(STOP_FOREGROUND_DETACH);
            getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification(
                success ? "Pixelgram • Upload complete" : "Pixelgram • Upload failed", 100, true,
                success ? last.optString("label") + " share ho gaya" : last.optString("error"), success ? url : "/profile"));
        } else stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelfResult(startId);
    }
    private void progress(JSONObject job, int value) throws Exception {
        job.put("progress", Math.min(99, Math.max(0, value))); NativeUploadStore.write(this, job);
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification(
            "Pixelgram • " + job.optString("label"), value, false, value >= 99 ? "Publishing…" : "Uploading " + value + "%", "/profile"));
    }
    private static class Reply {
        int code; String body; String location; long offset;
    }
    private Reply http(JSONObject job, String method, String address, byte[] body, String contentType, String[][] extra) throws Exception {
        URL url = new URL(address);
        URL base = new URL(job.getString("base"));
        if (!"https".equals(url.getProtocol()) || !base.getHost().equals(url.getHost())) throw new IOException("Invalid upload host");
        HttpURLConnection c = (HttpURLConnection)url.openConnection();
        c.setInstanceFollowRedirects(false); c.setRequestMethod(method); c.setConnectTimeout(20000); c.setReadTimeout(60000);
        c.setRequestProperty("apikey", job.getString("apikey")); c.setRequestProperty("Authorization", "Bearer " + job.getString("accessToken"));
        c.setRequestProperty("Tus-Resumable", "1.0.0");
        if (extra != null) for (String[] pair : extra) c.setRequestProperty(pair[0], pair[1]);
        try {
            if (body != null) { c.setDoOutput(true); c.setFixedLengthStreamingMode(body.length);
                c.setRequestProperty("Content-Type", contentType); try (OutputStream out = c.getOutputStream()) { out.write(body); } }
            Reply r = new Reply(); r.code = c.getResponseCode(); r.location = c.getHeaderField("Location");
            String offset = c.getHeaderField("Upload-Offset"); r.offset = offset == null ? 0 : Long.parseLong(offset);
            InputStream stream = r.code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream text = new ByteArrayOutputStream();
            if (stream != null) try (InputStream in = stream) { byte[] b = new byte[8192]; int count;
                while ((count = in.read(b)) != -1 && text.size() < 65536) text.write(b, 0, count); }
            r.body = new String(text.toByteArray(), StandardCharsets.UTF_8);
            return r;
        } finally { c.disconnect(); }
    }
    private Reply request(JSONObject job, String method, String address, byte[] body, String type, String[][] headers) throws Exception {
        Reply r = http(job, method, address, body, type, headers);
        if (r.code == 401) {
            byte[] tokenBody = new JSONObject().put("refresh_token", job.getString("refreshToken")).toString().getBytes(StandardCharsets.UTF_8);
            Reply token = http(job, "POST", job.getString("base") + "/auth/v1/token?grant_type=refresh_token", tokenBody, "application/json", null);
            if (token.code != 200) throw new IOException("Login expire ho gaya — dobara login karke upload karein");
            JSONObject refreshed = new JSONObject(token.body);
            job.put("accessToken", refreshed.getString("access_token")); job.put("refreshToken", refreshed.getString("refresh_token"));
            NativeUploadStore.write(this, job);
            r = http(job, method, address, body, type, headers);
        }
        return r;
    }
    private static String meta(String key, String value) {
        return key + " " + Base64.encodeToString(value.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
    }
    private void transfer(JSONObject job, String part, String bucket, String path, String type) throws Exception {
        if (job.optBoolean(part + "Done")) return;
        File file = NativeUploadStore.part(this, job.getString("id"), part);
        String endpoint = job.getString("base") + "/storage/v1/upload/resumable";
        String key = part + "Url";
        int failures = 0;
        while (!stopped) {
            try {
                String uploadUrl = job.optString(key);
                if (uploadUrl.isEmpty()) {
                    Reply create = request(job, "POST", endpoint, new byte[0], "application/offset+octet-stream", new String[][]{
                        {"Upload-Length", String.valueOf(file.length())}, {"x-upsert", "true"},
                        {"Upload-Metadata", meta("bucketName", bucket) + "," + meta("objectName", path) + "," + meta("contentType", type) + "," + meta("cacheControl", "31536000")} });
                    if (create.code != 201 || create.location == null) throw new IOException("Storage [" + create.code + "]: " + create.body);
                    uploadUrl = new URL(new URL(endpoint + "/"), create.location).toString();
                    job.put(key, uploadUrl); NativeUploadStore.write(this, job);
                }
                Reply head = request(job, "HEAD", uploadUrl, null, null, null);
                if (head.code == 404 || head.code == 410) { job.remove(key); NativeUploadStore.write(this, job); throw new IOException("Expired upload; retrying"); }
                if (head.code != 200 && head.code != 204) throw new IOException("Storage [" + head.code + "]: " + head.body);
                long offset = head.offset;
                if (offset < 0 || offset > file.length()) throw new IOException("Invalid upload offset");
                try (RandomAccessFile in = new RandomAccessFile(file, "r")) {
                    while (offset < file.length() && !stopped) {
                        int size = (int)Math.min(6 * 1024 * 1024, file.length() - offset);
                        byte[] bytes = new byte[size]; in.seek(offset); in.readFully(bytes);
                        Reply patch = request(job, "PATCH", uploadUrl, bytes, "application/offset+octet-stream", new String[][]{{"Upload-Offset", String.valueOf(offset)}});
                        if (patch.code != 204 || patch.offset != offset + size) throw new IOException("Storage [" + patch.code + "]: " + patch.body);
                        offset = patch.offset; failures = 0;
                        if ("media".equals(part)) progress(job, (int)Math.min(98, offset * 98 / Math.max(1, file.length())));
                    }
                }
                if (stopped) throw new InterruptedException();
                job.put(part + "Done", true); NativeUploadStore.write(this, job); return;
            } catch (Exception e) {
                if (stopped || ++failures > 5) throw e;
                Thread.sleep(Math.min(10000, failures * 2000L)); // HEAD obtains server offset; never guess received bytes.
            }
        }
        throw new InterruptedException();
    }
    private void publish(JSONObject job) throws Exception {
        String endpoint = job.getString("base") + "/rest/v1/" + job.getString("table");
        String query = "?id=eq." + job.getString("recordId") + "&select=id";
        JSONObject row = job.getJSONObject("row");
        for (int attempt = 0; attempt < 6 && !stopped; attempt++) {
            try {
                // Stable UUID makes an interrupted publish retry read back, never create a second item.
                Reply existing = request(job, "GET", endpoint + query, null, null, null);
                if (existing.code != 200) throw new IOException("Publish [" + existing.code + "]: " + existing.body);
                if (new JSONArray(existing.body).length() > 0) return;
                Reply result = request(job, "POST", endpoint + "?select=id", row.toString().getBytes(StandardCharsets.UTF_8), "application/json",
                    new String[][]{{"Prefer", "return=representation"}});
                if (result.code == 201) {
                    JSONArray rows = new JSONArray(result.body);
                    if (rows.length() == 0 || !job.getString("recordId").equals(rows.getJSONObject(0).optString("id"))) throw new IOException("Publish not confirmed");
                    return;
                }
                if (job.optBoolean("hasMusic") && result.code == 400 && (result.body.contains("PGRST204") || result.body.contains("42703"))) {
                    row = job.getJSONObject("fallback"); continue;
                }
                throw new IOException("Publish [" + result.code + "]: " + result.body);
            } catch (Exception e) { if (attempt == 5 || stopped) throw e; Thread.sleep(Math.min(10000, 2000L * (attempt + 1))); }
        }
        throw new InterruptedException();
    }
    // Android 15 data-sync limit: stop promptly, leave work durable for an explicit app return.
    public void onTimeout(int startId, int fgsType) { stopped = true; worker.shutdownNow(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); }
    @Override public void onDestroy() {
        running = false; stopped = true; worker.shutdownNow(); if (wake != null && wake.isHeld()) wake.release(); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
