-- DEMO ONLY. Adds 14 days of made-up rows for the demo group code
-- DEMO-CAMPUS, so the group view has something to show before a real group
-- exists. Rows are marked source = 'sample' (the app labels them), and they
-- count in the everyone view too, as a real group's rows would.
--
-- The group key is the same formula as groupKey() in src/pulse.ts.
--
-- Remove them with:
--   DELETE FROM `mind_relax_pulse.checkins`
--   WHERE source = 'sample' AND grp IS NOT NULL;
--
-- The pattern: an exam week dip in the middle, recovery after.
INSERT INTO `mind_relax_pulse.checkins` (day, contributor, score, grp, source, received_at)
SELECT
  day,
  GENERATE_UUID() AS contributor,
  ROUND(LEAST(5, GREATEST(1,
    3.4
    - IF(DATE_DIFF(CURRENT_DATE(), day, DAY) BETWEEN 5 AND 9, 0.9, 0)
    + (RAND() + RAND() + RAND() - 1.5) * 1.1
  )), 2) AS score,
  SUBSTR(TO_HEX(SHA256('mind-relax-group|DEMO-CAMPUS')), 1, 32) AS grp,
  'sample' AS source,
  CURRENT_TIMESTAMP() AS received_at
FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY),
                                DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))) AS day,
     UNNEST(GENERATE_ARRAY(1, 22)) AS person
-- About 12 to 22 people a day, so every day clears the 10-person rule.
WHERE RAND() < 0.75;
