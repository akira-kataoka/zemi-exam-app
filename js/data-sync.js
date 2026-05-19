// localStorage ↔ Supabase 双方向同期レイヤー
// - 管理者ログイン時: Supabase が空なら localStorage を一括 push、データありなら pull で上書き
// - 通常操作中: Storage.save / Storage.upsert / Storage.saveSessions などをラップして Supabase へ write-through
// - 受験者モード時: 自分の行のみ Supabase 直接更新 (RLS でガード)
//
// Supabase 未設定なら何もしない (localStorage モードを維持)

const DataSync = (() => {
  let _enabled = false;
  let _adminLoggedIn = false;
  let _syncing = false;

  // ===== カラム変換 (キャメル → スネーク) =====
  function candToRow(c) {
    return {
      id: c.id,
      session_id: c.sessionId,
      examinee_id: c.examineeId,
      password: c.password,
      first_name: c.firstName,
      last_name: c.lastName,
      first_name_kana: c.firstKana,
      last_name_kana: c.lastKana,
      gender: c.gender,
      faculty: c.faculty,
      department: c.department,
      year: c.year,
      email: c.email,
      phone: c.phone,
      address: c.address,
      qualifications: c.qualifications || [],
      photo: c.photo || null,
      history: c.history || [],
      motivation: c.motivation,
      custom_resume: c.customResume || {},
      application_submitted_at: c.applicationSubmittedAt || null,
      resume_submitted_at: c.resumeSubmittedAt || null,
      academic_submitted_at: c.academicSubmittedAt || null,
      survey_submitted_at: c.surveySubmittedAt || null,
      academic_answers: c.academicAnswers || {},
      survey_answers: c.surveyAnswers || {},
      interview: c.interview || { records: [] },
      passed: !!c.passed,
      pass_reason: c.passReason || null
    };
  }
  function rowToCand(r) {
    return {
      id: r.id,
      sessionId: r.session_id,
      examineeId: r.examinee_id,
      password: r.password,
      firstName: r.first_name,
      lastName: r.last_name,
      firstKana: r.first_name_kana,
      lastKana: r.last_name_kana,
      gender: r.gender,
      faculty: r.faculty,
      department: r.department,
      year: r.year,
      email: r.email,
      phone: r.phone,
      address: r.address,
      qualifications: r.qualifications || [],
      photo: r.photo,
      history: r.history || [],
      motivation: r.motivation,
      customResume: r.custom_resume || {},
      applicationSubmittedAt: r.application_submitted_at,
      resumeSubmittedAt: r.resume_submitted_at,
      academicSubmittedAt: r.academic_submitted_at,
      surveySubmittedAt: r.survey_submitted_at,
      academicAnswers: r.academic_answers || {},
      surveyAnswers: r.survey_answers || {},
      interview: r.interview || { records: [] },
      passed: !!r.passed,
      passReason: r.pass_reason,
      createdAt: r.created_at
    };
  }
  function sessToRow(s) {
    return {
      id: s.id,
      name: s.name,
      phases: s.phases || {},
      phase_schedule: s.phaseSchedule || {},
      pin: s.pin || null,
      passcode: s.passcode || null,
      academic_test: s.academicTest || null,
      survey_test: s.surveyTest || null,
      interview_ratings: s.interviewRatings || null,
      faculty_dept: s.facultyDept || null,
      resume_fields: s.resumeFields || null,
      msg_template: s.msgTemplate || null,
      // 基本情報 (2026-05-18 追加)
      exam_date: s.examDate || null,
      exam_location: s.examLocation || null,
      target_pass_count: (s.targetPassCount == null || s.targetPassCount === '') ? null : Number(s.targetPassCount),
      notes: s.notes || null
    };
  }
  function rowToSess(r) {
    return {
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      phases: r.phases || {},
      phaseSchedule: r.phase_schedule || {},
      pin: r.pin,
      passcode: r.passcode,
      academicTest: r.academic_test,
      surveyTest: r.survey_test,
      interviewRatings: r.interview_ratings,
      facultyDept: r.faculty_dept,
      resumeFields: r.resume_fields,
      msgTemplate: r.msg_template,
      examDate: r.exam_date || '',
      examLocation: r.exam_location || '',
      targetPassCount: r.target_pass_count,
      notes: r.notes || ''
    };
  }

  // ===== 同期処理 =====
  async function fullPullFromSupabase() {
    const c = SupabaseClient.getClient();
    if (!c) return;
    _syncing = true;
    try {
      const { data: sessions } = await c.from('sessions').select('*');
      const { data: candidates } = await c.from('candidates').select('*');
      if (sessions) localStorage.setItem('zemiSA.sessions.v1', JSON.stringify(sessions.map(rowToSess)));
      if (candidates) localStorage.setItem('zemiSA.candidates.v1', JSON.stringify(candidates.map(rowToCand)));
      console.info(`[DataSync] Pulled ${sessions?.length || 0} sessions, ${candidates?.length || 0} candidates`);
    } finally { _syncing = false; }
  }
  async function fullPushToSupabase() {
    const c = SupabaseClient.getClient();
    if (!c) return;
    _syncing = true;
    try {
      const sessions = Storage.loadSessions();
      const candidates = Storage.load();
      if (sessions.length > 0) {
        const { error } = await c.from('sessions').upsert(sessions.map(sessToRow));
        if (error) throw error;
      }
      if (candidates.length > 0) {
        const { error } = await c.from('candidates').upsert(candidates.map(candToRow));
        if (error) throw error;
      }
      console.info(`[DataSync] Pushed ${sessions.length} sessions, ${candidates.length} candidates`);
    } finally { _syncing = false; }
  }

  async function syncOnLogin() {
    if (_syncing) return;
    const c = SupabaseClient.getClient();
    if (!c) return;
    try {
      const { count } = await c.from('sessions').select('id', { count: 'exact', head: true });
      if ((count || 0) === 0) {
        // Cloud empty → push local
        await fullPushToSupabase();
      } else {
        // Cloud has data → pull to local
        await fullPullFromSupabase();
      }
    } catch (e) {
      console.warn('[DataSync] Sync on login failed:', e?.message || e);
    }
  }

  async function pushCandidate(cand) {
    if (!_adminLoggedIn || _syncing) return;
    const c = SupabaseClient.getClient();
    if (!c || !cand?.id) return;
    try {
      const { error } = await c.from('candidates').upsert(candToRow(cand));
      if (error) console.warn('[DataSync] candidate upsert failed:', error.message);
    } catch (e) { console.warn('[DataSync] candidate upsert error:', e); }
  }
  async function pushSession(sess) {
    if (!_adminLoggedIn || _syncing) return;
    const c = SupabaseClient.getClient();
    if (!c || !sess?.id) return;
    try {
      const { error } = await c.from('sessions').upsert(sessToRow(sess));
      if (error) console.warn('[DataSync] session upsert failed:', error.message);
    } catch (e) { console.warn('[DataSync] session upsert error:', e); }
  }
  async function deleteCandidate(id) {
    if (!_adminLoggedIn || _syncing) return;
    const c = SupabaseClient.getClient();
    if (!c) return;
    try { await c.from('candidates').delete().eq('id', id); }
    catch (e) { console.warn('[DataSync] candidate delete error:', e); }
  }
  async function deleteSession(id) {
    if (!_adminLoggedIn || _syncing) return;
    const c = SupabaseClient.getClient();
    if (!c) return;
    try { await c.from('sessions').delete().eq('id', id); }
    catch (e) { console.warn('[DataSync] session delete error:', e); }
  }

  // ===== Storage モンキーパッチ (write-through) =====
  function attachStorageHooks() {
    if (typeof Storage === 'undefined') return;
    const origUpsert = Storage.upsert;
    Storage.upsert = function (partial) {
      const result = origUpsert.call(Storage, partial);
      pushCandidate(result);
      return result;
    };
    const origRemove = Storage.remove;
    Storage.remove = function (id) {
      deleteCandidate(id);
      return origRemove.call(Storage, id);
    };
    // Sessions
    const origAddSession = Storage.addSession;
    Storage.addSession = function (name, phases) {
      const s = origAddSession.call(Storage, name, phases);
      pushSession(s);
      return s;
    };
    const origRenameSession = Storage.renameSession;
    Storage.renameSession = function (id, name) {
      origRenameSession.call(Storage, id, name);
      const s = Storage.loadSessions().find(x => x.id === id);
      if (s) pushSession(s);
    };
    const origRemoveSession = Storage.removeSession;
    Storage.removeSession = function (id) {
      deleteSession(id);
      return origRemoveSession.call(Storage, id);
    };
    // フェーズ開閉・スケジュール・PIN/PW 再発行も漏れなく同期
    ['setPhase', 'setPhaseSchedule', 'regeneratePin'].forEach(fn => {
      const orig = Storage[fn];
      if (!orig) return;
      Storage[fn] = function (sessionId, ...rest) {
        const ret = orig.call(Storage, sessionId, ...rest);
        const s = Storage.loadSessions().find(x => x.id === sessionId);
        if (s) pushSession(s);
        return ret;
      };
    });
    const origRegenPw = Storage.regenerateCandidatePassword;
    if (origRegenPw) {
      Storage.regenerateCandidatePassword = function (candId) {
        const ret = origRegenPw.call(Storage, candId);
        const c = Storage.load().find(x => x.id === candId);
        if (c) pushCandidate(c);
        return ret;
      };
    }
    // Storage.saveSessions(list) (試験設定編集・問題編集・猶予時間変更等) も差分push
    const origSaveSessions = Storage.saveSessions;
    let _prevSessSnap = JSON.stringify(Storage.loadSessions());
    if (origSaveSessions) {
      Storage.saveSessions = function (list) {
        const ret = origSaveSessions.call(Storage, list);
        if (!_adminLoggedIn) return ret;
        try {
          const prev = JSON.parse(_prevSessSnap);
          const prevById = new Map(prev.map(s => [s.id, JSON.stringify(s)]));
          list.forEach(s => { if (prevById.get(s.id) !== JSON.stringify(s)) pushSession(s); });
        } catch (e) { /* noop */ }
        _prevSessSnap = JSON.stringify(list);
        return ret;
      };
    }
    // Storage.save(list) 直接呼び出し (合格チェック・面接記録編集等) も差分push/delete
    const origSave = Storage.save;
    let _prevSnap = JSON.stringify(Storage.load());
    Storage.save = function (list) {
      const ret = origSave.call(Storage, list);
      if (!_adminLoggedIn) return ret;
      try {
        const prev = JSON.parse(_prevSnap);
        const prevById = new Map(prev.map(c => [c.id, JSON.stringify(c)]));
        const newIds = new Set(list.map(c => c.id));
        list.forEach(c => { if (prevById.get(c.id) !== JSON.stringify(c)) pushCandidate(c); });
        // 削除(clearAll/remove経由)も同期
        prev.forEach(c => { if (!newIds.has(c.id)) deleteCandidate(c.id); });
      } catch (e) { /* noop */ }
      _prevSnap = JSON.stringify(list);
      return ret;
    };
  }

  function init() {
    if (typeof SupabaseClient === 'undefined' || !SupabaseClient.isConfigured()) return;
    SupabaseClient.init();
    _enabled = true;
    attachStorageHooks();

    SupabaseClient.onAuthChange(async session => {
      const wasLoggedIn = _adminLoggedIn;
      _adminLoggedIn = !!session;
      if (_adminLoggedIn && !wasLoggedIn) {
        const adm = await SupabaseClient.isAdmin();
        if (adm) await syncOnLogin();
      }
    });
    // 初期化時に既存セッション復元
    SupabaseClient.getSession().then(async session => {
      if (session) {
        _adminLoggedIn = true;
        const adm = await SupabaseClient.isAdmin();
        if (adm) await syncOnLogin();
      }
    });
  }

  return {
    init, fullPushToSupabase, fullPullFromSupabase,
    isEnabled: () => _enabled,
    isAdminLoggedIn: () => _adminLoggedIn
  };
})();
