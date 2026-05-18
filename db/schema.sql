-- ============================================================================
-- ゼミ試験アプリケーション Supabase スキーマ
-- Supabase SQL Editor で実行してください (rls.sql の前に)
-- ============================================================================

-- ----- 拡張機能 -----
create extension if not exists "pgcrypto";

-- ----- 管理者プロフィール (auth.users への参照) -----
create table if not exists public.admins (
  id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

comment on table public.admins is '管理者ユーザー。Supabase Auth のユーザーIDと1対1。';

-- ----- 試験回 (session) -----
create table if not exists public.sessions (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  phases jsonb not null default '{"application":true,"resume":true,"academic":false,"survey":false}'::jsonb,
  phase_schedule jsonb default '{}'::jsonb,
  pin text,
  passcode text,
  academic_test jsonb,
  survey_test jsonb,
  interview_ratings jsonb,
  faculty_dept jsonb,
  resume_fields jsonb,
  msg_template text,
  owner_admin uuid references public.admins(id) on delete set null,
  -- 基本情報 (2026-05-18 追加)
  exam_date date,
  exam_location text,
  target_pass_count integer,
  notes text
);

-- 既存環境向け migration（idempotent）
alter table public.sessions add column if not exists exam_date date;
alter table public.sessions add column if not exists exam_location text;
alter table public.sessions add column if not exists target_pass_count integer;
alter table public.sessions add column if not exists notes text;

comment on table public.sessions is '試験回（入試の各回）。1管理者が複数保持。';

-- ----- 受験者 -----
create table if not exists public.candidates (
  id text primary key,
  session_id text not null references public.sessions(id) on delete cascade,
  examinee_id text not null,
  password text not null,
  -- 基本情報
  first_name text,
  last_name text,
  first_name_kana text,
  last_name_kana text,
  gender text,
  faculty text,
  department text,
  year text,
  email text,
  phone text,
  address text,
  -- リッチ情報
  qualifications jsonb default '[]'::jsonb,
  photo text,
  history jsonb default '[]'::jsonb,
  motivation text,
  custom_resume jsonb default '{}'::jsonb,
  -- 提出記録
  application_submitted_at timestamptz,
  resume_submitted_at timestamptz,
  academic_submitted_at timestamptz,
  survey_submitted_at timestamptz,
  academic_answers jsonb default '{}'::jsonb,
  survey_answers jsonb default '{}'::jsonb,
  -- 面接
  interview jsonb default '{"records":[]}'::jsonb,
  -- 結果
  passed boolean default false,
  pass_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, examinee_id)
);

comment on table public.candidates is '受験者。session_id × examinee_id で一意。';

-- ----- ユーザー設定 (管理者の個人デフォルト) -----
create table if not exists public.admin_prefs (
  admin_id uuid primary key references public.admins(id) on delete cascade,
  default_interview_ratings jsonb,
  ui_state jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ----- 更新時刻 自動更新 -----
create or replace function public.tg_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_candidates_updated_at on public.candidates;
create trigger set_candidates_updated_at before update on public.candidates
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_admin_prefs_updated_at on public.admin_prefs;
create trigger set_admin_prefs_updated_at before update on public.admin_prefs
  for each row execute function public.tg_set_updated_at();

-- ----- 受験者認証ヘルパー (URL + 8桁パスワード) -----
-- 受験者は Supabase Auth ユーザーを持たない。代わりに RPC でパスワード照合し、
-- 短期の anon セッションを RLS の jwt claim 'cand_id' で識別する。
-- (実装は Phase 6 以降)

create or replace function public.verify_candidate(p_cand_id text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  select (c.password = p_password) into ok
  from public.candidates c
  where c.id = p_cand_id;
  return coalesce(ok, false);
end;
$$;

comment on function public.verify_candidate is '受験者ID + 8桁パスワードの照合 (定数時間比較ではないので将来 bcrypt 化推奨)';

-- ----- インデックス -----
create index if not exists idx_candidates_session on public.candidates(session_id);
create index if not exists idx_candidates_passed on public.candidates(session_id, passed);
create index if not exists idx_sessions_owner on public.sessions(owner_admin);
