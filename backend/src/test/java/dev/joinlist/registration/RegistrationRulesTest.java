package dev.joinlist.registration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.joinlist.TestData;
import dev.joinlist.TestcontainersConfiguration;
import dev.joinlist.common.ApiException;
import dev.joinlist.event.EventRepository;
import dev.joinlist.event.EventService;
import dev.joinlist.event.EventService.EventForm;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/** One person at a time: waitlist order, cancelling, capacity changes, check-in. */
@SpringBootTest
@Import({TestcontainersConfiguration.class, TestData.class})
class RegistrationRulesTest {

    @Autowired RegistrationService service;
    @Autowired EventService eventService;
    @Autowired EventRepository events;
    @Autowired QrTokens qr;
    @Autowired TestData data;
    @Autowired JdbcClient db;

    @Test
    void cancellingGivesTheSeatToTheFirstPersonWaiting() {
        long eventId = data.openEvent(2);
        List<Long> u = data.users(4);
        long a = service.register(eventId, u.get(0)).registrationId();
        service.register(eventId, u.get(1));
        long c = service.register(eventId, u.get(2)).registrationId();
        long d = service.register(eventId, u.get(3)).registrationId();
        assertThat(data.status(c)).isEqualTo("WAITLISTED");

        service.cancel(a, u.get(0));

        assertThat(data.status(a)).isEqualTo("CANCELLED");
        assertThat(data.status(c)).isEqualTo("CONFIRMED");
        assertThat(data.status(d)).isEqualTo("WAITLISTED");
        assertThat(service.waitlistPosition(service.find(d).orElseThrow())).isEqualTo(1);
        assertThat(data.confirmedCount(eventId)).isEqualTo(2);
    }

    @Test
    void cancellingWithNobodyWaitingFreesTheSeat() {
        long eventId = data.openEvent(5);
        long user = data.user();
        long reg = service.register(eventId, user).registrationId();

        service.cancel(reg, user);

        assertThat(data.confirmedCount(eventId)).isZero();
    }

    @Test
    void youCanRegisterAgainAfterCancelling() {
        long eventId = data.openEvent(5);
        long user = data.user();
        long first = service.register(eventId, user).registrationId();
        service.cancel(first, user);

        var again = service.register(eventId, user);

        assertThat(again.status()).isEqualTo("CONFIRMED");
        assertThat(data.confirmedCount(eventId)).isEqualTo(1);
    }

    @Test
    void youCannotCancelSomeoneElsesRegistration() {
        long eventId = data.openEvent(5);
        List<Long> u = data.users(2);
        long reg = service.register(eventId, u.get(0)).registrationId();

        assertThatThrownBy(() -> service.cancel(reg, u.get(1))).isInstanceOf(ApiException.class);
        assertThat(data.status(reg)).isEqualTo("CONFIRMED");
    }

    @Test
    void registrationIsRefusedWhenClosedOrCancelled() {
        long closed = data.openEvent(5);
        db.sql("UPDATE events SET registration_closes_at = now() - interval '1 minute', "
                + "registration_opens_at = now() - interval '2 hours' WHERE id = ?").param(closed).update();
        assertThatThrownBy(() -> service.register(closed, data.user()))
                .isInstanceOf(ApiException.class).hasMessageContaining("closed");

        long cancelled = data.openEvent(5);
        eventService.cancel(cancelled, data.organizerOf(cancelled));
        assertThatThrownBy(() -> service.register(cancelled, data.user()))
                .isInstanceOf(ApiException.class).hasMessageContaining("cancelled");
    }

    @Test
    void raisingCapacityMovesPeopleOffTheWaitlist() {
        long eventId = data.openEvent(1);
        List<Long> u = data.users(3);
        u.forEach(user -> service.register(eventId, user));
        var event = events.find(eventId).orElseThrow();

        eventService.update(eventId, event.organizerId(), new EventForm(event.title(), event.description(),
                event.location(), event.startsAt(), event.registrationOpensAt(), event.registrationClosesAt(), 2));

        assertThat(data.confirmedCount(eventId)).isEqualTo(2);
        assertThat(data.count(eventId, "CONFIRMED")).isEqualTo(2);
        assertThat(data.count(eventId, "WAITLISTED")).isEqualTo(1);
    }

    @Test
    void capacityCannotGoBelowConfirmedCount() {
        long eventId = data.openEvent(3);
        data.users(3).forEach(user -> service.register(eventId, user));
        var event = events.find(eventId).orElseThrow();

        assertThatThrownBy(() -> eventService.update(eventId, event.organizerId(), new EventForm(event.title(),
                event.description(), event.location(), event.startsAt(), event.registrationOpensAt(),
                event.registrationClosesAt(), 2)))
                .isInstanceOf(ApiException.class);
        assertThat(data.confirmedCount(eventId)).isEqualTo(3);
    }

    @Test
    void checkInWorksOnceAndRejectsFakeCodes() {
        long eventId = data.openEvent(5);
        long reg = service.register(eventId, data.user()).registrationId();
        String token = qr.create(reg);

        assertThat(qr.verify(token)).hasValue(reg);
        assertThat(service.checkIn(eventId, reg).checkedInAt()).isNotNull();
        assertThatThrownBy(() -> service.checkIn(eventId, reg))
                .isInstanceOf(ApiException.class).hasMessageContaining("Already");

        String forged = (reg + 1) + token.substring(token.indexOf('.'));
        assertThat(qr.verify(forged)).isEmpty();
        assertThat(qr.verify("garbage")).isEmpty();
    }

    @Test
    void waitlistedPeopleCannotCheckIn() {
        long eventId = data.openEvent(1);
        service.register(eventId, data.user());
        long waiting = service.register(eventId, data.user()).registrationId();

        assertThatThrownBy(() -> service.checkIn(eventId, waiting))
                .isInstanceOf(ApiException.class).hasMessageContaining("waitlisted");
    }
}
