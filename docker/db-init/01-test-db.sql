-- A separate database for the API tests (they wipe it). Runs only when the volume is first made;
-- the test setup also creates it if it's missing.
CREATE DATABASE strekatron_test OWNER strekatron;
