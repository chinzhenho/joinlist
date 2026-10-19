package dev.joinlist;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Password guessing is limited per IP, and a fake X-Forwarded-For header can't get around it. */
@SpringBootTest(properties = "joinlist.rate-limit.enabled=true")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class RateLimitTest {

    @Autowired MockMvc mvc;

    private static final String BAD_LOGIN = "{\"email\":\"nobody@test.dev\",\"password\":\"wrong-password\"}";

    @Test
    void tenTriesAMinuteThenBlockedEvenWithFakeForwardedFor() throws Exception {
        for (int i = 0; i < 10; i++) {
            mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(BAD_LOGIN)
                            .header("CF-Connecting-IP", "203.0.113.7")
                            .header("X-Forwarded-For", "10.0.0." + i))   // a different fake address every time
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(BAD_LOGIN)
                        .header("CF-Connecting-IP", "203.0.113.7")
                        .header("X-Forwarded-For", "10.0.0.99"))
                .andExpect(status().isTooManyRequests());

        // Someone else (a different real IP) is not affected.
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(BAD_LOGIN)
                        .header("CF-Connecting-IP", "198.51.100.20"))
                .andExpect(status().isUnauthorized());
    }
}
