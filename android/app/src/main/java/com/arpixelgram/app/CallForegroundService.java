package com.arpixelgram.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/**
 * Keeps an audio/video call alive exactly like Messenger does:
 * a foreground service with an ongoing call notification. Because the call
 * lives in a foreground service, pressing back or leaving the app does not
 * kill the WebView process, so the call keeps running and the notification
 * stays visible in the phone's notification tray with a live timer.
 */
public class CallForegroundService extends Service {
    public static final String CHANNEL_ONGOING = "ar_pixelgram_ongoing_call_v1";
    public static final int NOTIF_ID = 7788;

    public static final String ACTION_START = "com.arpixelgram.app.CALL_START";
    public static final String ACTION_UPDATE = "com.arpixelgram.app.CALL_UPDATE";
    public static final String ACTION_STOP = "com.arpixelgram.app.CALL_STOP";
    public static final String ACTION_HANGUP = "com.arpixelgram.app.CALL_HANGUP";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_VIDEO = "video";
    public static final String EXTRA_STARTED_AT = "startedAt";

    /** Set when the user taps "End call" on the notification. */
    public static volatile boolean hangupRequested = false;

    private String title = "Ongoing call";
    private String body = "Tap to return to the call";
    private boolean video = false;
    private long startedAt = 0L;
    private boolean isForeground = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;

        if (ACTION_STOP.equals(action)) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }

        if (ACTION_HANGUP.equals(action)) {
            hangupRequested = true;
            MainActivity.requestHangupFromNotification();
            stopSelfSafely();
            return START_NOT_STICKY;
        }

        if (intent != null) {
            if (intent.hasExtra(EXTRA_TITLE)) title = intent.getStringExtra(EXTRA_TITLE);
            if (intent.hasExtra(EXTRA_BODY)) body = intent.getStringExtra(EXTRA_BODY);
            if (intent.hasExtra(EXTRA_VIDEO)) video = intent.getBooleanExtra(EXTRA_VIDEO, false);
            if (intent.hasExtra(EXTRA_STARTED_AT)) startedAt = intent.getLongExtra(EXTRA_STARTED_AT, 0L);
        }
        if (startedAt <= 0L) startedAt = System.currentTimeMillis();

        Notification notification = buildNotification();

        if (ACTION_UPDATE.equals(action) && isForeground) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(NOTIF_ID, notification);
            return START_STICKY;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                if (video) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
                startForeground(NOTIF_ID, notification, type);
            } else {
                startForeground(NOTIF_ID, notification);
            }
            isForeground = true;
        } catch (Exception e) {
            try {
                startForeground(NOTIF_ID, notification);
                isForeground = true;
            } catch (Exception ignored) {}
        }
        return START_STICKY;
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent openPi = PendingIntent.getActivity(this, 991, open, flags);

        Intent hangup = new Intent(this, CallForegroundService.class);
        hangup.setAction(ACTION_HANGUP);
        PendingIntent hangupPi = PendingIntent.getService(this, 992, hangup, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ONGOING)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setWhen(startedAt)
            .setContentIntent(openPi)
            .setFullScreenIntent(openPi, false)
            .addAction(R.mipmap.ic_launcher, "End call", hangupPi);

        return builder.build();
    }

    private void stopSelfSafely() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(Service.STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {}
        isForeground = false;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIF_ID);
        stopSelf();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ONGOING,
                "Ongoing calls",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows the live call while you use other screens");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            nm.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIF_ID);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
