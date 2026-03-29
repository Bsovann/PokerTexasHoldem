-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Enums
create type room_status as enum ('waiting', 'playing', 'finished');
create type round_type as enum ('preflop', 'flop', 'turn', 'river', 'showdown');
create type player_status as enum ('waiting', 'active', 'folded', 'all_in', 'out');

-- Rooms table
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(6) not null unique,
  status room_status not null default 'waiting',
  community_cards jsonb not null default '[]',
  deck jsonb not null default '[]',
  pot integer not null default 0,
  current_round round_type not null default 'preflop',
  current_player_seat integer not null default 0,
  dealer_seat integer not null default 0,
  small_blind integer not null default 10,
  big_blind integer not null default 20,
  min_raise integer not null default 20,
  created_at timestamptz not null default now()
);

-- Players table
create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname varchar(32) not null,
  seat_index integer not null,
  chips integer not null default 1000,
  hole_cards jsonb not null default '[]',
  current_bet integer not null default 0,
  total_bet_this_round integer not null default 0,
  status player_status not null default 'waiting',
  is_host boolean not null default false,
  session_token varchar(64) not null,
  created_at timestamptz not null default now(),
  unique(room_id, seat_index)
);

-- Indexes
create index players_room_id_idx on players(room_id);
create index rooms_code_idx on rooms(code);

-- Enable Row Level Security
alter table rooms enable row level security;
alter table players enable row level security;

-- RLS: rooms are readable by anyone (public game state)
create policy "rooms_select" on rooms for select using (true);
create policy "rooms_insert" on rooms for insert with check (true);
create policy "rooms_update" on rooms for update using (true);

-- RLS: players — all columns readable except hole_cards is restricted
-- We handle hole_cards privacy at the application layer by only querying
-- your own player row for hole_cards. All other columns are public.
create policy "players_select" on players for select using (true);
create policy "players_insert" on players for insert with check (true);
create policy "players_update" on players for update using (true);

-- Enable Realtime on both tables
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
