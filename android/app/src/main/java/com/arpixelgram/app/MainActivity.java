package com.arpixelgram.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.util.Rational;
import android.view.WindowManager;
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
    private PowerManager.WakeLock wakeLock;
    public static volatile boolean isCallActive = false;
    private static volatile MainActivity instance;

    /** Called when the user taps "End call" on the ongoing-call notification. */
    public static void requestHangupFromNotification() {
        final MainActivity activity = instance;
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            try {
                activity.getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('appEndCallRequested'));",
                    null
                );
            } catch (Exception ignored) {}
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
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

    @Override
    protected void onDestroy() {
        if (instance == this) instance = null;
        try {
            Intent stop = new Intent(this, CallForegroundService.class);
            stop.setAction(CallForegroundService.ACTION_STOP);
            if (!isCallActive) startService(stop);
        } catch (Exception ignored) {}
        super.onDestroy();
    }

    private void startOrUpdateCallService(String action, String title, String body, boolean video, long startedAt) {
        try {
            Intent intent = new Intent(this, CallForegroundService.class);
            intent.setAction(action);
            intent.putExtra(CallForegroundService.EXTRA_TITLE, title != null ? title : "Ongoing call");
            intent.putExtra(CallForegroundService.EXTRA_BODY, body != null ? body : "Tap to return to the call");
            intent.putExtra(CallForegroundService.EXTRA_VIDEO, video);
            intent.putExtra(CallForegroundService.EXTRA_STARTED_AT, startedAt);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && CallForegroundService.ACTION_START.equals(action)) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void stopCallServiceInternal() {
        try {
            Intent intent = new Intent(this, CallForegroundService.class);
            intent.setAction(CallForegroundService.ACTION_STOP);
            startService(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onBackPressed() {
        if (isCallActive) {
            // Signal WebView to minimize the active call overlay
            runOnUiThread(() -> {
                try {
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('appCallBackPressed'));",
                        null
                    );
                } catch (Exception ignored) {}
            });

            // Enter Picture-in-Picture mode on Android 8.0+ if supported
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
                try {
                    PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder();
                    pipBuilder.setAspectRatio(new Rational(9, 16));
                    enterPictureInPictureMode(pipBuilder.build());
                    return;
                } catch (Exception ignored) {}
            }

            // Fallback: move task to back so call audio stays alive in the background
            moveTaskToBack(true);
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // If user hits Home or Recent Apps during a call, enter PiP window like Messenger
        if (isCallActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
                try {
                    PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder();
                    pipBuilder.setAspectRatio(new Rational(9, 16));
                    enterPictureInPictureMode(pipBuilder.build());
                } catch (Exception ignored) {}
            }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        runOnUiThread(() -> {
            try {
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('pipModeChanged', { detail: { isPip: " + isInPictureInPictureMode + " } }));",
                    null
                );
            } catch (Exception ignored) {}
        });
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            // 1. General alerts (Messages, likes, comments)
            NotificationChannel alertsChannel = new NotificationChannel(
                CHANNEL_ALERTS,
                "Alerts & Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertsChannel.setDescription("Chat messages, likes, and mentions");
            alertsChannel.enableLights(true);
            alertsChannel.setLightColor(Color.MAGENTA);
            alertsChannel.enableVibration(true);
            alertsChannel.setShowBadge(true);
            nm.createNotificationChannel(alertsChannel);

            // 2. Incoming and Ongoing Calls Channel
            NotificationChannel callsChannel = new NotificationChannel(
                CHANNEL_CALLS,
                "Audio & Video Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            callsChannel.setDescription("Live audio/video call notifications");
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

            // 3. Uploads Channel
            NotificationChannel uploadsChannel = new NotificationChannel(
                CHANNEL_UPLOADS,
                "Media Uploads",
                NotificationManager.IMPORTANCE_LOW
            );
            uploadsChannel.setDescription("Upload progress for reels and posts");
            nm.createNotificationChannel(uploadsChannel);
        }
    }

    public class NativeNotificationBridge {
        private final Context context;

        public NativeNotificationBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void setCallActive(boolean active, String title) {
            MainActivity.isCallActive = active;
            if (active) {
                CallForegroundService.hangupRequested = false;
                startOrUpdateCallService(
                    CallForegroundService.ACTION_START,
                    (title != null && !title.isEmpty()) ? title : "Ongoing call",
                    "Tap to return to the call",
                    title != null && title.toLowerCase().contains("video"),
                    System.currentTimeMillis()
                );
            } else {
                stopCallServiceInternal();
            }
            runOnUiThread(() -> {
                try {
                    if (active) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        if (wakeLock == null) {
                            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                            if (pm != null) {
                                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ar_pixelgram:call_wake");
                                wakeLock.acquire(4 * 60 * 60 * 1000L);
                            }
                        }
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        if (wakeLock != null && wakeLock.isHeld()) {
                            wakeLock.release();
                            wakeLock = null;
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public boolean getCallActive() {
            return MainActivity.isCallActive;
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
            if (isOngoing) {
                // Ongoing calls are owned by the foreground service so they survive
                // back press / app backgrounding just like Messenger.
                MainActivity.isCallActive = true;
                startOrUpdateCallService(
                    CallForegroundService.ACTION_UPDATE,
                    title,
                    body,
                    title != null && title.toLowerCase().contains("video"),
                    0L
                );
                return;
            }
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
        public void startCallService(String title, String body, boolean video, double startedAt) {
            MainActivity.isCallActive = true;
            CallForegroundService.hangupRequested = false;
            long started = startedAt > 0 ? (long) startedAt : System.currentTimeMillis();
            startOrUpdateCallService(CallForegroundService.ACTION_START, title, body, video, started);
        }

        @JavascriptInterface
        public void updateCallService(String title, String body, boolean video, double startedAt) {
            long started = startedAt > 0 ? (long) startedAt : System.currentTimeMillis();
            startOrUpdateCallService(CallForegroundService.ACTION_UPDATE, title, body, video, started);
        }

        @JavascriptInterface
        public void stopCallService() {
            MainActivity.isCallActive = false;
            stopCallServiceInternal();
        }

        @JavascriptInterface
        public void showNotification(String title, String body, String tag, String url, String icon) {
            showNotification(title, body, tag, url);
        }

        @JavascriptInterface
        public void showCallNotification(String title, String body, String tag, boolean isOngoing, String icon) {
            showCallNotification(title, body, tag, isOngoing);
        }

        @JavascriptInterface
        public void dismissNotification(String tag) {
            try {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                if (tag != null && !tag.isEmpty()) {
                    nm.cancel(tag, 7777);
                    nm.cancel(tag, 8888);
                    nm.cancel(tag, Math.abs(tag.hashCode()));
                    nm.cancel(7777);
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
