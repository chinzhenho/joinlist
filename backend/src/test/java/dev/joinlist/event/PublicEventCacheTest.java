package dev.joinlist.event;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.joinlist.TestData;
import dev.joinlist.TestcontainersConfiguration;
import dev.joinlist.registration.RegistrationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

/** The public pages are cached, but a change must show up on the very next request, never seconds later. */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, TestData.class})
class PublicEventCacheTest {

    @Autowired MockMvc mvc;
    @Autowired RegistrationService registrations;
    @Autowired EventService events;
    @Autowired TestData data;
    @Autowired JdbcClient db;

    @Test
    void changesShowUpStraightAway() throws Exception {
        long eventId = data.openEvent(5);
        // Starts sooner than other test events, so it is near the top of the public list.
        db.sql("UPDATE events SET starts_at = now() + interval '3 hours', registration_closes_at = now() + interval '2 hours' WHERE id = ?")
                .param(eventId)
                .update();
        mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.spotsLeft", is(5)));
        mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.spotsLeft", is(5))); // now from the cache

        long user = data.user();
        long reg = registrations.register(eventId, user).registrationId();
        mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.spotsLeft", is(4)));

        registrations.cancel(reg, user);
        mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.spotsLeft", is(5)));
        mvc.perform(get("/api/events")).andExpect(jsonPath("$[*].id", hasItem((int) eventId)));

        events.cancel(eventId, data.organizerOf(eventId));
        mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.status", is("CANCELLED")));
        mvc.perform(get("/api/events")).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + eventId + ")]").isEmpty());
    }
}
