package com.arpixelgram.app;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/**
 * Upload notification ka malik.
 * - Upload chalte waqt notification hata nahi sakte: swipe/Clear all karne par
 *   ye receiver use turant wapas laga deta hai (Android 14+ par bhi).
 * - Notification par tap karne se app khulta hai aur wahi page dikhta hai
 *   (upload ke baad naya reel / post / video).
 */
public class UploadNotificationReceiver extends BroadcastReceiver {
    public static final String ACTION_DISMISSED = "com.arpixelgram.app.UPLOAD_NOTIFICATION_DISMISSED";
    static final String TAG = "upload_progress";
    static final int ID = 8888;

    private static volatile boolean active = false;
    private static volatile int lastProgress = 0;
    private static volatile String lastTitle = "Uploading...";
    private static volatile String lastBody = "";
    private static volatile String lastUrl = "/";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_DISMISSED.equals(intent.getAction())) return;
        if (active) {
            show(context, lastProgress, lastTitle, lastBody, lastUrl, "uploading");
        }
    }

    /** App band ho gaya to upload bhi ruk gaya — atka hua notification hata do. */
    public static void clearIfActive(Context context) {
        if (!active) return;
        active = false;
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(TAG, ID);
        } catch (Exception ignored) {}
    }

    /** state: "uploading" | "complete" | "error" */
    public static void show(Context context, int progress, String title, String body, String url, String state) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            boolean uploading = state == null || "uploading".equals(state);
            boolean complete = "complete".equals(state);
            String target = (url != null && url.startsWith("/")) ? url : "/";
            int p = Math.max(0, Math.min(100, progress));

            active = uploading;
            if (uploading) {
                lastProgress = p;
                lastTitle = title;
                lastBody = body;
                lastUrl = target;
            }

            // Tap → app khule aur ye page dikhe
            Intent open = new Intent(context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            open.putExtra("notifUrl", target);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent contentPi = PendingIntent.getActivity(context, ID, open, flags);

            String channel = uploading ? MainActivity.CHANNEL_UPLOADS : MainActivity.CHANNEL_ALERTS;
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title != null ? title : (complete ? "Upload Complete! 🎉" : uploading ? "Uploading..." : "Upload Failed"))
                .setContentText(body != null ? body : (p + "%"))
                .setContentIntent(contentPi)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(uploading)
                .setOngoing(uploading)
                .setAutoCancel(!uploading)
                .setPriority(uploading ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_HIGH);

            if (uploading) {
                builder.setCategory(NotificationCompat.CATEGORY_PROGRESS);
                builder.setProgress(100, p, false);
                // Hatane ki koshish → receiver wapas dikha dega
                Intent dismissed = new Intent(context, UploadNotificationReceiver.class);
                dismissed.setAction(ACTION_DISMISSED);
                PendingIntent deletePi = PendingIntent.getBroadcast(context, ID + 1, dismissed, flags);
                builder.setDeleteIntent(deletePi);
            }

            nm.notify(TAG, ID, builder.build());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
