package dev.joinlist.event;

import java.time.OffsetDateTime;

/** One row of the events table. */
public record EventRow(
        long id,
        long organizerId,
        String title,
        String description,
        String location,
        OffsetDateTime startsAt,
        OffsetDateTime registrationOpensAt,
        OffsetDateTime registrationClosesAt,
        int capacity,
        int confirmedCount,
        String status,
        OffsetDateTime createdAt) {

    public static final String DRAFT = "DRAFT";
    public static final String PUBLISHED = "PUBLISHED";
    public static final String CANCELLED = "CANCELLED";

    public boolean isOrganizer(Long userId) {
        return userId != null && userId == organizerId;
    }
}
