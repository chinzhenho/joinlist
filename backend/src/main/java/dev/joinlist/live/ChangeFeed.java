package dev.joinlist.live;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Live updates with Server-Sent Events. Every open page keeps one connection to GET /api/stream.
 *
 * <p>When data changes, we only say WHICH events changed ("changed: 12,15"); each page then re-reads what
 * it shows through the normal API, with its own login and permission checks. So the stream never leaks
 * names, emails or anything private.
 *
 * <p>Changes are collected and sent at most once per second. If 1000 people register in one second, open
 * pages get one message instead of 1000, so they reload once instead of hammering the server.
 *
 * <p>Known limit: connections live in this server's memory. With several servers, a change on one wouldn't
 * reach pages connected to another; PostgreSQL LISTEN/NOTIFY or Redis pub/sub would fix that.
 */
@RestController
public class ChangeFeed {

    private static final Logger log = LoggerFactory.getLogger(ChangeFeed.class);

    private final Set<SseEmitter> clients = ConcurrentHashMap.newKeySet();
    private final Set<Long> changed = ConcurrentHashMap.newKeySet();

    @GetMapping("/api/stream")
    public ResponseEntity<SseEmitter> subscribe() {
        // Closed after 30 minutes; the browser reconnects by itself and reloads in case it missed something.
        SseEmitter client = new SseEmitter(Duration.ofMinutes(30).toMillis());
        clients.add(client);
        client.onCompletion(() -> clients.remove(client));
        client.onTimeout(() -> clients.remove(client));
        client.onError(e -> clients.remove(client));
        try {
            client.send(SseEmitter.event().name("ready").data("ok"));
        } catch (IOException e) {
            clients.remove(client);
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Accel-Buffering", "no") // ask proxies not to hold messages back
                .body(client);
    }

    /** Runs after the transaction commits, so pages never re-read data that might still be rolled back. */
    @TransactionalEventListener(fallbackExecution = true)
    public void on(EventChanged change) {
        changed.add(change.eventId());
    }

    @Scheduled(fixedDelay = 1000)
    void flush() {
        if (changed.isEmpty()) {
            return;
        }
        List<Long> ids = new ArrayList<>();
        for (Long id : changed) {
            if (changed.remove(id)) {
                ids.add(id);
            }
        }
        String data = ids.stream().sorted().map(String::valueOf).collect(Collectors.joining(","));
        broadcast(() -> SseEmitter.event().name("changed").data(data));
    }

    /**
     * A "ping" every 25 s. It keeps idle connections from being closed by proxies, and lets the page notice a
     * connection that died silently (no ping for a minute = reconnect). It's a real event, not an SSE comment,
     * because browsers don't show comments to the page.
     */
    @Scheduled(fixedDelay = 25_000)
    void heartbeat() {
        broadcast(() -> SseEmitter.event().name("ping").data(""));
    }

    /**
     * As soon as shutdown starts, close every open connection. Otherwise the server's graceful shutdown waits
     * up to 30 s for these never-ending requests. Browsers reconnect to the new server by themselves.
     */
    @EventListener(ContextClosedEvent.class)
    void closeAll() {
        for (SseEmitter client : clients) {
            client.complete();
        }
        clients.clear();
    }

    public int clientCount() {
        return clients.size();
    }

    /** A fresh message per client: a built SSE message can't be sent twice. */
    private void broadcast(Supplier<SseEmitter.SseEventBuilder> message) {
        for (SseEmitter client : clients) {
            try {
                client.send(message.get());
            } catch (IOException | IllegalStateException e) {
                // The page was closed. Drop it quietly.
                clients.remove(client);
                log.debug("Dropped a live-update client: {}", e.getMessage());
            }
        }
    }
}
