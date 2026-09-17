package com.arpixelgram.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 9001;
    public static final String CHANNEL_ALERTS = "ar_pixelgram_alerts_v2";
    public static final String CHANNEL_CALLS = "ar_pixelgram_calls_v2";
    public static final String CHANNEL_UPLOADS = "ar_pixelgram_uploads_v2";
    private static final AtomicInteger notifIdSeq = new AtomicInteger(100);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // Native Notification Bridge exposed directly to window.AndroidNotification
        webView.addJavascriptInterface(new NativeNotificationBridge(this), "AndroidNotification");

        webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    ensureRuntimePermissions();
                    request.grant(request.getResources());
                });
            }
        });

        ensureRuntimePermissions();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            // 1. Alerts Channel (Messages, Likes, Comments, Mentions, Follows)
            NotificationChannel alertsChannel = new NotificationChannel(
                CHANNEL_ALERTS,
                "Messages & Notifications",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertsChannel.setDescription("Notifications for chat messages, likes, comments, and mentions");
            alertsChannel.enableLights(true);
            alertsChannel.setLightColor(Color.MAGENTA);
            alertsChannel.enableVibration(true);
            alertsChannel.setVibrationPattern(new long[]{0, 250, 200, 250});
            nm.createNotificationChannel(alertsChannel);

            // 2. Calls Channel (Incoming & Active Calls)
            NotificationChannel callsChannel = new NotificationChannel(
                CHANNEL_CALLS,
                "Voice & Video Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            callsChannel.setDescription("Incoming and active audio/video call notifications");
            callsChannel.enableLights(true);
            callsChannel.setLightColor(Color.BLUE);
            callsChannel.enableVibration(true);
            callsChannel.setVibrationPattern(new long[]{0, 500, 500, 500});
            Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringtone != null) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                callsChannel.setSound(ringtone, audioAttributes);
            }
            nm.createNotificationChannel(callsChannel);

            // 3. Uploads Channel (Posts and Reels progress)
            NotificationChannel uploadsChannel = new NotificationChannel(
                CHANNEL_UPLOADS,
                "Media Uploads",
                NotificationManager.IMPORTANCE_LOW
            );
            uploadsChannel.setDescription("Upload progress for reels and posts");
            nm.createNotificationChannel(uploadsChannel);
        }
    }

    public static class NativeNotificationBridge {
        private final Context context;

        public NativeNotificationBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void showNotification(String title, String body, String tag, String url) {
            try {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                Intent intent = new Intent(context, MainActivity.class);
                intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                if (url != null && !url.isEmpty()) {
                    intent.putExtra("target_url", url);
                }
                PendingIntent pi = PendingIntent.getActivity(
                    context,
                    notifIdSeq.incrementAndGet(),
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
                );

                NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ALERTS)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .setContentIntent(pi)
                    .setDefaults(NotificationCompat.DEFAULT_ALL);

                int id = (tag != null && !tag.isEmpty()) ? Math.abs(tag.hashCode()) : notifIdSeq.incrementAndGet();
                nm.notify(tag, id, builder.build());
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void showCallNotification(String title, String body, String tag, boolean isOngoing) {
            try {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                Intent intent = new Intent(context, MainActivity.class);
                intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pi = PendingIntent.getActivity(
                    context,
                    999,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
                );

                NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_CALLS)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setOngoing(isOngoing)
                    .setAutoCancel(!isOngoing)
                    .setContentIntent(pi);

                if (!isOngoing) {
                    builder.setDefaults(NotificationCompat.DEFAULT_ALL);
                }

                int id = 7777;
                nm.notify(tag, id, builder.build());
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void showUploadNotification(int progress, String title, String body) {
            try {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                boolean complete = progress >= 100;
                NotificationCompat.Builder builder = new NotificationCompat.Builder(context, complete ? CHANNEL_ALERTS : CHANNEL_UPLOADS)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title != null ? title : (complete ? "Upload Complete! 🎉" : "Uploading..."))
                    .setContentText(body != null ? body : (progress + "%"))
                    .setPriority(complete ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_LOW)
                    .setOngoing(!complete)
                    .setAutoCancel(complete);

                if (!complete && progress >= 0) {
                    builder.setProgress(100, progress, false);
                } else if (!complete) {
                    builder.setProgress(0, 0, true);
                }

                nm.notify("upload_progress", 8888, builder.build());
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void dismissNotification(String tag) {
            try {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                if (tag != null && !tag.isEmpty()) {
                    if ("call_ongoing".equals(tag)) {
                        nm.cancel(tag, 7777);
                    } else if ("upload_progress".equals(tag)) {
                        nm.cancel(tag, 8888);
                    } else {
                        nm.cancel(tag, Math.abs(tag.hashCode()));
                    }
                } else {
                    nm.cancelAll();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void ensureRuntimePermissions() {
        List<String> needed = new ArrayList<>();
        addIfMissing(needed, Manifest.permission.CAMERA);
        addIfMissing(needed, Manifest.permission.RECORD_AUDIO);
        addIfMissing(needed, Manifest.permission.MODIFY_AUDIO_SETTINGS);

        if (Build.VERSION.SDK_INT >= 33) {
            addIfMissing(needed, Manifest.permission.POST_NOTIFICATIONS);
            addIfMissing(needed, Manifest.permission.READ_MEDIA_IMAGES);
            addIfMissing(needed, Manifest.permission.READ_MEDIA_VIDEO);
            addIfMissing(needed, Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            addIfMissing(needed, Manifest.permission.READ_EXTERNAL_STORAGE);
            addIfMissing(needed, Manifest.permission.WRITE_EXTERNAL_STORAGE);
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private void addIfMissing(List<String> list, String permission) {
        if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
            list.add(permission);
        }
    }
}
