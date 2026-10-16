package io.github.tmerello1.habitchecker;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Native reminders. Unlike the PWA, which can only remind while it is open, these fire from
 * an alarm while the app is closed. One alarm is kept set for the next reminder time or the
 * next midnight, whichever is first; midnight is when the widget's "today" rolls over.
 */
final class Reminders {
    private static final String CHANNEL = "reminders";

    /** Sync everything with the saved state: widget, notifications and the next alarm. */
    static void update(Context ctx) {
        HabitWidget.refresh(ctx);
        notifyDue(ctx);
        schedule(ctx);
    }

    static void schedule(Context ctx) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime next = now.toLocalDate().plusDays(1).atStartOfDay();
        LocalDateTime reminder = new Habits(Store.state(ctx)).nextReminder(now);
        if (reminder != null && reminder.isBefore(next)) next = reminder;
        long at = next.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();

        Intent intent = new Intent(ctx, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_ALARM);
        PendingIntent pi = PendingIntent.getBroadcast(
                ctx, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        // Inexact so it needs no special permission; Android may deliver it a few minutes late.
        ctx.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    /** Shows due reminders that haven't fired today and clears those for habits now done. */
    private static void notifyDue(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(
                CHANNEL, ctx.getString(R.string.channel_name), NotificationManager.IMPORTANCE_DEFAULT));

        Habits habits = new Habits(Store.state(ctx));
        LocalDateTime now = LocalDateTime.now();
        String today = now.toLocalDate().toString();
        for (Habits.Habit h : habits.scheduled(LocalDate.now())) {
            if (habits.isDone(h, now.toLocalDate())) nm.cancel(h.id, 0);
        }
        if (!nm.areNotificationsEnabled()) return;

        Intent launch = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(
                ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        for (Habits.Habit h : habits.due(now)) {
            if (today.equals(Store.notified(ctx, h.id))) continue;
            Notification n = new Notification.Builder(ctx, CHANNEL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(ctx.getString(R.string.reminder_title, h.emoji, h.name))
                    .setContentText(ctx.getString(R.string.reminder_body))
                    .setContentIntent(tap)
                    .setAutoCancel(true)
                    .build();
            nm.notify(h.id, 0, n);
            Store.setNotified(ctx, h.id, today);
        }
    }

    private Reminders() {}
}
