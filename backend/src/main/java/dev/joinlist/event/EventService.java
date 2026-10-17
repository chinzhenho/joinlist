package dev.joinlist.event;

import dev.joinlist.common.ApiException;
import dev.joinlist.notify.Notice;
import dev.joinlist.registration.RegistrationService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EventService {

    private final JdbcClient db;
    private final EventRepository events;
    private final RegistrationService registrations;
    private final ApplicationEventPublisher publisher;

    public EventService(JdbcClient db, EventRepository events, RegistrationService registrations,
                        ApplicationEventPublisher publisher) {
        this.db = db;
        this.events = events;
        this.registrations = registrations;
        this.publisher = publisher;
    }

    public record EventForm(
            @NotBlank @Size(max = 120) String title,
            @Size(max = 5000) String description,
            @NotBlank @Size(max = 200) String location,
            @NotNull OffsetDateTime startsAt,
            @NotNull OffsetDateTime registrationOpensAt,
            @NotNull OffsetDateTime registrationClosesAt,
            @Min(1) @Max(10000) int capacity) {}

    @Transactional
    public long create(long organizerId, EventForm form) {
        validateTimes(form);
        if (!form.startsAt().isAfter(events.now())) {
            throw ApiException.badRequest("starts_in_past", "The event must start in the future.");
        }
        return db.sql("""
                INSERT INTO events (organizer_id, title, description, location, starts_at,
                                    registration_opens_at, registration_closes_at, capacity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""")
                .params(organizerId, form.title().trim(), description(form), form.location().trim(),
                        form.startsAt(), form.registrationOpensAt(), form.registrationClosesAt(), form.capacity())
                .query(Long.class)
                .single();
    }

    @Transactional
    public void update(long eventId, long organizerId, EventForm form) {
        EventRow event = lockOwned(eventId, organizerId);
        if (EventRow.CANCELLED.equals(event.status())) {
            throw ApiException.conflict("event_cancelled", "A cancelled event can't be edited.");
        }
        validateTimes(form);
        db.sql("""
                UPDATE events SET title = ?, description = ?, location = ?, starts_at = ?,
                                  registration_opens_at = ?, registration_closes_at = ?
                WHERE id = ?""")
                .params(form.title().trim(), description(form), form.location().trim(), form.startsAt(),
                        form.registrationOpensAt(), form.registrationClosesAt(), eventId)
                .update();
        if (form.capacity() != event.capacity()) {
            registrations.changeCapacity(event, form.capacity());
        }
    }

    @Transactional
    public void publish(long eventId, long organizerId) {
        EventRow event = lockOwned(eventId, organizerId);
        if (!EventRow.DRAFT.equals(event.status())) {
            throw ApiException.conflict("not_draft", "Only a draft can be published.");
        }
        db.sql("UPDATE events SET status = 'PUBLISHED' WHERE id = ?").param(eventId).update();
    }

    /** Stops registration and tells everyone who was confirmed or waiting. Their records are kept. */
    @Transactional
    public void cancel(long eventId, long organizerId) {
        EventRow event = lockOwned(eventId, organizerId);
        if (EventRow.CANCELLED.equals(event.status())) {
            throw ApiException.conflict("event_cancelled", "This event is already cancelled.");
        }
        db.sql("UPDATE events SET status = 'CANCELLED' WHERE id = ?").param(eventId).update();
        List<Long> people = db.sql("""
                SELECT user_id FROM registrations WHERE event_id = ? AND status IN ('CONFIRMED', 'WAITLISTED')""")
                .param(eventId)
                .query(Long.class)
                .list();
        for (long userId : people) {
            publisher.publishEvent(new Notice(Notice.Type.EVENT_CANCELLED, userId, eventId));
        }
    }

    public EventRow requireOwned(long eventId, long organizerId) {
        EventRow event = events.find(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        if (!event.isOrganizer(organizerId)) {
            throw ApiException.forbidden();
        }
        return event;
    }

    private EventRow lockOwned(long eventId, long organizerId) {
        EventRow event = events.lock(eventId);
        if (!event.isOrganizer(organizerId)) {
            throw ApiException.forbidden();
        }
        return event;
    }

    private static void validateTimes(EventForm form) {
        if (!form.registrationOpensAt().isBefore(form.registrationClosesAt())) {
            throw ApiException.badRequest("bad_times", "Registration must open before it closes.");
        }
        if (form.registrationClosesAt().isAfter(form.startsAt())) {
            throw ApiException.badRequest("bad_times", "Registration must close before the event starts.");
        }
    }

    private static String description(EventForm form) {
        return form.description() == null ? "" : form.description().trim();
    }
}
