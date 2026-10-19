package dev.joinlist.auth;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * "Tokens issued before this moment are refused" per user, kept in memory so that checking a login
 * doesn't cost a database query on every request.
 *
 * <p>Changing the password or deleting the account clears the entry straight after the transaction commits.
 * The 30-second expiry is only a safety net (for example if there were ever several servers).
 */
@Component
public class TokenCutoffs {

    private static final long TTL_MS = 30_000;
    private static final int MAX_ENTRIES = 50_000;

    /** cutoff is null when the user doesn't exist. */
    private record Entry(Instant cutoff, long loadedAt) {}

    private final JdbcClient db;
    private final Map<Long, Entry> cache = new ConcurrentHashMap<>();

    public TokenCutoffs(JdbcClient db) {
        this.db = db;
    }

    /** Empty if the account doesn't exist (any more). */
    public Optional<Instant> cutoff(long userId) {
        long now = System.currentTimeMillis();
        Entry e = cache.get(userId);
        if (e == null || now - e.loadedAt() > TTL_MS) {
            Instant cutoff = db.sql("SELECT tokens_valid_after FROM users WHERE id = ?")
                    .param(userId)
                    .query(OffsetDateTime.class)
                    .optional()
                    .map(OffsetDateTime::toInstant)
                    .orElse(null);
            if (cache.size() > MAX_ENTRIES) {
                cache.clear();
            }
            e = new Entry(cutoff, now);
            cache.put(userId, e);
        }
        return Optional.ofNullable(e.cutoff());
    }

    /** Forget the cached value once the current transaction has committed (or right away if there is none). */
    public void forgetAfterCommit(long userId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cache.remove(userId);
                }
            });
        } else {
            cache.remove(userId);
        }
    }
}
