DROP DATABASE IF EXISTS "sportradar_challenge";

CREATE DATABASE "sportradar_challenge";

\c "sportradar_challenge";

CREATE TABLE seasons (
  id SERIAL PRIMARY KEY,
  season_year INTEGER UNIQUE NOT NULL
);

CREATE TABLE season_types (
  id SERIAL PRIMARY KEY,
  type TEXT UNIQUE NOT NULL
);

CREATE TABLE full_years (
  id SERIAL PRIMARY KEY,
  year_id INT REFERENCES seasons ON DELETE CASCADE,
  season_type_id INT REFERENCES season_types ON DELETE CASCADE
);

CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE bye_weeks (
  id SERIAL PRIMARY KEY,
  week INT,
  team_id INT REFERENCES teams ON DELETE CASCADE,
  season_id INT REFERENCES seasons ON DELETE CASCADE
);

CREATE TABLE points_after_bye (
  id SERIAL PRIMARY KEY,
  -- team_id TEXT REFERENCES teams ON DELETE CASCADE,
  -- season_id INTEGER REFERENCES seasons ON DELETE CASCADE,
  bye_week_id INTEGER REFERENCES bye_weeks ON DELETE CASCADE,
  total_avg FLOAT,
  first_quarter FLOAT,
  second_quarter FLOAT,
  third_quarter FLOAT,
  fourth_quarter FLOAT,
  overtime FLOAT
);

INSERT INTO seasons (season_year) VALUES
  (2014),
  (2015),
  (2016),
  (2017),
  (2018);

INSERT INTO season_types (type) VALUES
  ('REG'),
  ('POST');

INSERT INTO teams (name) VALUES
  ('ATL'),
  ('ARI'),
  ('BAL'),
  ('BUF'),
  ('CAR'),
  ('CHI'),
  ('CIN'),
  ('CLE'),
  ('DAL'),
  ('DEN'),
  ('DET'),
  ('GB'),
  ('HOU'),
  ('IND'),
  ('JAX'),
  ('KC'),
  ('LA'),
  ('LAC'),
  ('MIA'),
  ('MIN'),
  ('NE'),
  ('NO'),
  ('NYG'),
  ('NYJ'),
  ('OAK'),
  ('PHI'),
  ('PIT'),
  ('SD'),
  ('SEA'),
  ('SF'),
  ('STL'),
  ('TB'),
  ('TEN'),
  ('WAS');

-- INSERT INTO bye_weeks (week) VALUES
--   (1),
--   (2),
--   (3),
--   (4),
--   (5),
--   (6),
--   (7),
--   (8),
--   (9),
--   (10),
--   (11),
--   (12),
--   (13),
--   (14),
--   (15),
--   (16),
--   (17);

