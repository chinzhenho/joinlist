package dev.joinlist.event;

import dev.joinlist.event.EventController.EventView;
import dev.joinlist.live.EventChanged;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Keeps what logged-out visitors see (the public event list, and event pages) in memory.
 *
 * <p>Why: when something changes, every open page is told at once and reloads at once. Without this, 100 open
 * pages means 100 identical database reads in the same second; with it, the first one reads and the other 99
 * get the copy. Every change clears the affected entries straight after it commits, so visitors never see old
 * seat counts. Entries also expire after a few seconds, so time-based changes (registration opening) show up.
 *
 * <p>Only anonymous views are cached: a logged-in visitor's page includes their own registration.
 */
@Component
public class PublicEventCache {

    private static final long TTL_MS = 5_000;

    private record Entry<T>(T value, long at) {}

    private volatile Entry<List<EventView>> list;
    private final Map<Long, Entry<EventView>> pages = new ConcurrentHashMap<>();

    public List<EventView> list(Supplier<List<EventView>> load) {
        Entry<List<EventView>> e = list;
        if (e == null || expired(e)) {
            e = new Entry<>(load.get(), System.currentTimeMillis());
            list = e;
        }
        return e.value();
    }

    public EventView page(long eventId, Supplier<EventView> load) {
        Entry<EventView> e = pages.get(eventId);
        if (e == null || expired(e)) {
            EventView v = load.get();
            e = new Entry<>(v, System.currentTimeMillis());
            if (pages.size() > 10_000) {
                pages.clear();
            }
            pages.put(eventId, e);
        }
        return e.value();
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void on(EventChanged change) {
        pages.remove(change.eventId());
        list = null;
    }

    private static boolean expired(Entry<?> e) {
        return System.currentTimeMillis() - e.at() > TTL_MS;
    }
}
