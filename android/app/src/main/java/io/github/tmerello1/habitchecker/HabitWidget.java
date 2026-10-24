package io.github.tmerello1.habitchecker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.time.LocalDate;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Home screen widget listing today's open habits. Tapping it opens the app. A 📨 in the top
 * bar marks unread feedback (FeedbackJob.unread) and opens it when tapped. The bottom line
 * shows the level and how many medals, trophies and laurel wreaths were earned, as the web
 * app last saved them (rewards are worked out there, not here).
 */
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
        int scheduled = habits.onToday(today).size();
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
                if (!h.pile.isEmpty() && !h.isPrivate) {
                    list.append("  ·  ").append(ctx.getString(R.string.widget_pile, habits.pileCount(h, today)));
                }
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
        showRewards(ctx, views);
        String mail = FeedbackJob.unread(ctx);
        views.setViewVisibility(R.id.widget_mail, mail == null ? View.GONE : View.VISIBLE);
        if (mail != null) {
            Intent openMail = new Intent(ctx, MainActivity.class)
                    .setData(Uri.parse(MainActivity.START_URL + mail))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            views.setOnClickPendingIntent(R.id.widget_mail, PendingIntent.getActivity(
                    ctx, 1, openMail, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        manager.updateAppWidget(ids, views);
    }

    // "Level 12 · 🏅 5 · 🏆 2 · (wreath) 1", leaving out kinds not earned yet. The wreath is
    // a drawing, not an emoji, so it sits in its own ImageView at the end of the line.
    private static void showRewards(Context ctx, RemoteViews views) {
        JSONObject r;
        try {
            r = new JSONObject(Store.rewards(ctx));
        } catch (JSONException e) {
            views.setViewVisibility(R.id.widget_rewards, View.GONE);
            return;
        }
        StringBuilder text = new StringBuilder(ctx.getString(R.string.widget_level, r.optInt("level", 1)));
        int medals = r.optInt("medals"), trophies = r.optInt("trophies"), wreaths = r.optInt("wreaths");
        if (medals > 0) text.append("  ·  🏅 ").append(medals);
        if (trophies > 0) text.append("  ·  🏆 ").append(trophies);
        if (wreaths > 0) text.append("  ·");
        views.setTextViewText(R.id.widget_rewards_text, text);
        views.setViewVisibility(R.id.widget_laurel, wreaths > 0 ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_laurel_count, wreaths > 0 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_laurel_count, String.valueOf(wreaths));
        views.setViewVisibility(R.id.widget_rewards, View.VISIBLE);
    }
}
