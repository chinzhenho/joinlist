package dev.joinlist.registration;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.OptionalLong;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/**
 * QR check-in codes: "<registrationId>.<signature>".
 * The signature is an HMAC made with the server's secret, so nobody can make a valid code for
 * another registration, and the code can be shown again any time without storing it.
 */
@Component
public class QrTokens {

    private static final int SIGNATURE_BYTES = 16;

    private final SecretKey key;

    public QrTokens(SecretKey signingKey) {
        this.key = signingKey;
    }

    public String create(long registrationId) {
        return registrationId + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sign(registrationId));
    }

    /** The registration id if the code is genuine, otherwise empty. */
    public OptionalLong verify(String token) {
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
            // Constant-time compare, so the signature can't be guessed byte by byte from response times.
            return MessageDigest.isEqual(given, sign(id)) ? OptionalLong.of(id) : OptionalLong.empty();
        } catch (IllegalArgumentException e) {
            return OptionalLong.empty();
        }
    }

    private byte[] sign(long registrationId) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            byte[] full = mac.doFinal(("qr:" + registrationId).getBytes(StandardCharsets.UTF_8));
            return Arrays.copyOf(full, SIGNATURE_BYTES);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
