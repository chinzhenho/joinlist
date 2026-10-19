package dev.joinlist.registration;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.Locale;
import java.util.OptionalLong;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/**
 * Check-in codes, made with an HMAC of the registration id and the server's secret. Nobody can make a valid
 * code for someone else, and a code can be shown again any time without being stored.
 *
 * <p>Current format: 8 characters like {@code 8K3F-7QPA}, easy to read out and type at the door. The alphabet
 * leaves out look-alikes (0/O, 1/I/L) and typing is case-insensitive. 31^8 is about 850 billion combinations,
 * and only the event's organiser (logged in) can check people in, so guessing is not a real risk.
 *
 * <p>Old format, still accepted: {@code "<registrationId>.<signature>"}.
 */
@Component
public class QrTokens {

    static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    static final int CODE_LENGTH = 8;
    private static final int OLD_SIGNATURE_BYTES = 16;

    private final SecretKey key;

    public QrTokens(SecretKey signingKey) {
        this.key = signingKey;
    }

    /** The code shown to the attendee and put in their QR, e.g. "8K3F-7QPA". */
    public String create(long registrationId) {
        String c = code(registrationId);
        return c.substring(0, 4) + "-" + c.substring(4);
    }

    /** The 8-character code without the dash. */
    public String code(long registrationId) {
        byte[] mac = hmac("code:" + registrationId);
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(ALPHABET.charAt((mac[i] & 0xff) % ALPHABET.length()));
        }
        return sb.toString();
    }

    /** What the organiser typed or scanned, cleaned up: "8k3f 7qpa" → "8K3F7QPA". Empty if it can't be a code. */
    public String normalize(String input) {
        if (input == null) {
            return "";
        }
        String s = input.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        return s.length() == CODE_LENGTH && s.chars().allMatch(ch -> ALPHABET.indexOf(ch) >= 0) ? s : "";
    }

    /** Is this the code for that registration? Constant-time, so it can't be guessed letter by letter. */
    public boolean matches(long registrationId, String normalizedCode) {
        return MessageDigest.isEqual(code(registrationId).getBytes(StandardCharsets.US_ASCII),
                normalizedCode.getBytes(StandardCharsets.US_ASCII));
    }

    /** Old long format: the registration id if the token is genuine, otherwise empty. */
    public OptionalLong verifyOldToken(String token) {
        if (token == null) {
            return OptionalLong.empty();
        }
        String[] parts = token.trim().split("\\.", 2);
        if (parts.length != 2) {
            return OptionalLong.empty();
        }
        try {
            long id = Long.parseLong(parts[0]);
            byte[] given = Base64.getUrlDecoder().decode(parts[1]);
            byte[] expected = Arrays.copyOf(hmac("qr:" + id), OLD_SIGNATURE_BYTES);
            return MessageDigest.isEqual(given, expected) ? OptionalLong.of(id) : OptionalLong.empty();
        } catch (IllegalArgumentException e) {
            return OptionalLong.empty();
        }
    }

    private byte[] hmac(String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
