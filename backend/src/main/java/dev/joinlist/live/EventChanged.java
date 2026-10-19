package dev.joinlist.live;

/** "Something about this event changed" (seats, waitlist, details, check-ins). Carries no personal data. */
public record EventChanged(long eventId) {}
