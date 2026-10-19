package dev.joinlist;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** The whole flow through HTTP: sign up, create and publish an event, register, check in, permissions. */
@SpringBootTest(properties = "joinlist.rate-limit.enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ApiFlowTest {

    @Autowired MockMvc mvc;

    @Test
    void fullFlow() throws Exception {
        String organizer = signUp("Olivia");
        String guest = signUp("Gabriel");
        String stranger = signUp("Sam");

        OffsetDateTime now = OffsetDateTime.now();
        String eventJson = """
                {"title": "Intro to Git", "description": "Bring a laptop", "location": "FCI Lab 2",
                 "startsAt": "%s", "registrationOpensAt": "%s", "registrationClosesAt": "%s", "capacity": 1}"""
                .formatted(now.plusDays(2), now.minusMinutes(5), now.plusDays(1));
        String created = mvc.perform(post("/api/events").header("Authorization", organizer)
                        .contentType(MediaType.APPLICATION_JSON).content(eventJson))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long eventId = ((Number) JsonPath.read(created, "$.id")).longValue();

        // Drafts are invisible to others and can't be registered for.
        mvc.perform(get("/api/events/" + eventId)).andExpect(status().isNotFound());

        // Only the organizer can publish.
        mvc.perform(post("/api/events/" + eventId + "/publish").header("Authorization", stranger))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/events/" + eventId + "/publish").header("Authorization", organizer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phase", is("open")));

        // Strangers can't edit or cancel someone else's event, even by calling the API directly.
        String hijack = eventJson.replace("Intro to Git", "Hacked").replace("\"capacity\": 1", "\"capacity\": 999");
        mvc.perform(patch("/api/events/" + eventId).header("Authorization", stranger)
                        .contentType(MediaType.APPLICATION_JSON).content(hijack))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/events/" + eventId + "/cancel").header("Authorization", stranger))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/events/" + eventId + "/cancel"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/events/" + eventId))
                .andExpect(jsonPath("$.title", is("Intro to Git")))
                .andExpect(jsonPath("$.capacity", is(1)))
                .andExpect(jsonPath("$.status", is("PUBLISHED")));

        // Not logged in → 401. Logged in → seat.
        mvc.perform(post("/api/events/" + eventId + "/registrations")).andExpect(status().isUnauthorized());
        String reg = mvc.perform(post("/api/events/" + eventId + "/registrations").header("Authorization", guest))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status", is("CONFIRMED")))
                .andReturn().getResponse().getContentAsString();
        long regId = ((Number) JsonPath.read(reg, "$.registrationId")).longValue();

        // Event is full now, so the next person waits.
        mvc.perform(post("/api/events/" + eventId + "/registrations").header("Authorization", stranger))
                .andExpect(jsonPath("$.status", is("WAITLISTED")));
        mvc.perform(get("/api/events/" + eventId).header("Authorization", stranger))
                .andExpect(jsonPath("$.spotsLeft", is(0)))
                .andExpect(jsonPath("$.myRegistration.waitlistPosition", is(1)));

        // The guest's QR code comes from "my registrations".
        String mine = mvc.perform(get("/api/me/registrations").header("Authorization", guest))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(mine, "$[0].registration.qrToken");

        // Strangers can't see the list or check people in.
        mvc.perform(get("/api/events/" + eventId + "/attendees").header("Authorization", stranger))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/events/" + eventId + "/check-in").header("Authorization", stranger)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isForbidden());

        // A wrong code is refused.
        mvc.perform(post("/api/events/" + eventId + "/check-in").header("Authorization", organizer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"ABCD-EFGH\"}"))
                .andExpect(status().isBadRequest());

        // Organizer types the code (lower case, with a space instead of the dash) once; the second scan is refused.
        String typed = token.toLowerCase().replace("-", " ");
        mvc.perform(post("/api/events/" + eventId + "/check-in").header("Authorization", organizer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + typed + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name", is("Gabriel")));
        mvc.perform(post("/api/events/" + eventId + "/check-in").header("Authorization", organizer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isConflict());

        mvc.perform(get("/api/events/" + eventId + "/attendees.csv").header("Authorization", organizer))
                .andExpect(status().isOk());

        // Someone else can't cancel the guest's registration.
        mvc.perform(delete("/api/registrations/" + regId).header("Authorization", stranger))
                .andExpect(status().isNotFound());
    }

    @Test
    void wrongPasswordIsRejected() throws Exception {
        String email = "p-" + UUID.randomUUID() + "@test.dev";
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"P\",\"email\":\"" + email + "\",\"password\":\"correct-horse\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"P\",\"email\":\"" + email.toUpperCase() + "\",\"password\":\"correct-horse\"}"))
                .andExpect(status().isConflict());
    }

    private String signUp(String name) throws Exception {
        String body = """
                {"name": "%s", "email": "%s-%s@test.dev", "password": "password123"}"""
                .formatted(name, name.toLowerCase(), UUID.randomUUID());
        String res = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.read(res, "$.token");
    }
}
