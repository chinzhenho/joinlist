package dev.joinlist.event;

import dev.joinlist.auth.TokenService;
import dev.joinlist.common.ApiException;
import dev.joinlist.event.EventService.EventForm;
import dev.joinlist.registration.QrTokens;
import dev.joinlist.registration.RegistrationService;
import dev.joinlist.registration.RegistrationService.Registration;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class EventController {

    private final EventService service;
    private final EventRepository events;
    private final RegistrationService registrations;
    private final QrTokens qr;
    private final JdbcClient db;
    private final PublicEventCache cache;

    public EventController(EventService service, EventRepository events, RegistrationService registrations,
                           QrTokens qr, JdbcClient db, PublicEventCache cache) {
        this.cache = cache;
        this.service = service;
        this.events = events;
        this.registrations = registrations;
        this.qr = qr;
        this.db = db;
    }

    /** What the user sees about their own registration on an event page. */
    public record MyRegistration(long id, String status, Integer waitlistPosition,
                                 OffsetDateTime checkedInAt, String qrToken) {}

    public record EventView(
            long id, String title, String description, String location,
            OffsetDateTime startsAt, OffsetDateTime registrationOpensAt, OffsetDateTime registrationClosesAt,
            int capacity, int confirmedCount, int spotsLeft, int waitlistCount,
            String status, String phase, boolean isOrganizer, MyRegistration myRegistration) {}

    @GetMapping("/events")
    public List<EventView> upcoming() {
        return cache.list(() -> {
            OffsetDateTime now = OffsetDateTime.now();
            return events.upcomingPublished().stream().map(e -> view(e, now, null, false)).toList();
        });
    }

    @GetMapping("/me/events")
    public List<EventView> mine(@AuthenticationPrincipal Jwt jwt) {
        long userId = TokenService.userId(jwt);
        OffsetDateTime now = OffsetDateTime.now();
        return events.byOrganizer(userId).stream().map(e -> view(e, now, userId, true)).toList();
    }

    /** Public, but if the visitor is logged in they also see their own registration. */
    @GetMapping("/events/{id}")
    public EventView get(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        Long userId = jwt == null ? null : TokenService.userId(jwt);
        if (userId == null) {
            return cache.page(id, () -> publicView(id));
        }
        EventRow event = events.find(id).orElseThrow(() -> ApiException.notFound("Event"));
        if (EventRow.DRAFT.equals(event.status()) && !event.isOrganizer(userId)) {
            throw ApiException.notFound("Event");
        }
        return view(event, OffsetDateTime.now(), userId, true);
    }

    /** What a logged-out visitor sees. Drafts don't exist for them. */
    private EventView publicView(long id) {
        EventRow event = events.find(id).orElseThrow(() -> ApiException.notFound("Event"));
        if (EventRow.DRAFT.equals(event.status())) {
            throw ApiException.notFound("Event");
        }
        return view(event, OffsetDateTime.now(), null, true);
    }

    public record Created(long id) {}

    @PostMapping("/events")
    @ResponseStatus(HttpStatus.CREATED)
    public Created create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody EventForm form) {
        return new Created(service.create(TokenService.userId(jwt), form));
    }

    @PatchMapping("/events/{id}")
    public EventView update(@PathVariable long id, @AuthenticationPrincipal Jwt jwt,
                            @Valid @RequestBody EventForm form) {
        service.update(id, TokenService.userId(jwt), form);
        return get(id, jwt);
    }

    @PostMapping("/events/{id}/publish")
    public EventView publish(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        service.publish(id, TokenService.userId(jwt));
        return get(id, jwt);
    }

    @PostMapping("/events/{id}/cancel")
    public EventView cancel(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        service.cancel(id, TokenService.userId(jwt));
        return get(id, jwt);
    }

    // ---------------------------------------------------------------- attendee list (organizer only)

    public record Attendee(long registrationId, String name, String email, String status,
                           OffsetDateTime registeredAt, OffsetDateTime checkedInAt) {}

    @GetMapping("/events/{id}/attendees")
    public List<Attendee> attendees(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        service.requireOwned(id, TokenService.userId(jwt));
        return attendeeList(id);
    }

    @GetMapping("/events/{id}/attendees.csv")
    public ResponseEntity<byte[]> attendeesCsv(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        service.requireOwned(id, TokenService.userId(jwt));
        var csv = new StringBuilder("Name,Email,Status,Registered at,Checked in at\n");
        for (Attendee a : attendeeList(id)) {
            csv.append(cell(a.name())).append(',')
                    .append(cell(a.email())).append(',')
                    .append(a.status()).append(',')
                    .append(a.registeredAt()).append(',')
                    .append(a.checkedInAt() == null ? "" : a.checkedInAt().toString()).append('\n');
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"event-" + id + "-attendees.csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private List<Attendee> attendeeList(long eventId) {
        return db.sql("""
                SELECT r.id AS registration_id, u.name, u.email, r.status,
                       r.created_at AS registered_at, r.checked_in_at
                FROM registrations r JOIN users u ON u.id = r.user_id
                WHERE r.event_id = ?
                ORDER BY CASE r.status WHEN 'CONFIRMED' THEN 0 WHEN 'WAITLISTED' THEN 1 ELSE 2 END, r.id""")
                .param(eventId)
                .query(Attendee.class)
                .list();
    }

    /** Quotes a CSV cell, and stops spreadsheet apps from running a name like "=HYPERLINK(...)" as a formula. */
    static String cell(String value) {
        String v = value == null ? "" : value;
        if (!v.isEmpty() && "=+-@".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        return "\"" + v.replace("\"", "\"\"") + "\"";
    }

    // ---------------------------------------------------------------- view building

    private EventView view(EventRow e, OffsetDateTime now, Long userId, boolean withDetails) {
        MyRegistration mine = null;
        if (userId != null && withDetails) {
            mine = registrations.activeRegistration(e.id(), userId).map(this::myRegistration).orElse(null);
        }
        int waitlist = withDetails ? events.waitlistCount(e.id()) : 0;
        return new EventView(e.id(), e.title(), e.description(), e.location(),
                e.startsAt(), e.registrationOpensAt(), e.registrationClosesAt(),
                e.capacity(), e.confirmedCount(), e.capacity() - e.confirmedCount(), waitlist,
                e.status(), phase(e, now), e.isOrganizer(userId), mine);
    }

    public MyRegistration myRegistration(Registration r) {
        boolean confirmed = RegistrationService.CONFIRMED.equals(r.status());
        Integer position = RegistrationService.WAITLISTED.equals(r.status()) ? registrations.waitlistPosition(r) : null;
        return new MyRegistration(r.id(), r.status(), position, r.checkedInAt(), confirmed ? qr.create(r.id()) : null);
    }

    /** One word the frontend can show: draft, cancelled, upcoming, open, closed or ended. */
    public static String phase(EventRow e, OffsetDateTime now) {
        if (EventRow.DRAFT.equals(e.status())) return "draft";
        if (EventRow.CANCELLED.equals(e.status())) return "cancelled";
        if (!now.isBefore(e.startsAt())) return "ended";
        if (now.isBefore(e.registrationOpensAt())) return "upcoming";
        if (now.isBefore(e.registrationClosesAt())) return "open";
        return "closed";
    }
}
