package dev.joinlist.live;

import static org.assertj.core.api.Assertions.assertThat;

import dev.joinlist.TestData;
import dev.joinlist.TestcontainersConfiguration;
import dev.joinlist.registration.RegistrationService;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

/** Opens a real live-update connection over HTTP, like a browser tab would. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({TestcontainersConfiguration.class, TestData.class})
class ChangeFeedTest {

    @LocalServerPort int port;
    @Autowired RegistrationService registrations;
    @Autowired TestData data;

    @Test
    void openPagesHearAboutChangesBatchedOncePerSecond() throws Exception {
        List<String> lines = new CopyOnWriteArrayList<>();
        HttpClient http = HttpClient.newHttpClient();
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/stream"))
                .header("Accept", "text/event-stream")
                .build();
        HttpResponse<java.io.InputStream> res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
        assertThat(res.statusCode()).isEqualTo(200);
        Thread reader = Thread.ofVirtual().start(() -> {
            try (var in = new BufferedReader(new InputStreamReader(res.body(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = in.readLine()) != null) {
                    lines.add(line);
                }
            } catch (Exception ignored) {
                // connection closed at the end of the test
            }
        });

        waitFor(() -> lines.contains("event:ready"), Duration.ofSeconds(5));

        // 50 people register in quick succession.
        long eventId = data.openEvent(20);
        for (long user : data.users(50)) {
            registrations.register(eventId, user);
        }

        String expected = "data:" + eventId;
        waitFor(() -> lines.stream().anyMatch(l -> l.startsWith("data:") && List.of(l.substring(5).split(",")).contains(String.valueOf(eventId))),
                Duration.ofSeconds(5));
        Thread.sleep(1500); // let any last batch arrive

        long messagesAboutEvent = lines.stream()
                .filter(l -> l.startsWith("data:") && List.of(l.substring(5).split(",")).contains(String.valueOf(eventId)))
                .count();
        // 50 changes, but sent at most once per second, so only a handful of messages.
        assertThat(messagesAboutEvent).isBetween(1L, 5L);
        // The stream only names events. No names, emails or tokens.
        assertThat(lines).noneMatch(l -> l.contains("@"));
        assertThat(expected).isNotBlank();

        reader.interrupt();
        res.body().close();
    }

    private static void waitFor(java.util.function.BooleanSupplier condition, Duration max) throws InterruptedException {
        long end = System.nanoTime() + max.toNanos();
        while (!condition.getAsBoolean()) {
            if (System.nanoTime() > end) {
                throw new AssertionError("Timed out waiting for a live update");
            }
            TimeUnit.MILLISECONDS.sleep(50);
        }
    }
}
