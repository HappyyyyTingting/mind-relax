-- One-time schema change for group join codes. Adds a nullable column, so
-- existing rows (and older app versions, which send no group) keep working.
-- Run this BEFORE deploying the server version that writes grp.
ALTER TABLE `mind_relax_pulse.checkins` ADD COLUMN IF NOT EXISTS grp STRING;
