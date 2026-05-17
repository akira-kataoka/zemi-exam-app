// Supabase クライアント初期化 + 認証状態管理
// 無料枠で運用するため Storage / Edge Functions は使わない (詳細は SUPABASE_SETUP.md)
//
// セットアップ未完了 (URL が placeholder のまま) のときは localStorage モードで動作するフォールバックを提供。
// これにより既存 UI が壊れず、Supabase 接続後に段階的に切替可能。

const SupabaseClient = (() => {
  // ===== 接続情報 (Supabase Settings → API からコピー) =====
  // ※ anon キーは公開可。RLS でデータが保護されます。
  const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co'; // ← 自分のプロジェクトURLに置換
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';                     // ← anon public キーに置換

  let _client = null;
  let _ready = false;
  let _mode = 'local'; // 'local' | 'supabase'

  function isConfigured() {
    return SUPABASE_URL && !SUPABASE_URL.includes('YOUR_PROJECT')
        && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');
  }

  function init() {
    if (_ready) return _client;
    if (!isConfigured()) {
      console.info('[Supabase] 未設定のため localStorage モードで動作します (SUPABASE_SETUP.md 参照)');
      _mode = 'local';
      _ready = true;
      return null;
    }
    if (typeof window.supabase === 'undefined') {
      console.warn('[Supabase] SDK 未ロード。index.html の CDN タグを確認してください');
      _mode = 'local';
      _ready = true;
      return null;
    }
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    _mode = 'supabase';
    _ready = true;
    return _client;
  }

  function getClient() { if (!_ready) init(); return _client; }
  function getMode()   { if (!_ready) init(); return _mode; }

  // ===== Auth (管理者) =====
  async function signInAdmin(email, password) {
    const c = getClient();
    if (!c) throw new Error('Supabase 未設定');
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }
  async function signOut() {
    const c = getClient();
    if (!c) return;
    await c.auth.signOut();
  }
  async function getSession() {
    const c = getClient();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    return data?.session || null;
  }
  async function isAdmin() {
    const s = await getSession();
    if (!s) return false;
    const c = getClient();
    const { data, error } = await c.from('admins').select('id').eq('id', s.user.id).maybeSingle();
    return !error && !!data;
  }
  function onAuthChange(cb) {
    const c = getClient();
    if (!c) return () => {};
    const { data } = c.auth.onAuthStateChange((_event, session) => cb(session));
    return () => data?.subscription?.unsubscribe();
  }

  // ===== Auth (受験者: URL + パスワード) =====
  // Phase 6 で実装予定。verify_candidate RPC でパスワード照合 → 短期 JWT 発行 (cand_id claim)
  async function signInCandidate(candId, password) {
    const c = getClient();
    if (!c) throw new Error('Supabase 未設定');
    const { data, error } = await c.rpc('verify_candidate', { p_cand_id: candId, p_password: password });
    if (error) throw error;
    if (!data) throw new Error('受験番号またはパスワードが違います');
    // TODO: anon サインイン + cand_id claim 注入 (要 Edge Function or 別RPC)
    // 現状は照合のみ。実セッションは Phase 6 で実装
    return true;
  }

  return {
    init, getClient, getMode, isConfigured,
    signInAdmin, signOut, getSession, isAdmin, onAuthChange,
    signInCandidate
  };
})();
