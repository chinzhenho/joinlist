package dev.joinlist.registration;

import static org.assertj.core.api.Assertions.assertThat;

import dev.joinlist.TestData;
import dev.joinlist.TestcontainersConfiguration;
import dev.joinlist.common.ApiException;
import dev.joinlist.config.JoinlistProperties.SeatStrategy;
import dev.joinlist.event.EventRepository;
import dev.joinlist.registration.RegistrationService.Result;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;

/**
 * The tests that matter most: many people acting at the same moment, against a real PostgreSQL.
 * Every test runs once per seat strategy (atomic update and pessimistic lock).
 */
@SpringBootTest
@Import({TestcontainersConfiguration.class, TestData.class})
class SeatConcurrencyTest {

    @Autowired RegistrationService service;
    @Autowired EventRepository events;
    @Autowired TestData data;

    @ParameterizedTest
    @EnumSource(SeatStrategy.class)
    void thousandPeopleRaceForFiftySeats(SeatStrategy strategy) throws Exception {
        long eventId = data.openEvent(50);
        List<Long> users = data.users(1000);

        long started = System.nanoTime();
        List<Result> results = runAllAtOnce(users.stream()
                .<Callable<Result>>map(u -> () -> service.register(eventId, u, strategy))
                .toList());
        long ms = (System.nanoTime() - started) / 1_000_000;
        System.out.printf("[%s] 1000 registrations took %d ms%n", strategy, ms);

        assertThat(results.stream().filter(r -> r.status().equals("CONFIRMED"))).hasSize(50);
        assertThat(results.stream().filter(r -> r.status().equals("WAITLISTED"))).hasSize(950);
        // Check the database itself, not just what the API answered.
        assertThat(data.count(eventId, "CONFIRMED")).isEqualTo(50);
        assertThat(data.count(eventId, "WAITLISTED")).isEqualTo(950);
        assertThat(data.confirmedCount(eventId)).isEqualTo(50);
    }

    @ParameterizedTest
    @EnumSource(SeatStrategy.class)
    void twoPeopleRaceForTheLastSeat(SeatStrategy strategy) throws Exception {
        long eventId = data.openEvent(1);
        List<Long> users = data.users(2);

        List<Result> results = runAllAtOnce(users.stream()
                .<Callable<Result>>map(u -> () -> service.register(eventId, u, strategy))
                .toList());

        assertThat(results).extracting(Result::status).containsExactlyInAnyOrder("CONFIRMED", "WAITLISTED");
        assertThat(data.confirmedCount(eventId)).isEqualTo(1);
    }

    @ParameterizedTest
    @EnumSource(SeatStrategy.class)
    void doubleClickingCreatesOnlyOneRegistration(SeatStrategy strategy) throws Exception {
        long eventId = data.openEvent(10);
        long user = data.user();

        List<Callable<Result>> clicks = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            clicks.add(() -> service.register(eventId, user, strategy));
        }
        List<Object> outcomes = runAllAtOnceAllowingErrors(clicks);

        assertThat(outcomes.stream().filter(o -> o instanceof Result)).hasSize(1);
        // The rest were refused, either by the early check or by the database's unique index.
        assertThat(outcomes.stream().filter(o -> o instanceof ApiException || o instanceof DuplicateKeyException))
                .hasSize(19);
        assertThat(data.count(eventId, "CONFIRMED")).isEqualTo(1);
        assertThat(data.confirmedCount(eventId)).isEqualTo(1);
    }

    /**
     * Half the confirmed people cancel while new people register, all at once.
     * Afterwards: no seat may sit empty while someone waits, and the counter must match the rows.
     */
    @ParameterizedTest
    @EnumSource(SeatStrategy.class)
    void cancellationsAndNewRegistrationsAtTheSameTime(SeatStrategy strategy) throws Exception {
        long eventId = data.openEvent(50);
        List<Long> first = data.users(60);                 // 50 confirmed + 10 waiting
        List<Long> regIds = new ArrayList<>();
        for (long u : first) {
            regIds.add(service.register(eventId, u, strategy).registrationId());
        }
        List<Long> newcomers = data.users(40);

        List<Callable<Object>> work = new ArrayList<>();
        for (int i = 0; i < 25; i++) {                     // 25 of the confirmed people cancel
            long regId = regIds.get(i);
            long user = first.get(i);
            work.add(() -> { service.cancel(regId, user); return null; });
        }
        for (long u : newcomers) {
            work.add(() -> service.register(eventId, u, strategy));
        }
        runAllAtOnce(work);

        int confirmedRows = data.count(eventId, "CONFIRMED");
        int waiting = data.count(eventId, "WAITLISTED");
        assertThat(data.confirmedCount(eventId)).isEqualTo(confirmedRows);
        assertThat(confirmedRows).isEqualTo(50);           // 75 people still want in, so it stays full
        assertThat(waiting).isEqualTo(25);
        assertThat(confirmedRows + waiting).isEqualTo(60 - 25 + 40);
    }

    // ---------------------------------------------------------------- helpers

    /** Starts every task at the same instant (a starting gun), waits for all, and fails if any failed. */
    private <T> List<T> runAllAtOnce(List<Callable<T>> tasks) throws Exception {
        List<Object> outcomes = runAllAtOnceAllowingErrors(tasks);
        List<T> results = new ArrayList<>();
        for (Object o : outcomes) {
            if (o instanceof Throwable t) {
                throw new AssertionError("A request failed", t);
            }
            @SuppressWarnings("unchecked") T r = (T) o;
            results.add(r);
        }
        return results;
    }

    private List<Object> runAllAtOnceAllowingErrors(List<? extends Callable<?>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(64);
        CountDownLatch startingGun = new CountDownLatch(1);
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (Callable<?> task : tasks) {
                futures.add(pool.submit(() -> {
                    startingGun.await();
                    return task.call();
                }));
            }
            startingGun.countDown();
            List<Object> outcomes = new ArrayList<>();
            for (Future<?> f : futures) {
                try {
                    outcomes.add(f.get(60, TimeUnit.SECONDS));
                } catch (java.util.concurrent.ExecutionException e) {
                    outcomes.add(e.getCause());
                }
            }
            return outcomes;
        } finally {
            pool.shutdownNow();
        }
    }
}
