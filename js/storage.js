// localStorage wrapper: sessions (with per-phase release flags) + candidates (upsert by examineeId) + settings
const Storage = (() => {
  const KEY_CAND = 'zemiSA.candidates.v1';
  const KEY_CFG  = 'zemiSA.config.v1';
  const KEY_SESS = 'zemiSA.sessions.v1';
  const KEY_CUR  = 'zemiSA.currentSession.v1';
  const DEFAULT_SESSION_ID = 's_default';
  const defaultPhases = { application: true, resume: true, academic: false, survey: false };
  const defaultCfg = { weightAcademic: 70, weightSurvey: 30 };

  // ---- Sessions ----
  function loadSessions() {
    let list;
    try { list = JSON.parse(localStorage.getItem(KEY_SESS)) || []; }
    catch (e) { list = []; }
    if (list.length === 0) {
      list = [{ id: DEFAULT_SESSION_ID, name: '通常入試', createdAt: new Date().toISOString(), phases: { ...defaultPhases } }];
      localStorage.setItem(KEY_SESS, JSON.stringify(list));
    }
    // Migration: ensure all have phases
    let changed = false;
    list.forEach(s => { if (!s.phases) { s.phases = { ...defaultPhases }; changed = true; } });
    if (changed) localStorage.setItem(KEY_SESS, JSON.stringify(list));
    return list;
  }
  function saveSessions(list) { localStorage.setItem(KEY_SESS, JSON.stringify(list)); }
  function generatePin() {
    // Avoid confusable characters (0/O/1/I)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
  // ユーザー独自デフォルト保存（面接評価項目）
  const KEY_DEFAULT_IV_RATINGS = 'zemiSA.defaultInterviewRatings.v1';
  function getDefaultInterviewRatings() {
    try { return JSON.parse(localStorage.getItem(KEY_DEFAULT_IV_RATINGS)) || null; }
    catch (e) { return null; }
  }
  function setDefaultInterviewRatings(ratings) {
    if (Array.isArray(ratings) && ratings.length > 0) {
      localStorage.setItem(KEY_DEFAULT_IV_RATINGS, JSON.stringify(ratings));
    } else {
      localStorage.removeItem(KEY_DEFAULT_IV_RATINGS);
    }
  }
  function generatePassword() {
    // 8 chars, mixed upper/lower/digits, confusable-safe
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
  function addSession(name, phases) {
    const list = loadSessions();
    const s = {
      id: 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      name: name || '新規試験回',
      createdAt: new Date().toISOString(),
      phases: phases ? { ...defaultPhases, ...phases } : { ...defaultPhases },
      pin: generatePin()
    };
    list.push(s);
    saveSessions(list);
    return s;
  }
  function regeneratePin(sessionId) {
    const list = loadSessions();
    const s = list.find(x => x.id === sessionId);
    if (s) { s.pin = generatePin(); saveSessions(list); return s.pin; }
    return null;
  }
  function renameSession(id, name) {
    const list = loadSessions();
    const s = list.find(x => x.id === id);
    if (s) { s.name = name; saveSessions(list); }
  }
  function setPhase(sessionId, phase, open) {
    const list = loadSessions();
    const s = list.find(x => x.id === sessionId);
    if (s) { s.phases = s.phases || { ...defaultPhases }; s.phases[phase] = !!open; saveSessions(list); }
  }
  function setPhaseSchedule(sessionId, phase, startsAt, endsAt) {
    const list = loadSessions();
    const s = list.find(x => x.id === sessionId);
    if (!s) return;
    s.phaseSchedule = s.phaseSchedule || {};
    s.phaseSchedule[phase] = { startsAt: startsAt || null, endsAt: endsAt || null };
    saveSessions(list);
  }
  // Effective open: manual ON AND (no start or now >= start) AND (no end or now < end + grace)
  function isPhaseOpen(session, phase, now) {
    if (!session || !session.phases) return false;
    if (!session.phases[phase]) return false;
    const sch = session.phaseSchedule?.[phase];
    if (!sch) return true;
    const t = (now || new Date()).getTime();
    if (sch.startsAt && t < new Date(sch.startsAt).getTime()) return false;
    if (sch.endsAt) {
      const graceMin = phase === 'academic' ? (session.academicTest?.graceMinutes ?? 0) : 0;
      if (t >= new Date(sch.endsAt).getTime() + graceMin * 60000) return false;
    }
    return true;
  }
  // 学力試験で「正規の終了時刻を過ぎたが猶予期間内」かどうか
  function isPhaseInGrace(session, phase, now) {
    if (phase !== 'academic') return false;
    const sch = session?.phaseSchedule?.[phase];
    if (!sch?.endsAt) return false;
    const t = (now || new Date()).getTime();
    return t >= new Date(sch.endsAt).getTime();
  }
  function phaseStatusText(session, phase) {
    if (!session?.phases?.[phase]) return '🔒 手動停止中';
    const sch = session.phaseSchedule?.[phase];
    if (!sch || (!sch.startsAt && !sch.endsAt)) return '✅ 受付中';
    const now = new Date();
    if (sch.startsAt && now < new Date(sch.startsAt)) return `⏳ ${fmtJ(sch.startsAt)} 開始予定`;
    if (sch.endsAt   && now >= new Date(sch.endsAt))  return `⛔ ${fmtJ(sch.endsAt)} 終了`;
    if (sch.endsAt)    return `✅ 受付中（${fmtJ(sch.endsAt)} まで）`;
    if (sch.startsAt)  return `✅ 受付中（${fmtJ(sch.startsAt)} から）`;
    return '✅ 受付中';
  }
  function fmtJ(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function removeSession(id) {
    let remaining = loadSessions().filter(s => s.id !== id);
    if (remaining.length === 0) remaining = [{ id: DEFAULT_SESSION_ID, name: '通常入試', createdAt: new Date().toISOString(), phases: { ...defaultPhases } }];
    saveSessions(remaining);
    save(load().filter(c => c.sessionId !== id));
    if (getCurrentSessionId() === id) setCurrentSessionId(remaining[0].id);
  }
  function getCurrentSessionId() {
    const cur = localStorage.getItem(KEY_CUR);
    const list = loadSessions();
    if (cur && list.some(s => s.id === cur)) return cur;
    return list[0].id;
  }
  function setCurrentSessionId(id) { localStorage.setItem(KEY_CUR, id); }
  function getCurrentSession() {
    return loadSessions().find(s => s.id === getCurrentSessionId());
  }

  // ---- Candidates ----
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY_CAND)) || []; }
    catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(KEY_CAND, JSON.stringify(list)); }

  function loadForSession(sessionId) {
    const sid = sessionId || getCurrentSessionId();
    const all = load();
    let migrated = false;
    all.forEach(c => { if (!c.sessionId) { c.sessionId = DEFAULT_SESSION_ID; migrated = true; } });
    if (migrated) save(all);
    return all.filter(c => c.sessionId === sid);
  }

  function findByExamineeId(sessionId, examineeId) {
    if (!examineeId) return null;
    const sid = sessionId || getCurrentSessionId();
    return load().find(c => c.sessionId === sid && (c.examineeId || '').toLowerCase() === String(examineeId).toLowerCase()) || null;
  }

  // Upsert: merge partial fields keyed by examineeId within sessionId
  function upsert(partial) {
    const list = load();
    const sid = partial.sessionId || getCurrentSessionId();
    partial.sessionId = sid;
    const idx = list.findIndex(c => c.sessionId === sid && (c.examineeId || '').toLowerCase() === String(partial.examineeId || '').toLowerCase());
    if (idx >= 0) {
      const merged = Object.assign({}, list[idx], partial);
      if (!merged.password) merged.password = generatePassword();
      list[idx] = merged;
      save(list);
      return merged;
    } else {
      const rec = Object.assign({
        id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        createdAt: new Date().toISOString(),
        password: generatePassword()
      }, partial);
      if (!rec.password) rec.password = generatePassword();
      list.push(rec);
      save(list);
      return rec;
    }
  }
  function regenerateCandidatePassword(candId) {
    const list = load();
    const c = list.find(x => x.id === candId);
    if (c) { c.password = generatePassword(); save(list); return c.password; }
    return null;
  }

  function remove(id) { save(load().filter(c => c.id !== id)); }
  function clearAll() {
    const sid = getCurrentSessionId();
    save(load().filter(c => c.sessionId !== sid));
  }

  function loadCfg() {
    try { return Object.assign({}, defaultCfg, JSON.parse(localStorage.getItem(KEY_CFG)) || {}); }
    catch (e) { return Object.assign({}, defaultCfg); }
  }
  function saveCfg(cfg) { localStorage.setItem(KEY_CFG, JSON.stringify(cfg)); }

  return {
    load, save, loadForSession, findByExamineeId, upsert, remove, clearAll, regenerateCandidatePassword, generatePassword,
    getDefaultInterviewRatings, setDefaultInterviewRatings,
    loadCfg, saveCfg,
    loadSessions, addSession, renameSession, setPhase, setPhaseSchedule, isPhaseOpen, isPhaseInGrace, phaseStatusText, removeSession, regeneratePin, generatePin,
    getCurrentSessionId, setCurrentSessionId, getCurrentSession,
    DEFAULT_SESSION_ID
  };
})();
