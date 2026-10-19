package dev.joinlist.config;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** TEMPORARY: shows the caller how their own address arrives, to pick a header that can't be faked. */
@RestController
class IpProbe {

    @GetMapping("/api/health/ip")
    Map<String, String> probe(HttpServletRequest req) {
        Map<String, String> out = new LinkedHashMap<>();
        out.put("remoteAddr", req.getRemoteAddr());
        for (String h : new String[] {"X-Forwarded-For", "CF-Connecting-IP", "True-Client-IP", "X-Real-IP", "Forwarded"}) {
            out.put(h, String.valueOf(req.getHeader(h)));
        }
        return out;
    }
}
