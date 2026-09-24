package com.arpixelgram.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Receives Firebase Cloud Messaging data messages and builds phone
 * notifications that look and behave like Instagram / Messenger / Facebook:
 *
 *  - like / comment / follow / reel events  -> Instagram-style alert with the
 *    actor's profile photo as the round large icon.
 *  - message / group_message / mention      -> Messenger-style messaging
 *    notification with sender name + photo (and the group name for groups).
 *  - call / group_call                      -> full-screen, ringing call
 *    notification with the caller's name + photo and Answer/Decline
 *    (Join/Decline for groups) buttons, so the call can be picked up straight
 *    from the notification even when the app is closed.
 *  - upload                                 -> Facebook-style 1..100 progress
 *    notification while a post / reel / story is uploading.
 */
public class ArFirebaseMessagingService extends FirebaseMessagingService {

    private static final int CALL_NOTIF_ID = 4321;

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        // Cached so the WebView can pick it up on next launch and store it in
        // Supabase against the signed-in user.
        getSharedPreferences("ar_pixelgram_push", MODE_PRIVATE)
            .edit().putString("fcm_token", token).apply();
        MainActivity.deliverFcmTokenToWeb(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();

        String type = value(data, "type", "");
        String title = value(data, "title", "AR Pixelgram");
        String body = value(data, "body", "");
        String tag = value(data, "tag", "arp_" + System.currentTimeMillis());
        String url = value(data, "url", "/");
        String icon = value(data, "icon", "");
        String callerName = value(data, "callerName", "");
        String groupName = value(data, "groupName", "");
        String callId = value(data, "callId", "");
        String kind = value(data, "kind", "audio");
        String peerId = value(data, "peerId", "");
        String groupId = value(data, "groupId", "");

        if (remoteMessage.getNotification() != null) {
            if (TextUtils.isEmpty(body) && remoteMessage.getNotification().getBody() != null) {
                body = remoteMessage.getNotification().getBody();
            }
            if (remoteMessage.getNotification().getTitle() != null && "AR Pixelgram".equals(title)) {
                title = remoteMessage.getNotification().getTitle();
            }
        }

        boolean isGroupCall = "group_call".equals(type);
        boolean isCall = isGroupCall || "call".equals(type) || "incoming_call".equals(type);

        if ("upload".equals(type)) {
            int progress = 0;
            try { progress = Integer.parseInt(value(data, "progress", "0")); } catch (Exception ignored) {}
            showUploadProgress(title, body, progress);
            return;
        }

        if ("call_cancelled".equals(type) || "call_ended".equals(type)) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.cancel(CALL_NOTIF_ID);
            return;
        }

        Bitmap avatar = loadBitmap(icon);

        if (isCall) {
            showIncomingCall(title, body, callerName, groupName, kind, peerId, groupId, callId, url, avatar, isGroupCall);
            return;
        }

        showStandard(type, title, body, tag, url, avatar);
    }

    // ---------------------------------------------------------------- calls

    private void showIncomingCall(String title, String body, String callerName, String groupName,
                                  String kind, String peerId, String groupId, String callId,
                                  String url, Bitmap avatar, boolean isGroupCall) {
        String who = !TextUtils.isEmpty(callerName) ? callerName : title;
        String label = "video".equalsIgnoreCase(kind) ? "video call" : "audio call";
        String contentTitle = isGroupCall
            ? (!TextUtils.isEmpty(groupName) ? groupName : "Group call")
            : who;
        String contentText = isGroupCall
            ? who + " started a group " + label
            : "Incoming " + label;
        if (!TextUtils.isEmpty(body) && !isGroupCall) contentText = body;

        PendingIntent open = actionIntent("open", url, kind, peerId, groupId, callId, 501);
        PendingIntent answer = actionIntent(isGroupCall ? "join" : "answer", url, kind, peerId, groupId, callId, 502);
        PendingIntent decline = actionIntent("decline", url, kind, peerId, groupId, callId, 503);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MainActivity.CHANNEL_CALLS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(contentTitle)
            .setContentText(contentText)
            .setSubText(isGroupCall ? "Group " + label : label)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOngoing(true)
            .setContentIntent(answer)
            .setFullScreenIntent(open, true)
            .setDefaults(Notification.DEFAULT_ALL)
            .addAction(R.mipmap.ic_launcher, isGroupCall ? "Join" : "Answer", answer)
            .addAction(R.mipmap.ic_launcher, "Decline", decline);

        if (avatar == null) avatar = initialsBitmap(isGroupCall ? contentTitle : who);
        if (avatar != null) {
            builder.setLargeIcon(circle(avatar));
            try {
                Person caller = new Person.Builder()
                    .setName(who)
                    .setIcon(IconCompat.createWithBitmap(circle(avatar)))
                    .setImportant(true)
                    .build();
                builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer));
            } catch (Exception ignored) {
                // CallStyle needs a newer AndroidX core; the actions above already cover it.
            }
        }

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(CALL_NOTIF_ID, builder.build());
    }

    private PendingIntent actionIntent(String action, String url, String kind, String peerId,
                                       String groupId, String callId, int requestCode) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("com.arpixelgram.app.CALL_ACTION_" + action.toUpperCase());
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("callAction", action);
        intent.putExtra("notifUrl", url);
        intent.putExtra("callKind", kind);
        intent.putExtra("peerId", peerId);
        intent.putExtra("groupId", groupId);
        intent.putExtra("callId", callId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, requestCode, intent, flags);
    }

    // ----------------------------------------------------- normal alerts

    private void showStandard(String type, String title, String body, String tag, String url, Bitmap avatar) {
        boolean messaging = "message".equals(type) || "group_message".equals(type)
            || "group_mention".equals(type) || "story_reply".equals(type);

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("notifUrl", url);
        open.setData(Uri.parse("arpixelgram://open" + url));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, Math.abs(tag.hashCode()), open, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MainActivity.CHANNEL_ALERTS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(messaging ? NotificationCompat.CATEGORY_MESSAGE : NotificationCompat.CATEGORY_SOCIAL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(pi);

        if (avatar != null) builder.setLargeIcon(circle(avatar));
        if (messaging) builder.setGroup("ar_pixelgram_messages");

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(tag, Math.abs(tag.hashCode()), builder.build());
    }

    private void showUploadProgress(String title, String body, int progress) {
        boolean done = progress >= 100;
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 777, open, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MainActivity.CHANNEL_UPLOADS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(done ? body : progress + "% complete")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(!done)
            .setAutoCancel(done)
            .setContentIntent(pi);
        if (!done) builder.setProgress(100, Math.max(1, progress), false);

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(9911, builder.build());
    }

    // ---------------------------------------------------------------- utils

    private static String value(Map<String, String> data, String key, String fallback) {
        String v = data.get(key);
        return (v == null || v.isEmpty()) ? fallback : v;
    }

    private Bitmap initialsBitmap(String name) {
        try {
            int size = 256;
            Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas c = new android.graphics.Canvas(bmp);
            android.graphics.Paint bg = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
            bg.setColor(0xFF0A7CFF);
            c.drawCircle(size / 2f, size / 2f, size / 2f, bg);
            String letter = TextUtils.isEmpty(name) ? "?" : name.trim().substring(0, 1).toUpperCase();
            android.graphics.Paint tp = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
            tp.setColor(0xFFFFFFFF);
            tp.setTextSize(120f);
            tp.setTextAlign(android.graphics.Paint.Align.CENTER);
            tp.setFakeBoldText(true);
            float y = size / 2f - (tp.descent() + tp.ascent()) / 2f;
            c.drawText(letter, size / 2f, y, tp);
            return bmp;
        } catch (Exception e) { return null; }
    }

    private Bitmap loadBitmap(String src) {
        if (TextUtils.isEmpty(src) || !src.startsWith("http")) return null;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(src).openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoInput(true);
            conn.connect();
            InputStream in = conn.getInputStream();
            Bitmap bmp = BitmapFactory.decodeStream(in);
            in.close();
            return bmp;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Crops a square/centre circle so profile photos look like Messenger's. */
    private Bitmap circle(Bitmap source) {
        try {
            int size = Math.min(source.getWidth(), source.getHeight());
            Bitmap square = Bitmap.createBitmap(
                source,
                (source.getWidth() - size) / 2,
                (source.getHeight() - size) / 2,
                size,
                size
            );
            Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(output);
            android.graphics.Paint paint = new android.graphics.Paint();
            paint.setAntiAlias(true);
            paint.setShader(new android.graphics.BitmapShader(
                square,
                android.graphics.Shader.TileMode.CLAMP,
                android.graphics.Shader.TileMode.CLAMP
            ));
            canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
            return output;
        } catch (Exception e) {
            return source;
        }
    }
}
