package dev.joinlist;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Inserts users and events straight into the database so tests can focus on one thing. */
@Component
public class TestData {

    private final JdbcClient db;

    public TestData(JdbcClient db) {
        this.db = db;
    }

    public long user() {
        return users(1).getFirst();
    }

    public List<Long> users(int count) {
        String batch = UUID.randomUUID().toString().substring(0, 8);
        List<Long> ids = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            ids.add(db.sql("INSERT INTO users (name, email, password_hash) VALUES (?, ?, 'x') RETURNING id")
                    .params("User " + i, "u" + i + "-" + batch + "@test.dev")
                    .query(Long.class)
                    .single());
        }
        return ids;
    }

    /** A published event that is open for registration right now and starts tomorrow. */
    public long openEvent(int capacity) {
        long organizer = user();
        return db.sql("""
                INSERT INTO events (organizer_id, title, location, starts_at, registration_opens_at,
                                    registration_closes_at, capacity, status)
                VALUES (?, 'Test event', 'Room 1', now() + interval '1 day', now() - interval '1 hour',
                        now() + interval '12 hours', ?, 'PUBLISHED')
                RETURNING id""")
                .params(organizer, capacity)
                .query(Long.class)
                .single();
    }

    public long organizerOf(long eventId) {
        return db.sql("SELECT organizer_id FROM events WHERE id = ?").param(eventId).query(Long.class).single();
    }

    public int count(long eventId, String status) {
        return db.sql("SELECT count(*) FROM registrations WHERE event_id = ? AND status = ?")
                .params(eventId, status)
                .query(Integer.class)
                .single();
    }

    public int confirmedCount(long eventId) {
        return db.sql("SELECT confirmed_count FROM events WHERE id = ?").param(eventId).query(Integer.class).single();
    }

    public String status(long registrationId) {
        return db.sql("SELECT status FROM registrations WHERE id = ?").param(registrationId).query(String.class).single();
    }
}
