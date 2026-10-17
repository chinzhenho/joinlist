package dev.joinlist.notify;

/** "Tell this user about this event." Published inside a transaction, sent only after it commits. */
public record Notice(Type type, long userId, long eventId) {

    public enum Type { REGISTERED, PROMOTED, EVENT_CANCELLED }
}
