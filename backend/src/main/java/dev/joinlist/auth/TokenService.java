package dev.joinlist.auth;

import dev.joinlist.config.JoinlistProperties;
import java.time.Duration;
import java.time.Instant;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

@Service
public class TokenService {

    private final JwtEncoder encoder;
    private final Duration lifetime;

    public TokenService(JwtEncoder encoder, JoinlistProperties props) {
        this.encoder = encoder;
        this.lifetime = Duration.ofDays(props.tokenDays());
    }

    public String issue(long userId) {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder()
                .issuer("joinlist")
                .subject(Long.toString(userId))
                .issuedAt(now)
                .expiresAt(now.plus(lifetime))
                .build();
        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    /** The logged-in user's id, taken from the verified token. */
    public static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
