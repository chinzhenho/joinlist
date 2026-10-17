package dev.joinlist.auth;

import dev.joinlist.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final TokenService tokens;

    public AuthController(JdbcClient db, PasswordEncoder passwords, TokenService tokens) {
        this.db = db;
        this.passwords = passwords;
        this.tokens = tokens;
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72) String password) {}

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

    public record UserView(long id, String name, String email) {}

    public record AuthResponse(String token, UserView user) {}

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        String name = req.name().trim();
        long id;
        try {
            id = db.sql("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) RETURNING id")
                    .params(name, email, passwords.encode(req.password()))
                    .query(Long.class)
                    .single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("email_taken", "An account with this email already exists.");
        }
        return new AuthResponse(tokens.issue(id), new UserView(id, name, email));
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        String email = req.email().trim().toLowerCase();
        record Row(long id, String name, String email, String passwordHash) {}
        var user = db.sql("SELECT id, name, email, password_hash FROM users WHERE lower(email) = ?")
                .param(email)
                .query(Row.class)
                .optional()
                // Same message whether the email or the password is wrong, so emails can't be probed.
                .filter(u -> passwords.matches(req.password(), u.passwordHash()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "bad_login",
                        "Wrong email or password."));
        return new AuthResponse(tokens.issue(user.id()), new UserView(user.id(), user.name(), user.email()));
    }

    @GetMapping("/me")
    public UserView me(@AuthenticationPrincipal Jwt jwt) {
        return db.sql("SELECT id, name, email FROM users WHERE id = ?")
                .param(TokenService.userId(jwt))
                .query(UserView.class)
                .optional()
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "no_user", "Please log in again."));
    }
}
