-- Trains the 7-day community mood forecast with BigQuery ML (ARIMA_PLUS).
-- It learns only from finished days that had at least 10 people, the same
-- rule the app uses for showing a day. Re-run it to refresh the forecast:
--
--   bq query --use_legacy_sql=false --location=asia-southeast1 \
--     --project_id=<project> < bigquery/train-forecast.sql
--
-- Cost: the table is tiny, so this stays inside BigQuery's free monthly tier.
CREATE OR REPLACE MODEL `mind_relax_pulse.mood_forecast`
OPTIONS (
  model_type = 'ARIMA_PLUS',
  time_series_timestamp_col = 'day',
  time_series_data_col = 'average',
  data_frequency = 'DAILY',
  horizon = 7
) AS
SELECT day, AVG(score) AS average
FROM `mind_relax_pulse.checkins`
WHERE day < CURRENT_DATE()
GROUP BY day
HAVING COUNT(DISTINCT contributor) >= 10;
