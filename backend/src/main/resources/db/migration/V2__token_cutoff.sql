-- Login tokens issued before this moment are refused.
-- Changing the password moves it to now (logs out other devices); deleting the account moves it to the far future.
ALTER TABLE users ADD COLUMN tokens_valid_after TIMESTAMPTZ NOT NULL DEFAULT 'epoch';
