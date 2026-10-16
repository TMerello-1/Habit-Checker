package io.github.tmerello1.habitchecker;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reads the web app's saved state (the localStorage JSON from src/store.js) and answers the
 * same questions as src/habits.js: which habits are scheduled on a day and which are still
 * open. Keep isScheduled() in step with the JavaScript version.
 */
final class Habits {
    static final class Habit {
        final String id, name, emoji, time;
        final JSONObject json;

        Habit(JSONObject h) {
            json = h;
            id = h.optString("id");
            name = h.optString("name");
            emoji = h.optString("emoji", "✅");
            time = h.optString("time", "");
        }

        String label() {
            return emoji + "  " + name;
        }
    }

    private final List<Habit> habits = new ArrayList<>();
    private final JSONObject completions;

    Habits(String stateJson) {
        JSONObject state;
        try {
            state = new JSONObject(stateJson == null ? "{}" : stateJson);
        } catch (Exception e) {
            state = new JSONObject();
        }
        JSONArray list = state.optJSONArray("habits");
        for (int i = 0; list != null && i < list.length(); i++) {
            JSONObject h = list.optJSONObject(i);
            if (h != null) habits.add(new Habit(h));
        }
        JSONObject c = state.optJSONObject("completions");
        completions = c == null ? new JSONObject() : c;
    }

    boolean isEmpty() {
        return habits.isEmpty();
    }

    /** Dates are local calendar keys, "YYYY-MM-DD", which is LocalDate's own format. */
    static boolean isScheduled(Habit habit, LocalDate date) {
        String key = date.toString();
        if (key.compareTo(habit.json.optString("createdAt", "")) < 0) return false;
        int weekday = date.getDayOfWeek().getValue() % 7; // JS getDay(): 0 = Sunday
        JSONArray days = habit.json.optJSONArray("days");
        JSONArray past = habit.json.optJSONArray("pastDays");
        for (int i = 0; past != null && i < past.length(); i++) {
            JSONObject p = past.optJSONObject(i);
            if (p != null && key.compareTo(p.optString("until")) < 0) {
                days = p.optJSONArray("days");
                break;
            }
        }
        for (int i = 0; days != null && i < days.length(); i++) {
            if (days.optInt(i, -1) == weekday) return true;
        }
        return false;
    }

    boolean isDone(Habit habit, LocalDate date) {
        JSONArray done = completions.optJSONArray(habit.id);
        String key = date.toString();
        for (int i = 0; done != null && i < done.length(); i++) {
            if (key.equals(done.optString(i))) return true;
        }
        return false;
    }

    List<Habit> scheduled(LocalDate date) {
        List<Habit> out = new ArrayList<>();
        for (Habit h : habits) if (isScheduled(h, date)) out.add(h);
        return out;
    }

    List<Habit> open(LocalDate date) {
        List<Habit> out = new ArrayList<>();
        for (Habit h : scheduled(date)) if (!isDone(h, date)) out.add(h);
        return out;
    }

    /** Open habits on `now`'s day whose reminder time has passed, like dueReminders(). */
    List<Habit> due(LocalDateTime now) {
        List<Habit> out = new ArrayList<>();
        for (Habit h : open(now.toLocalDate())) {
            LocalTime t = parseTime(h.time);
            if (t != null && !t.isAfter(now.toLocalTime())) out.add(h);
        }
        return out;
    }

    /** The next reminder time after `now` within a week, or null if none. */
    LocalDateTime nextReminder(LocalDateTime now) {
        for (int d = 0; d <= 7; d++) {
            LocalDate date = now.toLocalDate().plusDays(d);
            LocalDateTime best = null;
            for (Habit h : open(date)) {
                LocalTime t = parseTime(h.time);
                if (t == null) continue;
                LocalDateTime at = date.atTime(t);
                if (at.isAfter(now) && (best == null || at.isBefore(best))) best = at;
            }
            if (best != null) return best;
        }
        return null;
    }

    private static LocalTime parseTime(String hhmm) {
        try {
            return hhmm.isEmpty() ? null : LocalTime.parse(hhmm);
        } catch (Exception e) {
            return null;
        }
    }
}
