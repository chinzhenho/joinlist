package dev.joinlist.registration;

import dev.joinlist.auth.TokenService;
import dev.joinlist.common.ApiException;
import dev.joinlist.event.EventController;
import dev.joinlist.event.EventController.MyRegistration;
import dev.joinlist.event.EventRepository;
import dev.joinlist.event.EventService;
import dev.joinlist.registration.RegistrationService.CheckIn;
import dev.joinlist.registration.RegistrationService.Registration;
import dev.joinlist.registration.RegistrationService.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RegistrationController {

    private final RegistrationService registrations;
    private final EventService events;
    private final EventRepository eventRows;
    private final EventController eventViews;
    private final QrTokens qr;
    private final JdbcClient db;

    public RegistrationController(RegistrationService registrations, EventService events, EventRepository eventRows,
                                  EventController eventViews, QrTokens qr, JdbcClient db) {
        this.registrations = registrations;
        this.events = events;
        this.eventRows = eventRows;
        this.eventViews = eventViews;
        this.qr = qr;
        this.db = db;
    }

    /** Takes a seat if one is free, otherwise joins the waitlist. */
    @PostMapping("/events/{eventId}/registrations")
    @ResponseStatus(HttpStatus.CREATED)
    public Result register(@PathVariable long eventId, @AuthenticationPrincipal Jwt jwt) {
        return registrations.register(eventId, TokenService.userId(jwt));
    }

    @DeleteMapping("/registrations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        registrations.cancel(id, TokenService.userId(jwt));
    }

    public record MyRegistrationItem(long eventId, String eventTitle, String eventLocation,
                                     OffsetDateTime eventStartsAt, String eventPhase,
                                     MyRegistration registration) {}

    @GetMapping("/me/registrations")
    public List<MyRegistrationItem> mine(@AuthenticationPrincipal Jwt jwt) {
        long userId = TokenService.userId(jwt);
        record Row(long id, long eventId, long userId, String status, OffsetDateTime checkedInAt,
                   OffsetDateTime createdAt) {}
        List<Row> rows = db.sql("""
                SELECT r.id, r.event_id, r.user_id, r.status, r.checked_in_at, r.created_at
                FROM registrations r JOIN events e ON e.id = r.event_id
                WHERE r.user_id = ? AND r.status <> 'CANCELLED'
                ORDER BY e.starts_at""")
                .param(userId)
                .query(Row.class)
                .list();
        OffsetDateTime now = OffsetDateTime.now();
        return rows.stream().map(r -> {
            var event = eventRows.find(r.eventId()).orElseThrow();
            var reg = new Registration(r.id(), r.eventId(), r.userId(), r.status(), r.checkedInAt(), r.createdAt());
            return new MyRegistrationItem(event.id(), event.title(), event.location(), event.startsAt(),
                    EventController.phase(event, now), eventViews.myRegistration(reg));
        }).toList();
    }

    public record CheckInRequest(@NotBlank String token) {}

    /** The organizer scans a QR code (or types it) at the door. */
    @PostMapping("/events/{eventId}/check-in")
    public CheckIn checkIn(@PathVariable long eventId, @AuthenticationPrincipal Jwt jwt,
                           @Valid @RequestBody CheckInRequest req) {
        events.requireOwned(eventId, TokenService.userId(jwt));
        long registrationId = qr.verify(req.token())
                .orElseThrow(() -> ApiException.badRequest("invalid_qr", "This QR code isn't valid."));
        return registrations.checkIn(eventId, registrationId);
    }

    /** For when someone's phone is dead: the organizer finds them on the list and taps Check in. */
    @PostMapping("/events/{eventId}/registrations/{registrationId}/check-in")
    public CheckIn checkInByHand(@PathVariable long eventId, @PathVariable long registrationId,
                                 @AuthenticationPrincipal Jwt jwt) {
        events.requireOwned(eventId, TokenService.userId(jwt));
        return registrations.checkIn(eventId, registrationId);
    }
}
