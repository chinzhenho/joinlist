package dev.joinlist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Rename, change password, delete account, and checking someone in by hand. */
@SpringBootTest(properties = "joinlist.rate-limit.enabled=false")
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, TestData.class})
class AccountTest {

    @Autowired MockMvc mvc;
    @Autowired TestData data;

    record Account(String email, String token, long id) {}

    @Test
    void renameChangesTheName() throws Exception {
        Account a = signUp();
        mvc.perform(patch("/api/me").header("Authorization", a.token())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  New Name  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name", is("New Name")));
    }

    @Test
    void changingPasswordLogsOutOtherDevices() throws Exception {
        Account a = signUp();
        mvc.perform(post("/api/me/password").header("Authorization", a.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"wrong-one\",\"newPassword\":\"new-password-1\"}"))
                .andExpect(status().isForbidden());

        String res = mvc.perform(post("/api/me/password").header("Authorization", a.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"password123\",\"newPassword\":\"new-password-1\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String fresh = "Bearer " + JsonPath.read(res, "$.token");

        // Wait past the second boundary so the old token is clearly older than the cut-off.
        Thread.sleep(1100);
        mvc.perform(get("/api/me").header("Authorization", fresh)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + a.email() + "\",\"password\":\"password123\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + a.email() + "\",\"password\":\"new-password-1\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void oldTokenStopsWorkingAfterPasswordChange() throws Exception {
        Account a = signUp();
        Thread.sleep(1100); // the old token must be issued in an earlier second than the change
        mvc.perform(post("/api/me/password").header("Authorization", a.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"password123\",\"newPassword\":\"new-password-1\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/me").header("Authorization", a.token())).andExpect(status().isUnauthorized());
    }

    @Test
    void deletingAnAccountFreesSeatsCancelsEventsAndBlocksLogin() throws Exception {
        // Someone else's 1-seat event: our user holds the seat, another person waits.
        long event = data.openEvent(1);
        Account leaving = signUp();
        mvc.perform(post("/api/events/" + event + "/registrations").header("Authorization", leaving.token()))
                .andExpect(jsonPath("$.status", is("CONFIRMED")));
        Account waiting = signUp();
        String w = mvc.perform(post("/api/events/" + event + "/registrations").header("Authorization", waiting.token()))
                .andExpect(jsonPath("$.status", is("WAITLISTED")))
                .andReturn().getResponse().getContentAsString();
        long waitingReg = ((Number) JsonPath.read(w, "$.registrationId")).longValue();

        // An event our user organises, with one attendee.
        long own = data.openEvent(5);
        data.makeOrganizer(own, leaving.id());

        mvc.perform(delete("/api/me").header("Authorization", leaving.token())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"wrong\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/me").header("Authorization", leaving.token())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"password123\"}"))
                .andExpect(status().isNoContent());

        assertThat(data.status(waitingReg)).isEqualTo("CONFIRMED");     // seat went to the waitlist
        assertThat(data.confirmedCount(event)).isEqualTo(1);
        assertThat(data.eventStatus(own)).isEqualTo("CANCELLED");       // their event was cancelled
        mvc.perform(get("/api/me").header("Authorization", leaving.token())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + leaving.email() + "\",\"password\":\"password123\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void organizerCanCheckSomeoneInByHand() throws Exception {
        Account organizer = signUp();
        long event = data.openEvent(5);
        data.makeOrganizer(event, organizer.id());
        Account guest = signUp();
        String r = mvc.perform(post("/api/events/" + event + "/registrations").header("Authorization", guest.token()))
                .andReturn().getResponse().getContentAsString();
        long reg = ((Number) JsonPath.read(r, "$.registrationId")).longValue();

        mvc.perform(post("/api/events/" + event + "/registrations/" + reg + "/check-in")
                        .header("Authorization", guest.token()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/events/" + event + "/registrations/" + reg + "/check-in")
                        .header("Authorization", organizer.token()))
                .andExpect(status().isOk());
        mvc.perform(post("/api/events/" + event + "/registrations/" + reg + "/check-in")
                        .header("Authorization", organizer.token()))
                .andExpect(status().isConflict());
    }

    private Account signUp() throws Exception {
        String email = "a-" + UUID.randomUUID() + "@test.dev";
        String res = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Tester\",\"email\":\"" + email + "\",\"password\":\"password123\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return new Account(email, "Bearer " + JsonPath.read(res, "$.token"),
                ((Number) JsonPath.read(res, "$.user.id")).longValue());
    }
}
