package dev.joinlist.notify;

import dev.joinlist.config.JoinlistProperties;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.client.RestClient;

/**
 * Sends emails through Brevo's HTTPS API after the transaction has committed.
 * Sending runs in the background, and a failure is only logged: it never undoes a registration.
 * Known limit (v1): failed emails are not retried.
 */
@Component
public class Mailer {

    private static final Logger log = LoggerFactory.getLogger(Mailer.class);
    private static final ZoneId LOCAL = ZoneId.of("Asia/Kuala_Lumpur");
    private static final DateTimeFormatter WHEN =
            DateTimeFormatter.ofPattern("EEE d MMM yyyy, h:mm a", Locale.ENGLISH);

    private final JdbcClient db;
    private final JoinlistProperties props;
    private final RestClient brevo;

    public Mailer(JdbcClient db, JoinlistProperties props) {
        this.db = db;
        this.props = props;
        this.brevo = RestClient.builder().baseUrl("https://api.brevo.com/v3").build();
    }

    @Async
    @TransactionalEventListener
    public void onNotice(Notice notice) {
        record Info(String name, String email, String title, String location, OffsetDateTime startsAt) {}
        Info info = db.sql("""
                SELECT u.name, u.email, e.title, e.location, e.starts_at
                FROM users u, events e WHERE u.id = ? AND e.id = ?""")
                .params(notice.userId(), notice.eventId())
                .query(Info.class)
                .single();

        String when = info.startsAt().atZoneSameInstant(LOCAL).format(WHEN);
        String link = props.appUrl() + "/events/" + notice.eventId();
        String subject;
        String body;
        switch (notice.type()) {
            case REGISTERED -> {
                subject = "You're in: " + info.title();
                body = "Hi " + info.name() + ",\n\nYou have a spot at " + info.title() + ".\n\n"
                        + "When: " + when + "\nWhere: " + info.location() + "\n\n"
                        + "Your check-in QR code is in My registrations:\n" + link;
            }
            case PROMOTED -> {
                subject = "A spot opened up: " + info.title();
                body = "Hi " + info.name() + ",\n\nSomeone cancelled, so you moved off the waitlist. "
                        + "You now have a spot at " + info.title() + ".\n\n"
                        + "When: " + when + "\nWhere: " + info.location() + "\n\n"
                        + "Can't make it? Please cancel so the next person can go:\n" + link;
            }
            case EVENT_CANCELLED -> {
                subject = "Cancelled: " + info.title();
                body = "Hi " + info.name() + ",\n\nThe organizer cancelled " + info.title()
                        + " (" + when + "). You don't need to do anything.\n\n" + link;
            }
            default -> throw new IllegalStateException();
        }
        send(notice, info.email(), info.name(), subject, body + "\n\n— Joinlist");
    }

    private void send(Notice notice, String to, String toName, String subject, String text) {
        var brevoProps = props.brevo();
        if (brevoProps.apiKey() == null || brevoProps.apiKey().isBlank()) {
            log.info("Email not sent (no BREVO_API_KEY): {} -> user {}", subject, notice.userId());
            record(notice, "SKIPPED", null);
            return;
        }
        try {
            brevo.post().uri("/smtp/email")
                    .header("api-key", brevoProps.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "sender", Map.of("email", brevoProps.senderEmail(), "name", brevoProps.senderName()),
                            "to", List.of(Map.of("email", to, "name", toName)),
                            "subject", subject,
                            "textContent", text))
                    .retrieve()
                    .toBodilessEntity();
            record(notice, "SENT", null);
        } catch (RuntimeException e) {
            log.warn("Email failed for user {}: {}", notice.userId(), e.getMessage());
            record(notice, "FAILED", e.getMessage());
        }
    }

    private void record(Notice notice, String status, String error) {
        db.sql("INSERT INTO notification_logs (user_id, event_id, type, status, error_message) VALUES (?, ?, ?, ?, ?)")
                .params(notice.userId(), notice.eventId(), notice.type().name(), status, error)
                .update();
    }
}
