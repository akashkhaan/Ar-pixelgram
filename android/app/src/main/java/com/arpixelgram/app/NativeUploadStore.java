package com.arpixelgram.app;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** App-private durable state; never exposed through a JS URL or backed up. */
final class NativeUploadStore {
    static File root(Context c) {
        File dir = new File(c.getNoBackupFilesDir(), "background_uploads");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Upload folder unavailable");
        return dir;
    }
    static String checkedId(String id) {
        if (id == null || !id.matches("[a-fA-F0-9-]{36}")) throw new IllegalArgumentException("Invalid upload id");
        return id;
    }
    static File part(Context c, String id, String part) {
        if (!"media".equals(part) && !"cover".equals(part)) throw new IllegalArgumentException("Invalid media part");
        return new File(root(c), checkedId(id) + "." + part);
    }
    static synchronized JSONObject read(Context c, String id) throws Exception {
        AtomicFile f = new AtomicFile(new File(root(c), checkedId(id) + ".json"));
        return new JSONObject(new String(f.readFully(), StandardCharsets.UTF_8));
    }
    static synchronized void write(Context c, JSONObject job) throws Exception {
        AtomicFile f = new AtomicFile(new File(root(c), checkedId(job.getString("id")) + ".json"));
        FileOutputStream out = f.startWrite();
        try { out.write(job.toString().getBytes(StandardCharsets.UTF_8)); f.finishWrite(out); }
        catch (Exception e) { f.failWrite(out); throw e; }
    }
    static synchronized List<JSONObject> list(Context c) {
        List<JSONObject> result = new ArrayList<>();
        File[] files = root(c).listFiles();
        if (files != null) for (File f : files) if (f.getName().endsWith(".json")) {
            try { result.add(read(c, f.getName().substring(0, f.getName().length() - 5))); } catch (Exception ignored) {}
        }
        result.sort(Comparator.comparingLong(j -> j.optLong("createdAt")));
        return result;
    }
    static synchronized void remove(Context c, String id) {
        checkedId(id);
        for (String suffix : new String[]{".json", ".json.bak", ".json.new", ".media", ".cover"})
            new File(root(c), id + suffix).delete();
    }
    static boolean active(JSONObject job) {
        return "queued".equals(job.optString("status")) || "uploading".equals(job.optString("status"));
    }
    static JSONObject publicState(JSONObject job) throws Exception {
        JSONObject result = new JSONObject();
        for (String key : new String[]{"id", "persistentJobId", "userId", "kind", "label", "status", "progress", "recordId", "error", "caption", "visibility", "notified"})
            if (job.has(key)) result.put(key, job.get(key));
        return result;
    }
    static void releasePrivateData(Context c, JSONObject job) throws Exception {
        job.remove("accessToken"); job.remove("refreshToken"); job.remove("apikey");
        part(c, job.getString("id"), "media").delete();
        part(c, job.getString("id"), "cover").delete();
        write(c, job);
    }
}
