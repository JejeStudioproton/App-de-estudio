-- OPTIONAL FUTURE SCHEMA. The current front end does not connect to Supabase.
-- Apply only after configuring Auth, RLS and a proper migration process.
create extension if not exists pgcrypto;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  color text not null default '#6f8b7b',
  exam_date date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  explanation text not null default '',
  prompt text not null default '',
  answer text not null default '',
  application_prompt text not null default '',
  application_answer text not null default '',
  source jsonb,
  tags text[] not null default '{}',
  mastery numeric not null default 0 check (mastery between 0 and 1),
  memory_score numeric not null default 0 check (memory_score between 0 and 1),
  understanding_score numeric not null default 0 check (understanding_score between 0 and 1),
  application_score numeric not null default 0 check (application_score between 0 and 1),
  due_at timestamptz not null default now(),
  interval_days integer not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  method text not null check (method in ('active-recall','explanation','worked-example','multiple-choice','application')),
  skill text not null check (skill in ('memory','understanding','application')),
  rating smallint not null check (rating between 0 and 3),
  confidence numeric not null check (confidence between 0 and 1),
  answer_quality numeric not null check (answer_quality between 0 and 1),
  response_seconds integer not null default 0 check (response_seconds >= 0),
  hint_used boolean not null default false,
  error_tags text[] not null default '{}',
  note text,
  reviewed_at timestamptz not null default now()
);
create index if not exists concepts_user_due_idx on public.concepts(user_id, due_at);
create index if not exists concepts_subject_idx on public.concepts(subject_id);
create index if not exists reviews_user_date_idx on public.review_events(user_id, reviewed_at desc);
alter table public.subjects enable row level security;
alter table public.concepts enable row level security;
alter table public.review_events enable row level security;
create policy "users manage own subjects" on public.subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own concepts" on public.concepts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own reviews" on public.review_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
