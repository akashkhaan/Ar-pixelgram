package com.arpixelgram.app;

import android.content.Intent;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.net.URI;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "BackgroundUpload")
public class BackgroundUploadPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private interface Work { void run() throws Exception; }
    private void work(PluginCall call, Work action) {
        io.execute(() -> { try { action.run(); } catch (Exception e) { call.reject(e.getMessage() == null ? "Upload failed" : e.getMessage()); } });
    }
    @PluginMethod public void prepare(PluginCall call) {
        work(call, () -> {
            JSONObject job = new JSONObject(call.getData().toString());
            String id = NativeUploadStore.checkedId(job.getString("id"));
            URI base = new URI(job.getString("base"));
            if (!"https".equals(base.getScheme()) || base.getHost() == null || !base.getHost().endsWith(".supabase.co")
                || base.getUserInfo() != null || (base.getPort() != -1 && base.getPort() != 443))
                throw new IllegalArgumentException("Invalid storage address");
            if (!job.getString("path").startsWith(job.getString("userId") + "/") || job.getString("path").contains(".."))
                throw new IllegalArgumentException("Invalid storage path");
            String kind = job.getString("kind");
            String expected = "story".equals(kind) ? "stories" : "reel".equals(kind) ? "reels" : "post".equals(kind) ? "posts" : "video".equals(kind) ? "videos" : "";
            if (expected.isEmpty() || !expected.equals(job.getString("bucket")) || !expected.equals(job.getString("table")))
                throw new IllegalArgumentException("Invalid upload kind");
            job.put("base", "https://" + base.getHost());
            job.put("status", "staging"); job.put("progress", 0); job.put("createdAt", System.currentTimeMillis());
            if (NativeUploadStore.part(getContext(), id, "media").exists()) throw new IllegalArgumentException("Upload already exists");
            NativeUploadStore.write(getContext(), job);
            call.resolve();
        });
    }
    @PluginMethod public void appendChunk(PluginCall call) {
        work(call, () -> {
            String id = call.getString("id");
            JSONObject job = NativeUploadStore.read(getContext(), id);
            if (!"staging".equals(job.optString("status"))) throw new IllegalArgumentException("Upload already started");
            String part = call.getString("part");
            byte[] bytes = Base64.decode(call.getString("data", ""), Base64.NO_WRAP);
            if (bytes.length > 512 * 1024) throw new IllegalArgumentException("Chunk too large");
            File file = NativeUploadStore.part(getContext(), id, part);
            long expected = job.getLong("cover".equals(part) ? "coverSize" : "size");
            if (file.length() + bytes.length > expected) throw new IllegalArgumentException("Unexpected file size");
            try (FileOutputStream out = new FileOutputStream(file, true)) { out.write(bytes); }
            call.resolve();
        });
    }
    @PluginMethod public void enqueue(PluginCall call) {
        work(call, () -> {
            String id = call.getString("id");
            JSONObject job = NativeUploadStore.read(getContext(), id);
            for (String part : new String[]{"media", "cover"}) {
                long expected = job.getLong("media".equals(part) ? "size" : "coverSize");
                File file = NativeUploadStore.part(getContext(), id, part);
                if (file.length() != expected || ("media".equals(part) && expected <= 0)) throw new IllegalArgumentException("File preparation incomplete");
                if (file.exists()) try (FileOutputStream out = new FileOutputStream(file, true)) { out.getFD().sync(); }
            }
            job.put("status", "queued"); NativeUploadStore.write(getContext(), job);
            try { ContextCompat.startForegroundService(getContext(), new Intent(getContext(), BackgroundUploadService.class)); }
            catch (Exception e) { job.put("status", "staging"); NativeUploadStore.write(getContext(), job); throw e; }
            call.resolve();
        });
    }
    @PluginMethod public void list(PluginCall call) {
        work(call, () -> {
            JSArray states = new JSArray();
            for (JSONObject job : NativeUploadStore.list(getContext())) states.put(NativeUploadStore.publicState(job));
            JSObject result = new JSObject(); result.put("jobs", states); call.resolve(result);
        });
    }
    @PluginMethod public void resume(PluginCall call) {
        work(call, () -> {
            if (!BackgroundUploadService.running) {
                for (JSONObject job : NativeUploadStore.list(getContext())) {
                    if (NativeUploadStore.active(job)) {
                        ContextCompat.startForegroundService(getContext(), new Intent(getContext(), BackgroundUploadService.class));
                        break;
                    }
                }
            }
            call.resolve();
        });
    }
    @PluginMethod public void acknowledge(PluginCall call) {
        work(call, () -> {
            JSONObject job = NativeUploadStore.read(getContext(), call.getString("id"));
            if (NativeUploadStore.active(job)) throw new IllegalArgumentException("Upload is running");
            NativeUploadStore.remove(getContext(), job.getString("id")); call.resolve();
        });
    }
    @PluginMethod public void markNotified(PluginCall call) {
        work(call, () -> { JSONObject job = NativeUploadStore.read(getContext(), call.getString("id"));
            job.put("notified", true); NativeUploadStore.write(getContext(), job); call.resolve(); });
    }
}
