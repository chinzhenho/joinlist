package dev.joinlist.auth;

import dev.joinlist.auth.AuthController.AuthResponse;
import dev.joinlist.auth.AuthController.UserView;
import dev.joinlist.common.ApiException;
import dev.joinlist.event.EventService;
import dev.joinlist.live.EventChanged;
import org.springframework.context.ApplicationEventPublisher;
import dev.joinlist.registration.RegistrationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The logged-in user's own account: rename, change password, delete. */
@RestController
@RequestMapping("/api/me")
public class AccountController {

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final RegistrationService registrations;
    private final EventService events;
    private final TokenService tokens;
    private final ApplicationEventPublisher publisher;

    public AccountController(JdbcClient db, PasswordEncoder passwords, RegistrationService registrations,
                             EventService events, TokenService tokens, ApplicationEventPublisher publisher) {
        this.tokens = tokens;
        this.publisher = publisher;
        this.db = db;
        this.passwords = passwords;
        this.registrations = registrations;
        this.events = events;
    }

    public record NameChange(@NotBlank @Size(max = 100) String name) {}

    public record PasswordChange(@NotBlank String currentPassword, @NotBlank @Size(min = 8, max = 72) String newPassword) {}

    public record PasswordConfirm(@NotBlank String password) {}

    @PatchMapping
    public UserView rename(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NameChange req) {
        long id = TokenService.userId(jwt);
        db.sql("UPDATE users SET name = ? WHERE id = ?").params(req.name().trim(), id).update();
        // Organisers looking at an attendee list should see the new name straight away.
        db.sql("SELECT DISTINCT event_id FROM registrations WHERE user_id = ? AND status <> 'CANCELLED'")
                .param(id)
                .query(Long.class)
                .list()
                .forEach(eventId -> publisher.publishEvent(new EventChanged(eventId)));
        return db.sql("SELECT id, name, email FROM users WHERE id = ?").param(id).query(UserView.class).single();
    }

    /** Changes the password, logs out every other device, and returns a fresh token for this one. */
    @PostMapping("/password")
    public AuthResponse changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordChange req) {
        long id = TokenService.userId(jwt);
        requirePassword(id, req.currentPassword());
        // Same clock and whole seconds as the token's issued-at time, so the new token below passes.
        OffsetDateTime cutoff = Instant.now().truncatedTo(ChronoUnit.SECONDS).atOffset(ZoneOffset.UTC);
        db.sql("UPDATE users SET password_hash = ?, tokens_valid_after = ? WHERE id = ?")
                .params(passwords.encode(req.newPassword()), cutoff, id)
                .update();
        UserView user = db.sql("SELECT id, name, email FROM users WHERE id = ?").param(id).query(UserView.class).single();
        return new AuthResponse(tokens.issue(id), user);
    }

    /**
     * Deletes the account. Seats are handed to the waitlist, the user's own upcoming events are cancelled
     * (attendees are emailed), and the user row is emptied of personal data. The row itself stays so past
     * registrations still point somewhere; it can never log in again.
     */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordConfirm req) {
        long id = TokenService.userId(jwt);
        requirePassword(id, req.password());

        // Ordered by event id, so several deletions at once always lock events in the same order.
        List<Long> active = db.sql("""
                SELECT r.id FROM registrations r JOIN events e ON e.id = r.event_id
                WHERE r.user_id = ? AND r.status <> 'CANCELLED' AND e.status <> 'CANCELLED' AND e.starts_at > now()
                ORDER BY r.event_id""")
                .param(id)
                .query(Long.class)
                .list();
        for (long registrationId : active) {
            registrations.cancel(registrationId, id, false);
        }

        List<Long> organised = db.sql("""
                SELECT id FROM events WHERE organizer_id = ? AND status <> 'CANCELLED' AND starts_at > now() ORDER BY id""")
                .param(id)
                .query(Long.class)
                .list();
        for (long eventId : organised) {
            events.cancel(eventId, id);
        }

        db.sql("""
                UPDATE users SET name = 'Deleted user', email = 'deleted-' || id || '@deleted.invalid',
                                 password_hash = '!', tokens_valid_after = '9999-12-31T00:00:00Z'
                WHERE id = ?""")
                .param(id)
                .update();
    }

    private void requirePassword(long userId, String password) {
        String hash = db.sql("SELECT password_hash FROM users WHERE id = ?").param(userId).query(String.class).single();
        if (!passwords.matches(password, hash)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "wrong_password", "That password isn't right.");
        }
    }
}
