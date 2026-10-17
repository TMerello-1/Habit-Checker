package io.github.tmerello1.habitchecker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.time.LocalDate;
import java.util.List;

/** Home screen widget listing today's open habits. Tapping it opens the app. */
public class HabitWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        render(ctx, manager, ids);
        Reminders.schedule(ctx);
    }

    static void refresh(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        render(ctx, manager, manager.getAppWidgetIds(new ComponentName(ctx, HabitWidget.class)));
    }

    private static void render(Context ctx, AppWidgetManager manager, int[] ids) {
        if (ids.length == 0) return;
        String state = Store.state(ctx);
        Habits habits = new Habits(state);
        LocalDate today = LocalDate.now();
        int scheduled = habits.scheduled(today).size();
        List<Habits.Habit> open = habits.open(today);

        String count;
        StringBuilder list = new StringBuilder();
        if (state == null) {
            count = "";
            list.append(ctx.getString(R.string.widget_first_open));
        } else if (scheduled == 0) {
            count = "";
            list.append(ctx.getString(R.string.widget_nothing_today));
        } else if (open.isEmpty()) {
            count = ctx.getString(R.string.widget_count, scheduled, scheduled);
            list.append(ctx.getString(R.string.widget_all_done));
        } else {
            count = ctx.getString(R.string.widget_count, scheduled - open.size(), scheduled);
            for (Habits.Habit h : open) {
                if (list.length() > 0) list.append('\n');
                list.append(h.isPrivate ? ctx.getString(R.string.widget_private) : h.label());
                if (!h.time.isEmpty()) list.append("  ·  ").append(h.time);
            }
        }

        Intent launch = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(
                ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.habit_widget);
        views.setTextViewText(R.id.widget_count, count);
        views.setTextViewText(R.id.widget_list, list);
        views.setOnClickPendingIntent(R.id.widget_root, tap);
        manager.updateAppWidget(ids, views);
    }
}
