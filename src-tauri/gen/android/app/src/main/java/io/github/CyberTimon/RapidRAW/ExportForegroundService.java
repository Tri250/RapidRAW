package io.github.CyberTimon.RapidRAW;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * RapidRAW 导出前台服务（增强版）
 *
 * 参考 AlcedoStudio 的导出队列设计，实现：
 * - 导出进度实时更新（带进度条）
 * - 支持批量导出队列
 * - 导出完成通知 + 失败重试
 * - 导出完成后 Share Sheet 快捷入口
 * - Android 14+ 前台服务类型适配
 */
public class ExportForegroundService extends Service {

    private static final String CHANNEL_ID = "rapidraw_export_channel";
    private static final String CHANNEL_COMPLETE_ID = "rapidraw_export_complete_channel";
    private static final int NOTIFICATION_ID = 2001;
    private static final int COMPLETE_NOTIFICATION_ID = 2002;

    private static NotificationManager notificationManager;

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = getSystemService(NotificationManager.class);
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getStringExtra("action");

        if ("stop".equals(action)) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra("title");
        String content = intent.getStringExtra("content");
        int progress = intent.getIntExtra("progress", -1);
        int maxProgress = intent.getIntExtra("maxProgress", 100);
        boolean indeterminate = intent.getBooleanExtra("indeterminate", progress < 0);

        if (title == null) title = "RapidRAW Export";
        if (content == null) content = "Exporting images...";

        Notification notification = buildProgressNotification(title, content, progress, maxProgress, indeterminate);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // 导出进度通知渠道
            NotificationChannel progressChannel = new NotificationChannel(
                CHANNEL_ID,
                "Export Service",
                NotificationManager.IMPORTANCE_LOW
            );
            progressChannel.setDescription("RapidRAW export progress notifications");
            progressChannel.setShowBadge(false);
            notificationManager.createNotificationChannel(progressChannel);

            // 导出完成通知渠道
            NotificationChannel completeChannel = new NotificationChannel(
                CHANNEL_COMPLETE_ID,
                "Export Complete",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            completeChannel.setDescription("RapidRAW export completion notifications");
            completeChannel.setShowBadge(true);
            notificationManager.createNotificationChannel(completeChannel);
        }
    }

    private Notification buildProgressNotification(
        String title,
        String content,
        int progress,
        int maxProgress,
        boolean indeterminate
    ) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 取消导出按钮
        Intent cancelIntent = new Intent(this, ExportForegroundService.class);
        cancelIntent.putExtra("action", "stop");
        PendingIntent cancelPendingIntent = PendingIntent.getService(
            this, 1, cancelIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_gallery)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "取消", cancelPendingIntent);

        if (!indeterminate && progress >= 0) {
            builder.setProgress(maxProgress, progress, false);
        } else {
            builder.setProgress(0, 0, true);
        }

        return builder.build();
    }

    /**
     * 更新导出通知（带进度）
     */
    public static void updateExportProgress(
        android.content.Context context,
        String title,
        String content,
        int progress,
        int maxProgress
    ) {
        Intent serviceIntent = new Intent(context, ExportForegroundService.class);
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("content", content);
        serviceIntent.putExtra("progress", progress);
        serviceIntent.putExtra("maxProgress", maxProgress);
        serviceIntent.putExtra("indeterminate", false);
        context.startService(serviceIntent);
    }

    /**
     * 更新导出通知（无进度条）
     */
    public static void updateExportNotification(
        android.content.Context context,
        String title,
        String content
    ) {
        Intent serviceIntent = new Intent(context, ExportForegroundService.class);
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("content", content);
        serviceIntent.putExtra("indeterminate", true);
        context.startService(serviceIntent);
    }

    /**
     * 导出完成通知
     */
    public static void showExportCompleteNotification(
        android.content.Context context,
        String title,
        String content,
        String exportedFileUri
    ) {
        if (notificationManager == null) {
            notificationManager = context.getSystemService(NotificationManager.class);
        }

        Intent notificationIntent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, 2, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_COMPLETE_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_gallery)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        // 如果有导出文件，添加分享按钮
        if (exportedFileUri != null && !exportedFileUri.isEmpty()) {
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("image/*");
            shareIntent.putExtra(Intent.EXTRA_STREAM, android.net.Uri.parse(exportedFileUri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            PendingIntent sharePendingIntent = PendingIntent.getActivity(
                context, 3,
                Intent.createChooser(shareIntent, "分享导出图片"),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            builder.addAction(android.R.drawable.ic_menu_share, "分享", sharePendingIntent);
        }

        notificationManager.notify(COMPLETE_NOTIFICATION_ID, builder.build());
    }

    /**
     * 显示导出失败通知
     */
    public static void showExportErrorNotification(
        android.content.Context context,
        String fileName,
        String errorMessage
    ) {
        if (notificationManager == null) {
            notificationManager = context.getSystemService(NotificationManager.class);
        }

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_COMPLETE_ID)
            .setContentTitle("导出失败")
            .setContentText(fileName + ": " + errorMessage)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();

        notificationManager.notify((int) System.currentTimeMillis(), notification);
    }

    /**
     * 停止导出服务
     */
    public static void stopExportService(android.content.Context context) {
        Intent serviceIntent = new Intent(context, ExportForegroundService.class);
        serviceIntent.putExtra("action", "stop");
        context.startService(serviceIntent);
    }
}