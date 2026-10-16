package io.github.tmerello1.habitchecker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Wakes for the next reminder or midnight, and re-arms after a reboot or clock change. */
public class AlarmReceiver extends BroadcastReceiver {
    static final String ACTION_ALARM = "io.github.tmerello1.habitchecker.ALARM";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        Reminders.update(ctx);
    }
}
