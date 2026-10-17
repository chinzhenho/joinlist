package dev.joinlist.event;

import dev.joinlist.common.ApiException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class EventRepository {

    private final JdbcClient db;

    public EventRepository(JdbcClient db) {
        this.db = db;
    }

    public Optional<EventRow> find(long id) {
        return db.sql("SELECT * FROM events WHERE id = ?").param(id).query(EventRow.class).optional();
    }

    /**
     * Reads the event and locks its row until the transaction ends.
     * Every change to seats (cancel, capacity change, event cancel, waitlist slow path) goes through this,
     * so they happen one at a time per event and always lock the event before any registration row.
     */
    public EventRow lock(long id) {
        return db.sql("SELECT * FROM events WHERE id = ? FOR UPDATE")
                .param(id)
                .query(EventRow.class)
                .optional()
                .orElseThrow(() -> ApiException.notFound("Event"));
    }

    /** The database clock. All time rules use it so app servers with a wrong clock can't break them. */
    public OffsetDateTime now() {
        return db.sql("SELECT now()").query(OffsetDateTime.class).single();
    }

    public int waitlistCount(long eventId) {
        return db.sql("SELECT count(*) FROM registrations WHERE event_id = ? AND status = 'WAITLISTED'")
                .param(eventId)
                .query(Integer.class)
                .single();
    }

    public List<EventRow> upcomingPublished() {
        return db.sql("""
                SELECT * FROM events
                WHERE status = 'PUBLISHED' AND starts_at > now()
                ORDER BY starts_at
                LIMIT 100""")
                .query(EventRow.class)
                .list();
    }

    public List<EventRow> byOrganizer(long organizerId) {
        return db.sql("SELECT * FROM events WHERE organizer_id = ? ORDER BY starts_at DESC")
                .param(organizerId)
                .query(EventRow.class)
                .list();
    }
}
