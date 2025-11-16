-- users
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  name varchar(200),
  username varchar(200) NOT NULL UNIQUE,
  avatar_url text,
  bio text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- auth_providers
CREATE TABLE IF NOT EXISTS auth_providers (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id),
  provider varchar(50) NOT NULL,
  provider_id varchar(300) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- refresh_tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id),
  token_hash varchar(512) NOT NULL,
  revoked boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL
);
