package dev.joinlist.config;

import dev.joinlist.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Simple per-minute limits kept in memory:
 *   - login/sign-up: per IP address (no account yet)
 *   - registering, cancelling, creating events: per account
 * Known limit: counts live in one server's memory, so they aren't shared if there are several servers.
 * Redis would fix that later.
 */
@Component
public class RateLimiter implements HandlerInterceptor {

    static final int AUTH_PER_MINUTE = 10;
    static final int ACTIONS_PER_MINUTE = 30;

    private record Window(long minute, AtomicInteger count) {}

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final boolean enabled;

    public RateLimiter(JoinlistProperties props) {
        this.enabled = props.rateLimit().enabled();
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!enabled || "GET".equals(request.getMethod()) || "OPTIONS".equals(request.getMethod())) {
            return true;
        }
        String key;
        int limit;
        if (request.getRequestURI().startsWith("/api/auth/")) {
            key = "ip:" + request.getRemoteAddr();
            limit = AUTH_PER_MINUTE;
        } else if (SecurityContextHolder.getContext().getAuthentication() != null
                && SecurityContextHolder.getContext().getAuthentication().getPrincipal() instanceof Jwt jwt) {
            key = "user:" + jwt.getSubject();
            limit = ACTIONS_PER_MINUTE;
        } else {
            return true;
        }
        if (!allow(key, limit)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "slow_down",
                    "Too many tries. Please wait a minute and try again.");
        }
        return true;
    }

    boolean allow(String key, int limit) {
        long minute = System.currentTimeMillis() / 60_000;
        if (windows.size() > 50_000) {
            windows.values().removeIf(w -> w.minute() < minute);
        }
        Window w = windows.compute(key, (k, old) ->
                old == null || old.minute() != minute ? new Window(minute, new AtomicInteger()) : old);
        return w.count().incrementAndGet() <= limit;
    }
}
