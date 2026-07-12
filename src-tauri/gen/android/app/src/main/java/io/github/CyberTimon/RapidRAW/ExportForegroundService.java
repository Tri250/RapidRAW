package io.github.CyberTimon.RapidRAW;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * RapidRAW 导出前台服务
 * 确保导出任务在后台运行时不会被系统杀死
 */
public class ExportForegroundService extends Service {

    private static final String CHANNEL_ID = "rapidraw_export_channel";
    private static final int NOTIFICATION_ID = 2001;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = "RapidRAW Export";
        String content = "Exporting images...";

        if (intent != null) {
            title = intent.getStringExtra("title") != null
                ? intent.getStringExtra("title") : title;
            content = intent.getStringExtra("content") != null
                ? intent.getStringExtra("content") : content;
        }

        Notification notification = buildNotification(title, content);
        startForeground(NOTIFICATION_ID, notification);

        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Export Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("RapidRAW export progress notifications");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String title, String content) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_gallery)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    /**
     * 更新导出通知内容
     */
    public static void updateExportNotification(android.content.Context context, String title, String content) {
        Intent serviceIntent = new Intent(context, ExportForegroundService.class);
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("content", content);
        context.startService(serviceIntent);
    }

    /**
     * 停止导出服务
     */
    public static void stopExportService(android.content.Context context) {
        Intent serviceIntent = new Intent(context, ExportForegroundService.class);
        context.stopService(serviceIntent);
    }
}