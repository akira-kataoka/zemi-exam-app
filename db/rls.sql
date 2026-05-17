-- ============================================================================
-- RLS (Row Level Security) ポリシー
-- schema.sql 実行後に実行してください
-- ============================================================================

-- ----- RLS 有効化 -----
alter table public.admins        enable row level security;
alter table public.sessions      enable row level security;
alter table public.candidates    enable row level security;
alter table public.admin_prefs   enable row level security;

-- ----- ヘルパー: 現在のユーザーが管理者か -----
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.admins a
    where a.id = auth.uid()
  );
$$;

-- ----- ヘルパー: JWT に埋め込んだ受験者ID (Phase 6 で発行) -----
create or replace function public.current_candidate_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'cand_id', '');
$$;

-- ============================================================================
-- admins テーブル
-- ============================================================================
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists admins_insert on public.admins;
create policy admins_insert on public.admins for insert
  with check (id = auth.uid());  -- 新規管理者は自分自身のレコードのみ作成可

drop policy if exists admins_update on public.admins;
create policy admins_update on public.admins for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================================
-- sessions テーブル
-- ============================================================================
drop policy if exists sessions_admin_all on public.sessions;
create policy sessions_admin_all on public.sessions for all
  using (public.is_admin()) with check (public.is_admin());

-- 受験者: 自分が登録された session のみ参照可 (フェーズ・テスト問題などを取得するため)
drop policy if exists sessions_candidate_select on public.sessions;
create policy sessions_candidate_select on public.sessions for select
  using (
    public.current_candidate_id() is not null
    and id = (select session_id from public.candidates where id = public.current_candidate_id())
  );

-- ============================================================================
-- candidates テーブル
-- ============================================================================
-- 管理者: 全件 CRUD
drop policy if exists candidates_admin_all on public.candidates;
create policy candidates_admin_all on public.candidates for all
  using (public.is_admin()) with check (public.is_admin());

-- 受験者: 自分の行のみ select/update
drop policy if exists candidates_self_select on public.candidates;
create policy candidates_self_select on public.candidates for select
  using (id = public.current_candidate_id());

drop policy if exists candidates_self_update on public.candidates;
create policy candidates_self_update on public.candidates for update
  using (id = public.current_candidate_id())
  with check (
    id = public.current_candidate_id()
    -- 受験者は session_id, examinee_id, password, passed, pass_reason を変更不可
    and session_id = (select session_id from public.candidates where id = public.current_candidate_id())
    and examinee_id = (select examinee_id from public.candidates where id = public.current_candidate_id())
    and passed = (select passed from public.candidates where id = public.current_candidate_id())
  );

-- ============================================================================
-- admin_prefs テーブル
-- ============================================================================
drop policy if exists admin_prefs_self_all on public.admin_prefs;
create policy admin_prefs_self_all on public.admin_prefs for all
  using (admin_id = auth.uid()) with check (admin_id = auth.uid());
