package com.arpixelgram.app;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Hello Tune ke liye phone ke saare gaane (MP3/M4A...) MediaStore se list karta hai.
 * Android 13+ par READ_MEDIA_AUDIO, purane phone par READ_EXTERNAL_STORAGE maangta hai.
 */
@CapacitorPlugin(
    name = "DeviceMusic",
    permissions = {
        @Permission(alias = "mediaAudio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class DeviceMusicPlugin extends Plugin {
    private static final long MAX_READ_BYTES = 25L * 1024L * 1024L;

    private String audioAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "mediaAudio" : "storage";
    }

    @PluginMethod
    public void listSongs(PluginCall call) {
        if (getPermissionState(audioAlias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(audioAlias(), call, "onAudioPermission");
            return;
        }
        querySongs(call);
    }

    @PermissionCallback
    private void onAudioPermission(PluginCall call) {
        if (getPermissionState(audioAlias()) == PermissionState.GRANTED) {
            querySongs(call);
        } else {
            call.reject("Gaane dikhane ke liye Music/Audio permission do", "PERMISSION_DENIED");
        }
    }

    private void querySongs(PluginCall call) {
        new Thread(() -> {
            JSArray songs = new JSArray();
            Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.MIME_TYPE
            };
            String selection = MediaStore.Audio.Media.DURATION + " >= 5000";
            try (Cursor cursor = getContext().getContentResolver().query(
                collection, projection, selection, null,
                MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC")) {
                if (cursor != null) {
                    int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                    int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                    int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                    int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                    int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);
                    int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                    int mimeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE);
                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(idCol);
                        JSObject song = new JSObject();
                        song.put("id", String.valueOf(id));
                        song.put("uri", ContentUris.withAppendedId(collection, id).toString());
                        song.put("title", cursor.getString(titleCol));
                        String artist = cursor.getString(artistCol);
                        song.put("artist", artist == null || "<unknown>".equals(artist) ? "" : artist);
                        song.put("durationMs", cursor.getLong(durationCol));
                        song.put("size", cursor.getLong(sizeCol));
                        song.put("fileName", cursor.getString(nameCol));
                        song.put("mimeType", cursor.getString(mimeCol));
                        songs.put(song);
                    }
                }
                JSObject result = new JSObject();
                result.put("songs", songs);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Phone ke gaane load nahi hue: " + error.getMessage());
            }
        }).start();
    }

    /** Fallback: gaane ki file base64 me (agar WebView content:// fetch na kar paye). */
    @PluginMethod
    public void readSong(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || !uri.startsWith("content://")) {
            call.reject("Galat gaana");
            return;
        }
        new Thread(() -> {
            try (InputStream input = getContext().getContentResolver().openInputStream(Uri.parse(uri))) {
                if (input == null) throw new Exception("File nahi khuli");
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] chunk = new byte[64 * 1024];
                long total = 0;
                int read;
                while ((read = input.read(chunk)) != -1) {
                    total += read;
                    if (total > MAX_READ_BYTES) throw new Exception("Gaana 25 MB se bada hai");
                    output.write(chunk, 0, read);
                }
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Gaana padh nahi paye: " + error.getMessage());
            }
        }).start();
    }
}
