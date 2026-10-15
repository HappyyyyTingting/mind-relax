-- DEMO ONLY. Fills the last 60 days (up to yesterday) with made-up rows so
-- the community chart and forecast have something to show before real users
-- exist. Every row is marked source = 'sample', and the app shows a
-- "sample data" label whenever a shown day contains sample rows.
--
-- Remove the sample rows with:
--   DELETE FROM `mind_relax_pulse.checkins` WHERE source = 'sample';
--
-- The pattern: a little higher at weekends, a slow dip and recovery, noise.
INSERT INTO `mind_relax_pulse.checkins` (day, contributor, score, source, received_at)
SELECT
  day,
  GENERATE_UUID() AS contributor,
  ROUND(LEAST(5, GREATEST(1,
    3.2
    + IF(EXTRACT(DAYOFWEEK FROM day) IN (1, 7), 0.35, 0)
    - 0.4 * SIN(DATE_DIFF(day, DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY), DAY) / 60 * ACOS(-1))
    + (RAND() + RAND() + RAND() - 1.5) * 1.2
  )), 2) AS score,
  'sample' AS source,
  CURRENT_TIMESTAMP() AS received_at
FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY),
                                DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))) AS day,
     UNNEST(GENERATE_ARRAY(1, 40)) AS person
-- Between about 16 and 40 people a day.
WHERE RAND() < 0.4 + 0.6 * ABS(SIN(UNIX_DATE(day)));
