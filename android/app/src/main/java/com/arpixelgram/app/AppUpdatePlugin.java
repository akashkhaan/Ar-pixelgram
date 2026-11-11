package com.arpixelgram.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-app update: GitHub Actions har build ke saath "latest" release me
 * ar-pixelgram.apk daalta hai. Ye plugin APK download karta hai aur
 * Android installer kholta hai.
 * Same signing key + same package => purane app ke upar update hota hai,
 * login / data nahi hat-ta.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String RELEASE_BASE = "https://github.com/akashkhaan/Ar-pixelgram/releases/download/latest/";
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;

    private PackageInfo selfInfo() throws Exception {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
    }

    @SuppressWarnings("deprecation")
    private long versionCodeOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setUseCaches(false);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Cache-Control", "no-cache");
        return c;
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = selfInfo();
            JSObject r = new JSObject();
            r.put("versionCode", versionCodeOf(info));
            r.put("versionName", info.versionName);
            int id = getContext().getResources().getIdentifier("build_commit", "string", getContext().getPackageName());
            r.put("commit", id != 0 ? getContext().getString(id) : "");
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** APK download karke installer kholta hai. Progress "progress" event me aata hai. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        if (downloading) { call.reject("Already downloading"); return; }
        final long expectedCode = call.getLong("versionCode", 0L);
        downloading = true;
        io.execute(() -> {
            HttpURLConnection c = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Storage error");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                    f.delete();
                File apk = new File(dir, "ar-pixelgram-update.apk");

                c = open(RELEASE_BASE + "ar-pixelgram.apk?t=" + System.currentTimeMillis());
                int code = c.getResponseCode();
                if (code != 200) throw new IllegalStateException("Download failed (HTTP " + code + ")");
                long total = c.getContentLengthLong();
                long done = 0; int lastPct = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024]; int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject p = new JSObject();
                            p.put("percent", pct);
                            p.put("downloaded", done);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (total > 0 && done != total) throw new IllegalStateException("Download incomplete");

                // Sirf apna hi app install ho, aur purane se naya ho
                PackageInfo archive = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
                if (archive == null || !getContext().getPackageName().equals(archive.packageName))
                    throw new IllegalStateException("Downloaded file is not a valid Pixelgram update");
                long newCode = versionCodeOf(archive);
                if (newCode <= versionCodeOf(selfInfo()))
                    throw new IllegalStateException("Already on the latest version");
                if (expectedCode > 0 && newCode < expectedCode)
                    throw new IllegalStateException("Update still publishing, try again in a minute");

                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Update failed" : e.getMessage());
            } finally {
                downloading = false;
                if (c != null) c.disconnect();
            }
        });
    }
}
