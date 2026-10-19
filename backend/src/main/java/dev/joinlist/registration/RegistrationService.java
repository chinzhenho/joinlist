package dev.joinlist.registration;

import dev.joinlist.common.ApiException;
import dev.joinlist.config.JoinlistProperties;
import dev.joinlist.config.JoinlistProperties.SeatStrategy;
import dev.joinlist.event.EventRepository;
import dev.joinlist.event.EventRow;
import dev.joinlist.live.EventChanged;
import dev.joinlist.notify.Notice;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The heart of Joinlist: giving out a limited number of seats correctly when many people click at once.
 *
 * <p>Rules that keep the data correct:
 * <ul>
 *   <li>Taking a seat and saving the registration happen in one transaction: both happen or neither does.</li>
 *   <li>The database refuses confirmed_count > capacity (CHECK) and two active registrations per user (UNIQUE).</li>
 *   <li>Anything that frees a seat locks the event row first, and hands the seat straight to the first
 *       person on the waitlist. So "seats free" and "people waiting" are never true at the same time.</li>
 * </ul>
 */
@Service
public class RegistrationService {

    public static final String CONFIRMED = "CONFIRMED";
    public static final String WAITLISTED = "WAITLISTED";
    public static final String CANCELLED = "CANCELLED";

    private final JdbcClient db;
    private final EventRepository events;
    private final ApplicationEventPublisher publisher;
    private final SeatStrategy strategy;
    private final Duration cancelCutoff;

    public RegistrationService(JdbcClient db, EventRepository events, ApplicationEventPublisher publisher,
                               JoinlistProperties props) {
        this.db = db;
        this.events = events;
        this.publisher = publisher;
        this.strategy = props.seatStrategy();
        this.cancelCutoff = Duration.ofHours(props.cancelCutoffHours());
    }

    public record Registration(long id, long eventId, long userId, String status,
                               OffsetDateTime checkedInAt, OffsetDateTime createdAt) {}

    public record Result(long registrationId, String status) {}

    // ---------------------------------------------------------------- register

    @Transactional
    public Result register(long eventId, long userId) {
        return register(eventId, userId, strategy);
    }

    /** Same as {@link #register(long, long)} but with an explicit strategy, so tests can compare both. */
    @Transactional
    public Result register(long eventId, long userId, SeatStrategy seatStrategy) {
        // Friendly early answer. The UNIQUE index is what really stops duplicates if two requests race.
        if (activeRegistration(eventId, userId).isPresent()) {
            throw ApiException.conflict("already_registered", "You're already registered for this event.");
        }

        boolean gotSeat = switch (seatStrategy) {
            case ATOMIC -> takeSeatAtomically(eventId);
            case PESSIMISTIC -> takeSeatWithLock(eventId);
        };
        String status = gotSeat ? CONFIRMED : WAITLISTED;

        long id = db.sql("INSERT INTO registrations (event_id, user_id, status) VALUES (?, ?, ?) RETURNING id")
                .params(eventId, userId, status)
                .query(Long.class)
                .single();

        if (gotSeat) {
            publisher.publishEvent(new Notice(Notice.Type.REGISTERED, userId, eventId));
        }
        publisher.publishEvent(new EventChanged(eventId));
        return new Result(id, status);
    }

    /**
     * Method A: conditional atomic update.
     * "Add one if there is still room" is a single SQL statement, so two requests can never both see
     * the last seat as free. Only when it fails (full, or not open) do we fall back to the locked path.
     */
    private boolean takeSeatAtomically(long eventId) {
        int updated = db.sql("""
                UPDATE events SET confirmed_count = confirmed_count + 1
                WHERE id = ?
                  AND status = 'PUBLISHED'
                  AND now() >= registration_opens_at
                  AND now() < registration_closes_at
                  AND confirmed_count < capacity""")
                .param(eventId)
                .update();
        if (updated == 1) {
            return true;
        }
        // Full or not open. Lock the event so that a cancel can't free a seat between this check and
        // our waitlist insert (that would leave us waiting while a seat sits empty). Also gives a clear error.
        return takeSeatWithLock(eventId);
    }

    /**
     * Method B: pessimistic lock.
     * SELECT ... FOR UPDATE makes every other request for this event wait until we commit,
     * so "read the count, then add one" is safe. Simple to reason about, but requests queue up.
     */
    private boolean takeSeatWithLock(long eventId) {
        EventRow event = events.lock(eventId);
        requireOpen(event, events.now());
        if (event.confirmedCount() < event.capacity()) {
            db.sql("UPDATE events SET confirmed_count = confirmed_count + 1 WHERE id = ?").param(eventId).update();
            return true;
        }
        return false;
    }

    private static void requireOpen(EventRow event, OffsetDateTime now) {
        switch (event.status()) {
            case EventRow.DRAFT -> throw ApiException.notFound("Event");
            case EventRow.CANCELLED -> throw ApiException.conflict("event_cancelled", "This event was cancelled.");
            default -> { }
        }
        if (now.isBefore(event.registrationOpensAt())) {
            throw ApiException.conflict("not_open_yet", "Registration hasn't opened yet.");
        }
        if (!now.isBefore(event.registrationClosesAt())) {
            throw ApiException.conflict("registration_closed", "Registration has closed.");
        }
    }

    // ---------------------------------------------------------------- cancel

    @Transactional
    public void cancel(long registrationId, long userId) {
        cancel(registrationId, userId, true);
    }

    /**
     * @param enforceCutoff false only when an account is being deleted: the person is leaving for good,
     *                      so their seat should go to the waitlist even close to the start.
     */
    @Transactional
    public void cancel(long registrationId, long userId, boolean enforceCutoff) {
        Registration reg = find(registrationId)
                .filter(r -> r.userId() == userId)
                .orElseThrow(() -> ApiException.notFound("Registration"));

        // Lock order is always: event row, then registration rows. Same order everywhere = no deadlocks.
        EventRow event = events.lock(reg.eventId());
        reg = lockRegistration(registrationId);

        if (CANCELLED.equals(reg.status())) {
            throw ApiException.conflict("already_cancelled", "This registration is already cancelled.");
        }
        if (EventRow.CANCELLED.equals(event.status())) {
            throw ApiException.conflict("event_cancelled", "This event was cancelled.");
        }
        if (enforceCutoff && events.now().isAfter(event.startsAt().minus(cancelCutoff))) {
            throw ApiException.conflict("too_late",
                    "You can't cancel less than " + cancelCutoff.toHours() + " hours before the event.");
        }

        db.sql("UPDATE registrations SET status = 'CANCELLED', updated_at = now() WHERE id = ?")
                .param(registrationId)
                .update();

        if (CONFIRMED.equals(reg.status())) {
            // Give the seat to the next person waiting; only if nobody is waiting does the count go down.
            int promoted = promoteFromWaitlist(event.id(), 1);
            if (promoted == 0) {
                db.sql("UPDATE events SET confirmed_count = confirmed_count - 1 WHERE id = ?")
                        .param(event.id())
                        .update();
            }
        }
        publisher.publishEvent(new EventChanged(event.id()));
    }

    /**
     * Moves up to {@code seats} people from the front of the waitlist to CONFIRMED, without changing
     * confirmed_count (the caller decides whether the seats are new or handed over).
     * Caller must already hold the event lock.
     */
    int promoteFromWaitlist(long eventId, int seats) {
        if (seats <= 0) {
            return 0;
        }
        record Waiting(long id, long userId) {}
        List<Waiting> next = db.sql("""
                SELECT id, user_id FROM registrations
                WHERE event_id = ? AND status = 'WAITLISTED'
                ORDER BY id
                LIMIT ?
                FOR UPDATE""")
                .params(eventId, seats)
                .query(Waiting.class)
                .list();
        for (Waiting w : next) {
            db.sql("UPDATE registrations SET status = 'CONFIRMED', updated_at = now() WHERE id = ?")
                    .param(w.id())
                    .update();
            publisher.publishEvent(new Notice(Notice.Type.PROMOTED, w.userId(), eventId));
        }
        return next.size();
    }

    /**
     * Organizer changed capacity. Caller holds the event lock.
     * Growing the event fills the new seats from the waitlist; shrinking below the confirmed count is refused.
     */
    @Transactional
    public void changeCapacity(EventRow lockedEvent, int newCapacity) {
        if (newCapacity < lockedEvent.confirmedCount()) {
            throw ApiException.conflict("capacity_too_small",
                    lockedEvent.confirmedCount() + " people are already confirmed. Capacity can't be lower than that.");
        }
        db.sql("UPDATE events SET capacity = ? WHERE id = ?").params(newCapacity, lockedEvent.id()).update();
        int promoted = promoteFromWaitlist(lockedEvent.id(), newCapacity - lockedEvent.confirmedCount());
        if (promoted > 0) {
            db.sql("UPDATE events SET confirmed_count = confirmed_count + ? WHERE id = ?")
                    .params(promoted, lockedEvent.id())
                    .update();
        }
    }

    // ---------------------------------------------------------------- check-in

    public record CheckIn(long registrationId, String name, OffsetDateTime checkedInAt) {}

    /** Marks a confirmed registration as checked in. The WHERE clause makes a second scan do nothing. */
    @Transactional
    public CheckIn checkIn(long eventId, long registrationId) {
        Optional<CheckIn> done = db.sql("""
                UPDATE registrations r SET checked_in_at = now(), updated_at = now()
                FROM users u
                WHERE r.id = ? AND r.event_id = ? AND r.status = 'CONFIRMED' AND r.checked_in_at IS NULL
                  AND u.id = r.user_id
                RETURNING r.id AS registration_id, u.name, r.checked_in_at""")
                .params(registrationId, eventId)
                .query(CheckIn.class)
                .optional();
        if (done.isPresent()) {
            publisher.publishEvent(new EventChanged(eventId));
            return done.get();
        }
        Registration reg = find(registrationId)
                .filter(r -> r.eventId() == eventId)
                .orElseThrow(() -> ApiException.notFound("Registration for this event"));
        if (reg.checkedInAt() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "already_checked_in", "Already checked in.");
        }
        throw ApiException.conflict("not_confirmed", "This person is " + reg.status().toLowerCase() + ", not confirmed.");
    }

    // ---------------------------------------------------------------- reads

    public Optional<Registration> find(long id) {
        return db.sql("SELECT id, event_id, user_id, status, checked_in_at, created_at FROM registrations WHERE id = ?")
                .param(id)
                .query(Registration.class)
                .optional();
    }

    public Optional<Registration> activeRegistration(long eventId, long userId) {
        return db.sql("""
                SELECT id, event_id, user_id, status, checked_in_at, created_at FROM registrations
                WHERE event_id = ? AND user_id = ? AND status <> 'CANCELLED'""")
                .params(eventId, userId)
                .query(Registration.class)
                .optional();
    }

    /** 1 = first in line. Waitlist order is the registration id order. */
    public int waitlistPosition(Registration reg) {
        return db.sql("""
                SELECT count(*) FROM registrations
                WHERE event_id = ? AND status = 'WAITLISTED' AND id <= ?""")
                .params(reg.eventId(), reg.id())
                .query(Integer.class)
                .single();
    }

    private Registration lockRegistration(long id) {
        return db.sql("""
                SELECT id, event_id, user_id, status, checked_in_at, created_at FROM registrations
                WHERE id = ? FOR UPDATE""")
                .param(id)
                .query(Registration.class)
                .single();
    }
}
