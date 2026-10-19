package io.github.tmerello1.habitchecker;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reads the web app's saved state (the localStorage JSON from src/store.js) and answers the
 * same questions as src/habits.js: which habits are scheduled on a day and which are still
 * open. Keep isScheduled() and the pile rules (pileCount, isOpen, remindOn) in step with
 * the JavaScript version.
 */
final class Habits {
    static final class Habit {
        final String id, name, emoji, time;
        /** "day", "week" or "month" for a pile habit, "" otherwise. */
        final String pile;
        /** Private habits are listed and reminded without their name. */
        final boolean isPrivate;
        final JSONObject json;

        Habit(JSONObject h) {
            json = h;
            id = h.optString("id");
            name = h.optString("name");
            emoji = h.optString("emoji", "✅");
            time = h.optString("time", "");
            isPrivate = h.optBoolean("private", false);
            String p = h.optString("pile", "");
            pile = p.equals("day") || p.equals("week") || p.equals("month") ? p : "";
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

    /** Pile habits: the first and last day of the period (day, week from Monday, month). */
    static LocalDate periodStart(String period, LocalDate date) {
        if (period.equals("week")) return date.minusDays(date.getDayOfWeek().getValue() - 1);
        if (period.equals("month")) return date.withDayOfMonth(1);
        return date;
    }

    static LocalDate periodEnd(String period, LocalDate date) {
        if (period.equals("week")) return periodStart(period, date).plusDays(6);
        if (period.equals("month")) return date.with(TemporalAdjusters.lastDayOfMonth());
        return date;
    }

    /** Rounds still to do this period, like pileCount(): planned days so far minus rounds done. */
    int pileCount(Habit habit, LocalDate date) {
        LocalDate start = periodStart(habit.pile, date);
        // Days before the pile was switched on don't count (pileFrom() in habits.js).
        String since = habit.json.optString("pileSince", "");
        if (since.compareTo(start.toString()) > 0) start = LocalDate.parse(since);
        int n = 0;
        for (LocalDate d = start; !d.isAfter(date); d = d.plusDays(1)) if (isScheduled(habit, d)) n++;
        JSONArray done = completions.optJSONArray(habit.id);
        String from = start.toString(), to = date.toString();
        for (int i = 0; done != null && i < done.length(); i++) {
            String k = done.optString(i);
            if (k.compareTo(from) >= 0 && k.compareTo(to) <= 0) n--;
        }
        return n;
    }

    boolean isOpen(Habit habit, LocalDate date) {
        if (!habit.pile.isEmpty()) return pileCount(habit, date) > 0;
        return isScheduled(habit, date) && !isDone(habit, date);
    }

    boolean remindOn(Habit habit, LocalDate date) {
        if (!isOpen(habit, date)) return false;
        return isScheduled(habit, date) || (!habit.pile.isEmpty() && date.equals(periodEnd(habit.pile, date)));
    }

    /** Today's list, like onToday(): scheduled habits plus pile habits that still owe rounds. */
    List<Habit> onToday(LocalDate date) {
        List<Habit> out = new ArrayList<>();
        for (Habit h : habits) {
            if (isScheduled(h, date) || (!h.pile.isEmpty() && pileCount(h, date) > 0)) out.add(h);
        }
        return out;
    }

    List<Habit> open(LocalDate date) {
        List<Habit> out = new ArrayList<>();
        for (Habit h : habits) if (isOpen(h, date)) out.add(h);
        return out;
    }

    List<Habit> all() {
        return habits;
    }

    private List<Habit> remindable(LocalDate date) {
        List<Habit> out = new ArrayList<>();
        for (Habit h : habits) if (remindOn(h, date)) out.add(h);
        return out;
    }

    /** Habits to remind on `now`'s day whose reminder time has passed, like dueReminders(). */
    List<Habit> due(LocalDateTime now) {
        List<Habit> out = new ArrayList<>();
        for (Habit h : remindable(now.toLocalDate())) {
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
            for (Habit h : remindable(date)) {
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
