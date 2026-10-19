package dev.joinlist.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("joinlist")
public record JoinlistProperties(
        String secret,
        int tokenDays,
        List<String> corsOrigins,
        List<String> publicOrigins,
        SeatStrategy seatStrategy,
        int cancelCutoffHours,
        RateLimit rateLimit,
        Brevo brevo,
        String appUrl) {

    public enum SeatStrategy { ATOMIC, PESSIMISTIC }

    public record RateLimit(boolean enabled, String clientIpHeader) {}

    public record Brevo(String apiKey, String senderEmail, String senderName) {}
}
