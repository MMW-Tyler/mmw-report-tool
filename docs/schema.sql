-- Migration 001: Initial schema
-- MMW Reporting Engine

create extension if not exists "pgcrypto";

-- Internal MMW team members (AEs and admins)
create table team_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  role          text not null check (role in ('admin', 'ae')),
  password_hash text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Shared OAuth accounts (typically one row: medicalmarketingwhiz@gmail.com)
create table oauth_accounts (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null unique,
  credentials_encrypted text not null,  -- AES-256-GCM: iv:tag:ciphertext (hex)
  scopes                text[] not null default '{}',
  last_refresh_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- MMW client roster
create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,  -- url-safe identifier
  ae_id       uuid references team_users(id),
  niche       text,
  city        text,
  state       text,
  website     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Per-client x per-provider integrations
-- CHECK: shared_oauth rows must have oauth_account_id and null inline creds
--        pit rows must have inline creds and null oauth_account_id
create table integrations (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  provider              text not null check (provider in ('ga4', 'gsc', 'gbp', 'ghl')),
  auth_type             text not null check (auth_type in ('shared_oauth', 'pit')),
  oauth_account_id      uuid references oauth_accounts(id),
  credentials_encrypted text,        -- AES-256-GCM: pit auth only (GHL PIT)
  resource_id           text,        -- GA4 property ID / GSC site URL / GBP location name / GHL location ID
  display_name          text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint integrations_auth_type_check check (
    (auth_type = 'shared_oauth' and oauth_account_id is not null and credentials_encrypted is null)
    or
    (auth_type = 'pit' and credentials_encrypted is not null and oauth_account_id is null)
  ),
  unique(client_id, provider)
);

-- One report per client per period (typically a calendar month)
create table reports (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  status       text not null default 'draft' check (status in ('draft', 'ready', 'exported')),
  generated_by uuid references team_users(id),
  generated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(client_id, period_start)
);

-- One row per section_type per report; holds all four layers
-- ae_override wins over claude_narrative on client export if non-null
-- ae_internal_notes and ae_coaching are NEVER exported to client
create table report_sections (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references reports(id) on delete cascade,
  section_type      text not null check (section_type in (
                      'ga4_traffic', 'ga4_conversions',
                      'gsc_performance', 'gbp_performance',
                      'ghl_campaigns', 'recommendations'
                    )),
  raw_data          jsonb,     -- Layer 1: what happened (API pull)
  claude_findings   jsonb,     -- Layer 2: structured wins/concerns/opportunities/anomalies (Pass 1)
  claude_narrative  text,      -- Layer 3: client-facing prose default (Pass 2)
  ae_override       text,      -- Layer 3: AE edit; wins over claude_narrative on export
  ae_internal_notes text,      -- Internal only — never exported
  ae_coaching       text,      -- AE talking points, objection prep — never exported
  pass1_model       text,
  pass2_model       text,
  generated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(report_id, section_type)
);

-- Curated objection library; grows over time, matched during AE coaching generation
create table objection_library (
  id            uuid primary key default gen_random_uuid(),
  objection     text not null,
  response      text not null,
  tags          text[] default '{}',
  section_types text[] default '{}',
  created_by    uuid references team_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Industry benchmarks ("your CTR is top quartile for med spas")
create table benchmarks (
  id         uuid primary key default gen_random_uuid(),
  niche      text not null,
  metric     text not null,
  p25        numeric,
  p50        numeric,
  p75        numeric,
  p90        numeric,
  source     text,
  period     text,
  created_at timestamptz not null default now(),
  unique(niche, metric, period)
);

-- Sensitive action audit log
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references team_users(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

-- Enable RLS on all tables (service role key bypasses for server-side access;
-- RLS is defense-in-depth for a future client portal)
alter table team_users       enable row level security;
alter table oauth_accounts   enable row level security;
alter table clients          enable row level security;
alter table integrations     enable row level security;
alter table reports          enable row level security;
alter table report_sections  enable row level security;
alter table objection_library enable row level security;
alter table benchmarks       enable row level security;
alter table audit_log        enable row level security;

-- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger team_users_updated_at        before update on team_users        for each row execute function set_updated_at();
create trigger oauth_accounts_updated_at    before update on oauth_accounts    for each row execute function set_updated_at();
create trigger clients_updated_at           before update on clients           for each row execute function set_updated_at();
create trigger integrations_updated_at      before update on integrations      for each row execute function set_updated_at();
create trigger reports_updated_at           before update on reports           for each row execute function set_updated_at();
create trigger report_sections_updated_at   before update on report_sections   for each row execute function set_updated_at();
