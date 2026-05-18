// =========================================================
// ゼミ選抜アナライザー v2.0
// =========================================================
const App = (() => {

  const charts = {};
  const PHASE_LABEL = { application: '受験申込', resume: '履歴書', academic: '学力試験', survey: 'アンケート', interview: '面接' };

  // ===== UI state persistence (active tab / subview / profile / filters / sort) =====
  const UI_KEY = 'zemiSA.uiState.v1';
  let _uiState = (() => {
    try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; }
  })();
  function saveUiState(patch) {
    Object.assign(_uiState, patch);
    try { localStorage.setItem(UI_KEY, JSON.stringify(_uiState)); } catch (e) {}
  }

  // ===== Auto-save status indicator =====
  function showAutoSaveStatus(state) {
    let el = document.getElementById('autosave-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'autosave-indicator';
      el.className = 'autosave-indicator';
      document.body.appendChild(el);
    }
    if (state === 'saving') { el.textContent = '💾 保存中...'; el.className = 'autosave-indicator saving'; }
    else if (state === 'saved') {
      el.textContent = '✓ 保存しました';
      el.className = 'autosave-indicator saved';
      setTimeout(() => { el.className = 'autosave-indicator hidden'; }, 1500);
    }
  }

  // ===== Toast notification =====
  function toast(message, type = 'info', durationMs = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = message;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, durationMs);
  }

  // ===== Theme-aware chart palette =====
  function isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }
  function chartPalette() {
    if (isDarkTheme()) {
      return {
        text: '#e2e8f0',         // ticks/labels
        textMute: '#cbd5e1',
        grid: 'rgba(226,232,240,.18)',
        angle: 'rgba(226,232,240,.28)',
        ticksBg: 'rgba(15,23,42,.85)'
      };
    }
    return {
      text: '#334155',
      textMute: '#475569',
      grid: 'rgba(15,23,42,.08)',
      angle: 'rgba(15,23,42,.18)',
      ticksBg: 'rgba(255,255,255,.85)'
    };
  }
  function radarChartOptions(maxV, stepV) {
    const p = chartPalette();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: p.text, font: { size: 11 } } },
        tooltip: {}
      },
      scales: {
        r: {
          min: 0,
          max: maxV,
          ticks: { stepSize: stepV, color: p.textMute, backdropColor: p.ticksBg, font: { size: 10 } },
          grid: { color: p.grid },
          angleLines: { color: p.angle },
          pointLabels: { color: p.text, font: { size: 11 }, padding: 8 }
        }
      }
    };
  }
  function barLineChartOptions(opts = {}) {
    const p = chartPalette();
    const base = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: opts.legend !== false, labels: { color: p.text } },
        tooltip: {}
      },
      scales: {
        x: { ticks: { color: p.textMute }, grid: { color: p.grid } },
        y: { beginAtZero: true, ticks: { stepSize: 1, color: p.textMute }, grid: { color: p.grid } }
      }
    };
    return base;
  }

  // ===== Helpers =====
  function $(s, root = document) { return root.querySelector(s); }
  function $$(s, root = document) { return Array.from(root.querySelectorAll(s)); }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toLocalInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function localInputToIso(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function calcAge(birthdate) {
    if (!birthdate) return null;
    const d = new Date(birthdate);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
  }
  function formatDateShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function truncateLabel(s, n) {
    s = String(s ?? '');
    // モバイル時はさらに短くする（ラベル突き抜け対策）
    const isNarrow = (typeof window !== 'undefined') && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    const eff = isNarrow ? Math.max(4, Math.floor(n * 0.7)) : n;
    return s.length > eff ? s.slice(0, eff - 1) + '…' : s;
  }
  function formatDateOnly(ymd) {
    if (!ymd) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      const [y, m, d] = ymd.split('-');
      return `${y}/${Number(m)}/${Number(d)}`;
    }
    const d = new Date(ymd);
    if (isNaN(d.getTime())) return ymd;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
  function formatRelative(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const sec = Math.round(diff / 1000);
    if (sec < 0) {
      // future
      const f = Math.abs(sec);
      if (f < 3600) return `${Math.round(f / 60)}分後`;
      if (f < 86400) return `${Math.round(f / 3600)}時間後`;
      return `${Math.round(f / 86400)}日後`;
    }
    if (sec < 60) return 'たった今';
    if (sec < 3600) return `${Math.floor(sec / 60)}分前`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}時間前`;
    if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}日前`;
    if (sec < 86400 * 30) return `${Math.floor(sec / (86400 * 7))}週間前`;
    if (sec < 86400 * 365) return `${Math.floor(sec / (86400 * 30))}ヶ月前`;
    return `${Math.floor(sec / (86400 * 365))}年前`;
  }
  function fullName(c) {
    if (c.lastName || c.firstName) return [(c.lastName || ''), (c.firstName || '')].join(' ').trim();
    return c.name || '';
  }
  function fullKana(c) {
    if (c.lastKana || c.firstKana) return [(c.lastKana || ''), (c.firstKana || '')].join(' ').trim();
    return c.kana || '';
  }
  function getSession() { return Storage.getCurrentSession(); }
  function ensureTests(sess) {
    // Initialize default tests if missing (idempotent)
    let changed = false;
    if (!sess.academicTest || !Array.isArray(sess.academicTest.questions)) {
      sess.academicTest = { questions: DEFAULT_ACADEMIC_QUESTIONS.map(q => ({ ...q })), graceMinutes: 5 };
      changed = true;
    }
    if (sess.academicTest && sess.academicTest.graceMinutes === undefined) {
      sess.academicTest.graceMinutes = 5;
      changed = true;
    }
    if (!sess.surveyTest || !Array.isArray(sess.surveyTest.questions)) {
      sess.surveyTest = { questions: DEFAULT_SURVEY_QUESTIONS.map(q => ({ ...q })) };
      changed = true;
    }
    if (!sess.resumeExtraFields) { sess.resumeExtraFields = []; changed = true; }
    if (!sess.facultyDept) { sess.facultyDept = JSON.parse(JSON.stringify(Stats.DEFAULT_FACULTY_DEPT)); changed = true; }
    if (!sess.pin) { sess.pin = Storage.generatePin(); changed = true; }
    if (!sess.phaseSchedule) { sess.phaseSchedule = { application:{startsAt:null,endsAt:null}, resume:{startsAt:null,endsAt:null}, academic:{startsAt:null,endsAt:null}, survey:{startsAt:null,endsAt:null} }; changed = true; }
    if (sess.phaseSchedule && !sess.phaseSchedule.application) { sess.phaseSchedule.application = {startsAt:null,endsAt:null}; changed = true; }
    // Migrate sessions created before application phase
    if (sess.phases && sess.phases.application === undefined) { sess.phases.application = true; changed = true; }
    if (sess.applicationPasscode === undefined) { sess.applicationPasscode = ''; changed = true; }
    if (!sess.interviewRatings) {
      const userDefault = Storage.getDefaultInterviewRatings();
      sess.interviewRatings = (userDefault && userDefault.length > 0)
        ? userDefault.map(r => ({ ...r }))
        : Stats.INTERVIEW_RATINGS.map(r => ({ ...r }));
      changed = true;
    }
    if (!sess.messageTemplate) {
      sess.messageTemplate = `{{name}}さん

ゼミ入試のご案内です。下記の専用URLから各試験にアクセスしてください。

▼受験者情報
受験番号: {{examineeId}}
パスワード: {{password}}

▼履歴書
{{url_resume}}

▼学力試験
{{url_academic}}

▼アンケート
{{url_survey}}

▼面接予定
{{interview_datetime}}

ご不明な点は事務局までお問い合わせください。`;
      changed = true;
    }
    if (!sess.interviewSchedule) {
      const today = new Date(); today.setDate(today.getDate() + 1);
      sess.interviewSchedule = {
        startDate: today.toISOString().slice(0, 10),
        days: 1,
        dailyStart: '09:00',
        dailyEnd: '17:00',
        slotMinutes: 30,
        breakStart: '12:00',
        breakEnd: '13:00'
      };
      changed = true;
    }
    if (changed) {
      const list = Storage.loadSessions();
      const idx = list.findIndex(s => s.id === sess.id);
      if (idx >= 0) { list[idx] = sess; Storage.saveSessions(list); }
    }
    return sess;
  }

  // ===== Session bar =====
  function renderSessionBar() {
    const sess = ensureTests(getSession());
    const sessions = Storage.loadSessions();
    const sel = $('#session-select');
    sel.innerHTML = sessions.map(s => `<option value="${s.id}" ${s.id === sess.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    // editable session name
    const nameInput = $('#session-name-input');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = sess.name;
    const list = Storage.loadForSession();
    $('#session-meta').textContent = `${list.length}名 / 作成 ${formatDate(sess.createdAt)}`;
    // basic info chips (試験日 / 試験場所 / 目標合格人数)
    const chips = $('#session-info-chips');
    if (chips) {
      const parts = [];
      if (sess.examDate)      parts.push(`<span class="sess-chip">📅 ${escapeHtml(formatDateOnly(sess.examDate))}</span>`);
      if (sess.examLocation)  parts.push(`<span class="sess-chip">📍 ${escapeHtml(sess.examLocation)}</span>`);
      if (sess.targetPassCount != null && sess.targetPassCount !== '')
                              parts.push(`<span class="sess-chip">🎯 目標 ${escapeHtml(String(sess.targetPassCount))}名</span>`);
      if (sess.notes)         parts.push(`<span class="sess-chip" title="${escapeHtml(sess.notes)}">📝 備考あり</span>`);
      chips.innerHTML = parts.length ? parts.join('') : '<span class="sess-chip muted-chip">基本情報未設定（設定 → 試験回情報）</span>';
    }
    ['application', 'resume', 'academic', 'survey'].forEach(p => {
      const el = document.querySelector(`[data-phase-state="${p}"]`);
      if (!el) return;
      const open = Storage.isPhaseOpen(sess, p);
      el.textContent = open ? '受付中' : '停止';
      el.parentElement.classList.toggle('open', open);
      el.parentElement.classList.toggle('closed', !open);
    });
    // sync toggle checkboxes + datetime inputs (if admin view rendered)
    $$('[data-phase-toggle]').forEach(cb => { cb.checked = !!sess.phases?.[cb.dataset.phaseToggle]; });
    $$('[data-phase-start]').forEach(inp => {
      const v = sess.phaseSchedule?.[inp.dataset.phaseStart]?.startsAt;
      inp.value = v ? toLocalInputValue(v) : '';
    });
    $$('[data-phase-end]').forEach(inp => {
      const v = sess.phaseSchedule?.[inp.dataset.phaseEnd]?.endsAt;
      inp.value = v ? toLocalInputValue(v) : '';
    });
    $$('[data-phase-status]').forEach(el => {
      el.textContent = Storage.phaseStatusText(sess, el.dataset.phaseStatus);
      el.classList.toggle('s-open', Storage.isPhaseOpen(sess, el.dataset.phaseStatus));
    });
  }
  // ===== Session picker popover (search + switch + inline edit) =====
  function toggleSessionPopover() {
    const pop = $('#session-popover');
    if (pop.style.display === 'none') {
      pop.style.display = 'block';
      $('#session-popover-search').value = '';
      renderSessionPopoverList();
      setTimeout(() => $('#session-popover-search').focus(), 0);
    } else closeSessionPopover();
  }
  function closeSessionPopover() { $('#session-popover').style.display = 'none'; }
  function renderSessionPopoverList() {
    const q = ($('#session-popover-search').value || '').trim().toLowerCase();
    const curId = Storage.getCurrentSessionId();
    let sessions = Storage.loadSessions();
    if (q) sessions = sessions.filter(s => (s.name || '').toLowerCase().includes(q));
    const wrap = $('#session-popover-list');
    wrap.innerHTML = sessions.length ? sessions.map(s => {
      const count = Storage.loadForSession(s.id).length;
      const isCurrent = s.id === curId;
      return `<div class="session-popover-item ${isCurrent ? 'current' : ''}" data-id="${s.id}">
        <button class="sp-pick" data-pick="${s.id}" title="この試験回に切り替え">
          ${isCurrent ? '●' : '○'}
          <span class="sp-name">${escapeHtml(s.name)}</span>
          <span class="sp-meta">${count}名 / ${formatDate(s.createdAt).slice(0, 10)}</span>
        </button>
        <button class="sp-rename icon-btn btn" data-rename="${s.id}" title="名称変更">✏</button>
      </div>`;
    }).join('') : '<div class="muted" style="padding:14px;text-align:center;font-size:12px">該当する試験回がありません</div>';
    wrap.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      Storage.setCurrentSessionId(b.dataset.pick);
      ensureTests(getSession());
      closeSessionPopover();
      renderSessionBar();
      refreshAllViews();
    }));
    wrap.querySelectorAll('[data-rename]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const id = b.dataset.rename;
      const s = Storage.loadSessions().find(x => x.id === id);
      const v = prompt('試験回の名前', s.name);
      if (!v || v === s.name) return;
      Storage.renameSession(id, v);
      renderSessionBar();
      renderSessionPopoverList();
    }));
  }

  function onSessionChange(e) {
    Storage.setCurrentSessionId(e.target.value);
    ensureTests(getSession());
    renderSessionBar();
    refreshAllViews();
  }
  function onAddSession() {
    const name = prompt('新しい試験回の名前を入力してください', `${new Date().getFullYear()}年度入試`);
    if (!name) return;
    const s = Storage.addSession(name);
    Storage.setCurrentSessionId(s.id);
    ensureTests(getSession());
    renderSessionBar();
    refreshAllViews();
  }
  function onRenameSession() {
    const cur = getSession();
    const name = prompt('試験回の名前', cur.name);
    if (!name || name === cur.name) return;
    Storage.renameSession(cur.id, name);
    renderSessionBar();
  }
  function onDeleteSession() {
    const cur = getSession();
    const cnt = Storage.loadForSession(cur.id).length;
    if (!confirm(`試験回「${cur.name}」を削除します（受験者${cnt}名のデータも一緒に削除されます）。よろしいですか？`)) return;
    Storage.removeSession(cur.id);
    ensureTests(getSession());
    renderSessionBar();
    refreshAllViews();
  }
  function refreshAllViews() {
    // 試験回切替時: 他セッションの受験者を開いていたタブをクリーンアップ
    const listIds = new Set(Storage.loadForSession().map(c => c.id));
    if (Array.isArray(_uiState.profileTabs)) {
      const valid = _uiState.profileTabs.filter(id => listIds.has(id));
      if (valid.length !== _uiState.profileTabs.length) {
        _uiState.profileTabs = valid;
        saveUiState({ profileTabs: valid });
      }
      if (_uiState.profileId && !listIds.has(_uiState.profileId)) {
        saveUiState({ profileId: valid[valid.length - 1] || '' });
      }
    }
    renderOverview();
    refreshProfileSelect();
    renderAcademicMgr();
    renderSurveyMgr();
    renderResumeMgr();
    renderProfileTabbar();
    // active profile が無くなった場合は body をクリア
    if (!_uiState.profileId && document.getElementById('view-profile').classList.contains('active')) {
      $('#profile-body').innerHTML = '<div class="empty-cta" style="padding:40px;text-align:center;color:var(--muted)"><div style="font-size:48px">👤</div><p>受験者を選択するとプロフィールが開きます</p></div>';
    }
  }

  // ===== Tabs =====
  function showView(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    $$('.header-action-btn[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    saveUiState({ view: name });
    if (name === 'overview') renderOverview();
    if (name === 'profile') refreshProfileSelect();
    if (name === 'portal')   renderPortal();
    if (name === 'admin') {
      const sub = _uiState.adminview || 'resume';
      showAdminview(sub);
    }
  }
  function showAdminview(name) {
    $$('.adminsubtab').forEach(t => t.classList.toggle('active', t.dataset.adminview === name));
    $$('.adminview').forEach(v => v.classList.toggle('active', v.id === 'adminview-' + name));
    saveUiState({ adminview: name });
    if (name === 'info')     renderSessionInfoMgr();
    if (name === 'academic') renderAcademicMgr();
    if (name === 'survey')   renderSurveyMgr();
    if (name === 'resume')   { renderResumeMgr(); showResumeview(_uiState.resumeview || 'apply'); }
    if (name === 'interview') { renderInterviewMgr(); showInterviewview(_uiState.interviewview || 'ratings'); }
    if (name === 'data')     showDataview(_uiState.dataview || 'import');
  }
  function showResumeview(name) {
    $$('.resume-subtab[data-resumeview]').forEach(t => t.classList.toggle('active', t.dataset.resumeview === name));
    $$('.resumeview').forEach(v => v.classList.toggle('active', v.id === 'resumeview-' + name));
    saveUiState({ resumeview: name });
  }
  function showInterviewview(name) {
    $$('.resume-subtab[data-interviewview]').forEach(t => t.classList.toggle('active', t.dataset.interviewview === name));
    $$('.interviewview').forEach(v => v.classList.toggle('active', v.id === 'interviewview-' + name));
    saveUiState({ interviewview: name });
  }
  function showDataview(name) {
    $$('.resume-subtab[data-dataview]').forEach(t => t.classList.toggle('active', t.dataset.dataview === name));
    $$('.dataview').forEach(v => v.classList.toggle('active', v.id === 'dataview-' + name));
    saveUiState({ dataview: name });
  }
  function attachAdminContent() {
    document.querySelectorAll('.admin-content').forEach(el => {
      const target = document.getElementById('adminview-' + el.dataset.admin);
      if (target && !target.contains(el)) target.appendChild(el);
    });
  }
  function showAnalysisView(name) {
    $$('.resume-subtab[data-analysisview]').forEach(t => t.classList.toggle('active', t.dataset.analysisview === name));
    $$('.analysisview').forEach(v => v.classList.toggle('active', v.id === 'analysis-' + name));
    saveUiState({ analysisview: name });
    if (name === 'chart')   renderChartView();
    if (name === 'rank')    renderRanking();
    if (name === 'cluster') {
      const list = Storage.loadForSession().filter(c => Stats.hasAcademic(c) || Stats.hasSurvey(c));
      const kInput = $('#k-value');
      if (kInput) {
        kInput.max = Math.max(2, Math.min(8, list.length));
        if (Number(kInput.value) > Number(kInput.max)) kInput.value = kInput.max;
      }
      if (list.length >= Math.max(2, Number(kInput?.value) || 4)) runCluster();
    }
  }
  function showSubview(name) {
    $$('.subtab').forEach(t => t.classList.toggle('active', t.dataset.subview === name));
    $$('.subview').forEach(v => v.classList.toggle('active', v.id === 'sub-' + name));
    saveUiState({ subview: name });
    if (name === 'analysis') {
      // 分析タブ: 復元 or デフォルト chart
      const savedAv = _uiState.analysisview || 'chart';
      showAnalysisView(savedAv);
    }
    if (name === 'chart')   renderChartView();
    if (name === 'rank')    renderRanking();
    if (name === 'cluster') {
      const list = Storage.loadForSession().filter(c => Stats.hasAcademic(c) || Stats.hasSurvey(c));
      // Auto-adjust k input max based on available data
      const kInput = $('#k-value');
      if (kInput) {
        kInput.max = Math.max(2, Math.min(8, list.length));
        if (Number(kInput.value) > Number(kInput.max)) kInput.value = kInput.max;
      }
      if (list.length >= Math.max(2, Number($('#k-value')?.value) || 4)) runCluster();
      else {
        // Show empty/notice
        const emptyEl = document.getElementById('cluster-empty');
        const resultEl = document.getElementById('cluster-result');
        if (emptyEl) {
          emptyEl.style.display = 'block';
          emptyEl.innerHTML = list.length === 0
            ? '<div style="font-size:48px">📊</div><p>学力試験またはアンケート回答済みの受験者がいません。</p><p style="font-size:12px">回答が集まり次第、自動的に分析されます。</p>'
            : `<div style="font-size:48px">📊</div><p>現在 ${list.length}名 のデータがあります。<br>分類数 k を ${list.length} 以下にして「分析を実行」してください。</p>`;
        }
        if (resultEl) resultEl.style.display = 'none';
      }
    }
    if (name === 'list')    renderCandidateList();
  }
  function updateTabBadges() {
    const list = Storage.loadForSession();
    const overviewTab = document.querySelector('.tab[data-view="overview"]');
    if (overviewTab && !overviewTab.dataset.label) overviewTab.dataset.label = overviewTab.textContent.trim();
    if (overviewTab) overviewTab.innerHTML = `${escapeHtml(overviewTab.dataset.label)} <span class="tab-count">${list.length}</span>`;
  }

  function openHelpModal() {
    document.getElementById('help-modal').style.display = 'flex';
    document.getElementById('help-btn').classList.remove('first-visit-pulse');
    saveUiState({ helpSeen: true });
  }
  function closeHelpModal() { document.getElementById('help-modal').style.display = 'none'; }

  // ===== Overview =====
  function renderOverview() {
    const sess = ensureTests(getSession());
    const list = Storage.loadForSession();
    const N = list.length;
    const nApp = list.filter(c => Stats.hasApplication(c)).length;
    const nR = list.filter(c => Stats.hasResume(c)).length;
    const nA = list.filter(c => Stats.hasAcademic(c)).length;
    const nS = list.filter(c => Stats.hasSurvey(c)).length;
    const nI = list.filter(c => Stats.hasInterview(c)).length;
    $('#stat-count').textContent = N;
    if ($('#stat-application')) $('#stat-application').textContent = `${nApp} / ${N}`;
    $('#stat-resume').textContent    = `${nR} / ${N}`;
    $('#stat-academic').textContent  = `${nA} / ${N}`;
    $('#stat-survey').textContent    = `${nS} / ${N}`;
    $('#stat-interview').textContent = `${nI} / ${N}`;
    const acEntries = list.filter(c => Stats.hasAcademic(c)).map(c => ({ c, pct: Stats.scoreAcademic(c, sess.academicTest).percent }));
    const statMaxCard = document.querySelector('[data-stat="max"]') || $('#stat-max').closest('.card.stat');
    const statMinCard = document.querySelector('[data-stat="min"]') || $('#stat-min').closest('.card.stat');
    if (statMaxCard) statMaxCard.onclick = null;
    if (statMinCard) statMinCard.onclick = null;
    if (acEntries.length) {
      const maxE = acEntries.reduce((a, b) => a.pct >= b.pct ? a : b);
      const minE = acEntries.reduce((a, b) => a.pct <= b.pct ? a : b);
      $('#stat-max').innerHTML = `${maxE.pct.toFixed(1)}% <span class="stat-name">${escapeHtml(fullName(maxE.c))}</span>`;
      $('#stat-min').innerHTML = `${minE.pct.toFixed(1)}% <span class="stat-name">${escapeHtml(fullName(minE.c))}</span>`;
      if (statMaxCard) {
        statMaxCard.classList.add('clickable');
        statMaxCard.title = `${fullName(maxE.c)} の個人画面を開く`;
        statMaxCard.onclick = () => { showView('profile'); openProfileTab(maxE.c.id); };
      }
      if (statMinCard) {
        statMinCard.classList.add('clickable');
        statMinCard.title = `${fullName(minE.c)} の個人画面を開く`;
        statMinCard.onclick = () => { showView('profile'); openProfileTab(minE.c.id); };
      }
    } else {
      $('#stat-max').textContent = '—';
      $('#stat-min').textContent = '—';
      if (statMaxCard) { statMaxCard.classList.remove('clickable'); statMaxCard.title = ''; }
      if (statMinCard) { statMinCard.classList.remove('clickable'); statMinCard.title = ''; }
    }
    $('#stat-passed').textContent = list.filter(c => c.passed).length;
    // Update tab counters
    updateTabBadges();
    renderEmptyStateBanner(list.length === 0);
    renderCandidateList();
    renderChartView();
    renderRanking();
  }

  // ===== Submission modal =====
  function openSubmissionModal(phase) {
    const list = Storage.loadForSession();
    const phaseLabel = PHASE_LABEL[phase] || phase;
    // フェーズに応じた用語（面接は実施／未実施、それ以外は提出／未提出）
    const isInterview = phase === 'interview';
    const titleSuffix = isInterview ? '実施状況' : '提出状況';
    const submittedTitle = isInterview ? '実施済' : '提出者';
    const unsubmittedTitle = isInterview ? '未実施' : '未提出者';
    const hasFn   = { application: Stats.hasApplication, resume: Stats.hasResume, academic: Stats.hasAcademic, survey: Stats.hasSurvey, interview: Stats.hasInterview }[phase];
    if (!hasFn) { alert('不明なフェーズ: ' + phase); return; }
    const tsField = { application: 'applicationSubmittedAt', resume: 'resumeSubmittedAt', academic: 'academicSubmittedAt', survey: 'surveySubmittedAt', interview: '_interviewHeldAt' }[phase];
    // Map interview timestamp (latest record) for sort purposes
    if (phase === 'interview') list.forEach(c => {
      const recs = Stats.interviewRecords(c);
      c._interviewHeldAt = recs.length ? recs.map(r => r.heldAt).sort().pop() : null;
    });
    const submitted   = list.filter(c => hasFn(c));
    const unsubmitted = list.filter(c => !hasFn(c));

    // submitted: chronological by submission time
    submitted.sort((a, b) => new Date(b[tsField] || 0) - new Date(a[tsField] || 0));
    // unsubmitted: by examineeId then name
    unsubmitted.sort((a, b) => (a.examineeId || '').localeCompare(b.examineeId || '', 'ja') || fullName(a).localeCompare(fullName(b), 'ja'));

    const existing = document.getElementById('submission-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'submission-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'submission-modal-title');
    modal.innerHTML = `
      <div class="modal-window">
        <div class="modal-head">
          <h3 style="margin:0" id="submission-modal-title">📊 ${escapeHtml(phaseLabel)} ${titleSuffix}</h3>
          <button class="btn modal-close" aria-label="提出状況ダイアログを閉じる">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-col">
            <h4 class="modal-col-title">✅ ${submittedTitle} <span class="muted">(${submitted.length}名・新しい順)</span></h4>
            <div class="submission-list">
              ${submitted.length ? submitted.map((c, i) => `
                <div class="submission-row" data-id="${c.id}">
                  <span class="sub-order">${i + 1}</span>
                  ${c.photo ? `<img class="avatar-sm" src="${c.photo}" alt="">` : '<div class="avatar-sm avatar-blank">👤</div>'}
                  <div class="sub-info">
                    <div class="sub-name">${escapeHtml(fullName(c))}</div>
                    <div class="sub-meta">${escapeHtml(c.examineeId || '')}${c.faculty ? ' ・ ' + escapeHtml(c.faculty) : ''}</div>
                  </div>
                  <div class="sub-time">${formatDate(c[tsField])}</div>
                </div>
              `).join('') : `<p class="muted" style="text-align:center;padding:14px">${isInterview ? 'まだ実施されていません' : '提出者がいません'}</p>`}
            </div>
          </div>
          <div class="modal-col">
            <h4 class="modal-col-title">❌ ${unsubmittedTitle} <span class="muted">(${unsubmitted.length}名・受験番号順)</span></h4>
            <div class="submission-list">
              ${unsubmitted.length ? unsubmitted.map(c => `
                <div class="submission-row unsubmitted" data-id="${c.id}">
                  ${c.photo ? `<img class="avatar-sm" src="${c.photo}" alt="">` : '<div class="avatar-sm avatar-blank">👤</div>'}
                  <div class="sub-info">
                    <div class="sub-name">${escapeHtml(fullName(c)) || '<span class="muted">名称未登録</span>'}</div>
                    <div class="sub-meta">${escapeHtml(c.examineeId || '')}</div>
                  </div>
                  <div class="sub-time"><span class="miss-badge">未</span></div>
                </div>
              `).join('') : `<p class="muted" style="text-align:center;padding:14px">${isInterview ? '全員実施済み' : '全員提出済み'}</p>`}
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.querySelectorAll('.submission-row[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        modal.remove();
        showView('profile');
        openProfileTab(row.dataset.id);
      });
    });
  }

  function renderEmptyStateBanner(empty) {
    const exist = document.getElementById('empty-cta');
    if (!empty) { if (exist) exist.remove(); return; }
    if (exist) return;
    const banner = document.createElement('div');
    banner.id = 'empty-cta';
    banner.className = 'card empty-cta';
    banner.innerHTML = `
      <div class="empty-cta-inner">
        <div>
          <h3 style="margin:0 0 4px">📭 受験者データがまだありません</h3>
          <p style="margin:0;color:var(--muted);font-size:13px">アプリの機能をすぐ試すには、20名分のデモデータを投入してください。</p>
        </div>
        <button class="btn primary" id="cta-seed-demo">🚀 デモデータを投入</button>
      </div>
    `;
    const view = document.getElementById('view-overview');
    view.insertBefore(banner, view.firstChild.nextSibling);
    document.getElementById('cta-seed-demo').addEventListener('click', seedDemo);
  }

  // Per-column sort state (restored from saved UI state)
  let _listSort = _uiState.listSort || { key: 'updated', dir: 'desc' };
  // Per-column filter state (restored)
  let _listFilters = _uiState.listFilters || {};

  function parseNumericFilter(expr) {
    // Supports ≥N, >=N, >N, ≤N, <=N, <N, N..M, N
    const s = String(expr || '').trim();
    if (!s) return null;
    let m;
    if ((m = s.match(/^(?:>=|≥)\s*(-?\d+\.?\d*)$/))) return v => v >= Number(m[1]);
    if ((m = s.match(/^>\s*(-?\d+\.?\d*)$/)))          return v => v > Number(m[1]);
    if ((m = s.match(/^(?:<=|≤)\s*(-?\d+\.?\d*)$/)))   return v => v <= Number(m[1]);
    if ((m = s.match(/^<\s*(-?\d+\.?\d*)$/)))          return v => v < Number(m[1]);
    if ((m = s.match(/^(-?\d+\.?\d*)\.\.(-?\d+\.?\d*)$/))) return v => v >= Number(m[1]) && v <= Number(m[2]);
    if ((m = s.match(/^=?\s*(-?\d+\.?\d*)$/)))         return v => v == Number(m[1]);
    return null;
  }

  function renderCandidateList() {
    const sess = getSession();
    const tbody = $('#cand-table tbody');
    const q = ($('#search-cand').value || '').trim().toLowerCase();
    let list = Storage.loadForSession();

    const enriched = list.map(c => {
      const ac = Stats.scoreAcademic(c, sess.academicTest);
      const sv = Stats.surveyAvg(c, sess.surveyTest);
      const total = Stats.totalScore(c, sess);
      const lastUpdate = [c.resumeSubmittedAt, c.academicSubmittedAt, c.surveySubmittedAt, c.createdAt].filter(Boolean).sort().pop();
      return { c, ac, sv, total, lastUpdate };
    });

    // Global search across visible textual fields
    let filtered = enriched;
    if (q) {
      filtered = filtered.filter(({ c }) => [
        fullName(c), fullKana(c), c.examineeId, c.gender, c.faculty, c.department, c.email, c.phone
      ].some(v => String(v || '').toLowerCase().includes(q)));
    }

    // Per-column filters
    Object.entries(_listFilters).forEach(([key, val]) => {
      if (val === '' || val == null) return;
      const v = String(val).toLowerCase();
      filtered = filtered.filter(row => {
        const { c, ac, sv, total } = row;
        switch (key) {
          case 'passed':     return val === '1' ? !!c.passed : !c.passed;
          case 'examineeId': return (c.examineeId || '').toLowerCase().includes(v);
          case 'name':       return (fullName(c) + ' ' + fullKana(c)).toLowerCase().includes(v);
          case 'gender':     return (c.gender || '') === val;
          case 'faculty':    return ((c.faculty || '') + ' ' + (c.department || '')).toLowerCase().includes(v);
          case 'resume':     return val === '1' ? Stats.hasResume(c) : !Stats.hasResume(c);
          case 'applicationStatus': return val === '1' ? Stats.hasApplication(c) : !Stats.hasApplication(c);
          case 'academicStatus':  return val === '1' ? Stats.hasAcademic(c) : !Stats.hasAcademic(c);
          case 'surveyStatus':    return val === '1' ? Stats.hasSurvey(c) : !Stats.hasSurvey(c);
          case 'interviewStatus': return val === '1' ? Stats.hasInterview(c) : !Stats.hasInterview(c);
          case 'academic':   { const f = parseNumericFilter(val); return f ? (Stats.hasAcademic(c) && f(ac.percent)) : true; }
          case 'survey':     { const f = parseNumericFilter(val); return f ? (Stats.hasSurvey(c) && f(sv)) : true; }
          default: return true;
        }
      });
    });

    // Per-column sort
    const dir = _listSort.dir === 'asc' ? 1 : -1;
    const cmp = (a, b) => {
      switch (_listSort.key) {
        case 'passed':     return ((a.c.passed ? 1 : 0) - (b.c.passed ? 1 : 0)) * dir;
        case 'examineeId': return (a.c.examineeId || '').localeCompare(b.c.examineeId || '', 'ja') * dir;
        case 'name':       return fullName(a.c).localeCompare(fullName(b.c), 'ja') * dir;
        case 'gender':     return (a.c.gender || '').localeCompare(b.c.gender || '', 'ja') * dir;
        case 'faculty':    return ((a.c.faculty || '') + (a.c.department || '')).localeCompare((b.c.faculty || '') + (b.c.department || ''), 'ja') * dir;
        case 'application': return (new Date(a.c.applicationSubmittedAt || 0) - new Date(b.c.applicationSubmittedAt || 0)) * dir;
        case 'resume':     return ((Stats.hasResume(a.c) ? 1 : 0) - (Stats.hasResume(b.c) ? 1 : 0)) * dir;
        case 'academic':   return (a.ac.percent - b.ac.percent) * dir;
        case 'survey':     return (a.sv - b.sv) * dir;
        case 'interview':  return (Stats.interviewAvg(a.c, sess) - Stats.interviewAvg(b.c, sess)) * dir;
        case 'updated':    return (new Date(a.lastUpdate || 0) - new Date(b.lastUpdate || 0)) * dir;
        default: return 0;
      }
    };
    filtered.sort(cmp);

    // Update sort indicator on header
    document.querySelectorAll('#cand-table thead .sort-row th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === _listSort.key) th.classList.add(_listSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    });
    document.querySelector('#cand-table thead .sort-row th[data-sort="' + _listSort.key + '"]')?.classList.add('sort-' + _listSort.dir);

    // (use 'filtered' below as enriched substitute)
    const _enriched = filtered;
    const missBadge = '<span class="miss-badge">未</span>';
    tbody.innerHTML = _enriched.map(({ c, ac, sv, lastUpdate }) => {
      const iv = Stats.hasInterview(c);
      const ivAvg = iv ? Stats.interviewAvg(c, sess) : 0;
      return `
      <tr data-id="${c.id}" class="${c.passed ? 'row-passed' : ''}">
        <td><input type="checkbox" class="pass-check" data-id="${c.id}" ${c.passed ? 'checked' : ''} title="合格チェック"></td>
        <td>${escapeHtml(c.examineeId || '')}</td>
        <td>
          <div class="name-cell">
            ${c.photo ? `<img class="avatar-sm" src="${c.photo}" alt="">` : '<div class="avatar-sm avatar-blank">👤</div>'}
            <div>
              <div class="name-main">${escapeHtml(fullName(c))}</div>
              ${fullKana(c) ? `<div class="name-kana">${escapeHtml(fullKana(c))}</div>` : ''}
            </div>
          </div>
        </td>
        <td>${escapeHtml(c.gender || '—')}</td>
        <td>${escapeHtml((c.faculty || '') + ' ' + (c.department || ''))}</td>
        <td>${Stats.hasApplication(c) ? `<div class="cell-status">✅<span class="cell-time">${formatDateShort(c.applicationSubmittedAt)}</span></div>` : missBadge}</td>
        <td>${Stats.hasResume(c) ? `<div class="cell-status">✅<span class="cell-time">${formatDateShort(c.resumeSubmittedAt)}</span></div>` : missBadge}</td>
        <td class="num">${Stats.hasSurvey(c) ? `<div class="cell-status"><strong>${sv.toFixed(2)}/5.00</strong><span class="cell-time">${formatDateShort(c.surveySubmittedAt)}</span></div>` : missBadge}</td>
        <td class="num">${Stats.hasAcademic(c) ? `<div class="cell-status"><strong>${ac.percent.toFixed(1)}%</strong><span class="cell-time">${formatDateShort(c.academicSubmittedAt)}</span></div>` : missBadge}</td>
        <td class="num">${iv ? `<div class="cell-status"><strong>${ivAvg.toFixed(2)}/5.00</strong><span class="cell-time">実施${Stats.interviewCount(c)}件</span></div>` : missBadge}</td>
        <td>${formatDate(lastUpdate)}</td>
        <td class="row-actions">
          <button class="btn btn-icon" data-act="view" title="詳細を見る">👁</button>
          <button class="btn btn-icon danger" data-act="del" title="削除">🗑</button>
        </td>
      </tr>`;
    }).join('') || (list.length === 0
      ? `<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:24px">受験者データがありません。</td></tr>`
      : `<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:24px">🔍 検索条件に一致する受験者がいません（全${list.length}名中）。<br><button type="button" class="btn" id="empty-clear-filters" style="margin-top:8px">フィルタをクリア</button></td></tr>`);
    tbody.querySelector('#empty-clear-filters')?.addEventListener('click', () => {
      $('#search-cand').value = '';
      _listFilters = {};
      document.querySelectorAll('#cand-table thead .filter-row [data-filter]').forEach(el => { el.value = ''; });
      saveUiState({ listFilters: {}, search: '' });
      renderCandidateList();
    });
    tbody.querySelectorAll('.pass-check').forEach(cb => {
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', e => {
        const list = Storage.load();
        const rec = list.find(x => x.id === cb.dataset.id);
        if (rec) { rec.passed = cb.checked; Storage.save(list); renderOverview(); }
      });
    });
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.querySelector('[data-act="view"]')?.addEventListener('click', e => {
        e.stopPropagation();
        showView('profile');
        openProfileTab(tr.dataset.id);
      });
      tr.querySelector('[data-act="del"]')?.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('この受験者データを削除しますか？')) { Storage.remove(tr.dataset.id); renderOverview(); }
      });
      tr.addEventListener('click', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        showView('profile');
        openProfileTab(tr.dataset.id);
      });
    });
  }

  function renderChartView() {
    const sess = getSession();
    const list = Storage.loadForSession();
    const totals = list.filter(c => Stats.hasAcademic(c) || Stats.hasSurvey(c)).map(c => Stats.totalScore(c, sess));
    // distribution
    const dctx = $('#chart-distribution'); if (dctx) {
      const bins = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const labels = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'];
      totals.forEach(t => bins[Math.min(9, Math.floor(t / 10))]++);
      if (charts.dist) charts.dist.destroy();
      charts.dist = new Chart(dctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: '受験者数', data: bins, backgroundColor: 'rgba(79,70,229,.85)', borderRadius: 6, borderSkipped: false }] },
        options: barLineChartOptions({ legend: false })
      });
    }
    // subjects radar
    const sctx = $('#chart-subjects'); if (sctx) {
      const cats = sess.academicTest?.questions?.length
        ? [...new Set(sess.academicTest.questions.map(q => q.category || 'その他'))]
        : Stats.DEFAULT_ACADEMIC_CATEGORIES;
      const avgs = cats.map(cat => {
        const vals = list.filter(c => Stats.hasAcademic(c)).map(c => Stats.scoreAcademic(c, sess.academicTest).perCategory[cat] || 0);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      });
      if (charts.subj) charts.subj.destroy();
      charts.subj = new Chart(sctx, {
        type: 'radar',
        data: { labels: cats, datasets: [{ label: '平均(%)', data: avgs, backgroundColor: 'rgba(5,150,105,.18)', borderColor: '#059669', pointBackgroundColor: '#059669', borderWidth: 2, pointRadius: 4, pointHoverRadius: 6 }] },
        options: radarChartOptions(100, 20)
      });
    }
  }

  // ===== Ranking =====
  function renderRanking() {
    const sess = getSession();
    const n = Number($('#rank-n').value);
    const list = Storage.loadForSession()
      .filter(c => Stats.hasAcademic(c))
      .map(c => ({ c, ac: Stats.scoreAcademic(c, sess.academicTest) }));
    list.sort((a, b) => b.ac.percent - a.ac.percent);
    const top = list.slice(0, n);
    const tbody = $('#rank-table tbody');
    tbody.innerHTML = top.map((x, i) => `
      <tr data-id="${x.c.id}" class="${x.c.passed ? 'row-passed' : ''}">
        <td><strong>${i + 1}</strong></td>
        <td>${escapeHtml(x.c.examineeId || '')}</td>
        <td>
          <div class="name-cell">
            ${x.c.photo ? `<img class="avatar-sm" src="${x.c.photo}" alt="">` : '<div class="avatar-sm avatar-blank">👤</div>'}
            <div>
              <div class="name-main">${escapeHtml(fullName(x.c))}</div>
              ${fullKana(x.c) ? `<div class="name-kana">${escapeHtml(fullKana(x.c))}</div>` : ''}
            </div>
          </div>
        </td>
        <td>${escapeHtml((x.c.faculty || '') + ' ' + (x.c.department || ''))}</td>
        <td>${x.c.passed ? '✅' : ''}</td>
        <td class="num"><strong>${x.ac.percent.toFixed(1)}%</strong> <span class="muted" style="font-size:11px">(${x.ac.total}/${x.ac.max}点)</span></td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">学力試験を受験した受験者がいません。</td></tr>`;
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        showView('profile');
        openProfileTab(tr.dataset.id);
      });
    });
  }

  // ===== Cluster =====
  function runCluster() {
    const sess = getSession();
    const k = Math.max(2, Math.min(8, Number($('#k-value').value) || 4));
    // 学力試験 OR アンケート OR 面接のいずれかがあればクラスタリング対象に
    const allList = Storage.loadForSession();
    const list = allList.filter(c => Stats.hasAcademic(c) || Stats.hasSurvey(c) || Stats.hasInterview(c));
    const incompleteCount = 0;
    const emptyEl = document.getElementById('cluster-empty');
    const resultEl = document.getElementById('cluster-result');
    if (list.length < k) {
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = `<div style="font-size:48px">⚠</div><p>分析対象（学力試験＋アンケート両方提出済）が ${k} 人未満です。<br>現在 ${list.length}名 が分析可能${incompleteCount > 0 ? `（${incompleteCount}名は片方のみで除外）` : ''}。</p>`;
      }
      if (resultEl) resultEl.style.display = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (resultEl) {
      resultEl.style.display = '';
      // brief loading flash
      const oldOpacity = resultEl.style.opacity;
      resultEl.style.opacity = '.4';
      setTimeout(() => { resultEl.style.opacity = oldOpacity || '1'; }, 100);
    }
    const rawVectors = list.map(c => Stats.featureVector(c, sess));
    // Standardize features (z-score) for fair clustering across dimensions
    const std = Cluster.standardize(rawVectors);
    const stdVectors = std.data;
    // Multiple restarts (20) to escape local minima
    const { assignments, centroids: stdCentroids, inertia: clusterInertia } = Cluster.kmeansBest(stdVectors, k, 20);
    // Convert centroids back to original scale for display
    const centroids = stdCentroids.map(c => c.map((x, i) => x * std.std[i] + std.mean[i]));
    const vectors = rawVectors;
    const { points } = Cluster.pca2(stdVectors);

    const palette = ['#4f46e5', '#059669', '#f59e0b', '#dc2626', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

    const cats = sess.academicTest?.questions?.length
      ? [...new Set(sess.academicTest.questions.map(q => q.category || 'その他'))]
      : Stats.DEFAULT_ACADEMIC_CATEGORIES;
    const surveyQs = sess.surveyTest?.questions || [];
    const ivRatings = Stats.getInterviewRatings(sess);
    // 学力カテゴリ + アンケート項目 + 面接評価カテゴリ
    const featLabels = cats.concat(surveyQs.map(q => q.text)).concat(ivRatings.map(r => '面接:' + r.label));
    const overallMean = featLabels.map((_, fi) => vectors.reduce((s, v) => s + v[fi], 0) / vectors.length);

    // Pre-compute system names for each cluster (for legend display)
    const clusterSystemNames = [];
    for (let ci = 0; ci < k; ci++) {
      const diffs = featLabels.map((label, fi) => ({
        label, isAcademic: fi < cats.length,
        diff: centroids[ci][fi] - overallMean[fi],
        centroidVal: centroids[ci][fi]
      }));
      clusterSystemNames.push(inferClusterSystem(diffs, cats));
    }

    if (charts.cluster) charts.cluster.destroy();
    const datasets = [];
    for (let c = 0; c < k; c++) {
      const pts = points.map((p, i) => ({ x: p[0], y: p[1], _idx: i }))
                        .filter((_, i) => assignments[i] === c);
      datasets.push({ label: `${clusterSystemNames[c]} (${pts.length}名)`, data: pts, backgroundColor: palette[c % palette.length], pointRadius: 6, pointHoverRadius: 9 });
    }
    const palP = chartPalette();
    charts.cluster = new Chart($('#chart-cluster'), {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: palP.text } },
          tooltip: { callbacks: { label: ctx => { const c = list[ctx.raw._idx]; return `${fullName(c)} (${c.examineeId})`; } } }
        },
        scales: {
          x: { title: { display: true, text: '← 違いの軸1 →', color: palP.text }, ticks: { display: false }, grid: { color: palP.grid } },
          y: { title: { display: true, text: '↑ 違いの軸2 ↓', color: palP.text }, ticks: { display: false }, grid: { color: palP.grid } }
        }
      }
    });

    if (charts.clusterRadar) charts.clusterRadar.destroy();
    const radarDS = centroids.map((centroid, i) => ({
      label: clusterSystemNames[i],
      data: centroid.slice(0, cats.length).map(v => v * 100),
      backgroundColor: palette[i % palette.length] + '33',
      borderColor: palette[i % palette.length],
      pointBackgroundColor: palette[i % palette.length]
    }));
    charts.clusterRadar = new Chart($('#chart-cluster-radar'), {
      type: 'radar',
      data: { labels: cats.map(c => truncateLabel(c, 10)), datasets: radarDS },
      options: radarChartOptions(100, 20)
    });

    // ===== Cluster characterization: 系統名・属性差分・スコア範囲 =====

    // Stat cards
    const clusterSizes = [];
    for (let ci = 0; ci < k; ci++) clusterSizes.push(list.filter((_, i) => assignments[i] === ci).length);
    if (document.getElementById('cluster-stat-n')) document.getElementById('cluster-stat-n').textContent = list.length + '名';
    if (document.getElementById('cluster-stat-k')) document.getElementById('cluster-stat-k').textContent = k + 'グループ';
    if (document.getElementById('cluster-stat-max')) document.getElementById('cluster-stat-max').textContent = Math.max(...clusterSizes) + '名';
    if (document.getElementById('cluster-stat-min')) document.getElementById('cluster-stat-min').textContent = Math.min(...clusterSizes) + '名';
    // 分析品質情報をヒーローカードに表示
    const heroText = document.querySelector('.cluster-hero-text');
    if (heroText) {
      let qualEl = heroText.querySelector('.cluster-quality');
      if (!qualEl) { qualEl = document.createElement('div'); qualEl.className = 'cluster-quality'; heroText.appendChild(qualEl); }
      qualEl.innerHTML = `<small style="color:var(--muted);font-size:11px">⚙ 分析対象: ${list.length}名（学力・アンケート・面接のいずれかを提出済） ・ <span title="クラスター内の散らばり具合。低いほど各グループがまとまっています。">分類スコア ${clusterInertia.toFixed(1)}</span></small>`;
    }

    let charHtml = '<div class="cluster-grid">';
    for (let ci = 0; ci < k; ci++) {
      const memberIdx = list.map((_, i) => i).filter(i => assignments[i] === ci);
      const members = memberIdx.map(i => list[i]);
      // Find representative: member closest to centroid
      let repIdx = memberIdx[0], minDist = Infinity;
      memberIdx.forEach(i => {
        const d = vectors[i].reduce((s, x, j) => s + (x - centroids[ci][j]) ** 2, 0);
        if (d < minDist) { minDist = d; repIdx = i; }
      });
      const representative = list[repIdx];
      // diff per feature
      const diffs = featLabels.map((label, fi) => ({
        label, isAcademic: fi < cats.length,
        diff: centroids[ci][fi] - overallMean[fi],
        centroidVal: centroids[ci][fi]
      }));
      const sortedHi = [...diffs].sort((a, b) => b.diff - a.diff).slice(0, 3);
      const sortedLo = [...diffs].sort((a, b) => a.diff - b.diff).slice(0, 2);
      const fmtVal = (d) => d.isAcademic ? `${(d.centroidVal * 100).toFixed(1)}%` : `${(d.centroidVal * 5).toFixed(1)}/5.0`;
      const systemName = inferClusterSystem(diffs, cats);
      const acScores = members.map(m => Stats.scoreAcademic(m, sess.academicTest).percent).filter(v => !isNaN(v));
      const svScores = members.map(m => Stats.surveyAvg(m, sess.surveyTest)).filter(v => v > 0);
      const totalScores = members.map(m => Stats.totalScore(m, sess));
      const passedCount = members.filter(m => m.passed).length;
      const genderDist = {};
      members.forEach(m => { if (m.gender) genderDist[m.gender] = (genderDist[m.gender] || 0) + 1; });
      const facultyDist = {};
      members.forEach(m => { if (m.faculty) facultyDist[m.faculty] = (facultyDist[m.faculty] || 0) + 1; });
      const topFaculty = Object.entries(facultyDist).sort((a, b) => b[1] - a[1]).slice(0, 2);

      const rangeBlock = (label, arr, suffix = '') => {
        if (!arr.length) return '';
        // 分母にも同じ精度を付与 (例: 5 → 5.0)
        const sfx = suffix.replace(/(\d+)$/, (m) => Number(m).toFixed(1));
        return `<div class="range-row"><span>${label}</span><strong>${Math.min(...arr).toFixed(1)}${sfx} 〜 ${Math.max(...arr).toFixed(1)}${sfx}</strong> <span class="range-mean">(平均 ${(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)}${sfx})</span></div>`;
      };

      charHtml += `<div class="cluster-card" style="border-top:6px solid ${palette[ci % palette.length]}">
        <div class="cluster-card-head">
          <div>
            <h4 style="color:${palette[ci % palette.length]};margin:0">クラスター ${ci + 1}</h4>
            <div class="cluster-system">${escapeHtml(systemName)}</div>
          </div>
          <div class="cluster-card-meta">
            <div><strong>${members.length}名</strong></div>
            ${passedCount ? `<div>合格 ${passedCount}名</div>` : ''}
          </div>
        </div>

        <div class="range-block">
          <div class="trait-title">📊 スコア範囲</div>
          ${rangeBlock('学力', acScores, '%')}
          ${rangeBlock('アンケート', svScores, '/5')}
          ${rangeBlock('総合', totalScores)}
        </div>

        <div class="cluster-traits">
          <div class="trait-block">
            <div class="trait-title">▲ 強み（平均より高い）</div>
            ${sortedHi.map(d => `<div class="trait-row"><span class="trait-name">${escapeHtml(d.label)}</span><span class="trait-val up">${fmtVal(d)}</span></div>`).join('')}
          </div>
          <div class="trait-block">
            <div class="trait-title">▼ 弱み（平均より低い）</div>
            ${sortedLo.map(d => `<div class="trait-row"><span class="trait-name">${escapeHtml(d.label)}</span><span class="trait-val down">${fmtVal(d)}</span></div>`).join('')}
          </div>
        </div>

        <div class="cluster-demographics">
          ${Object.keys(genderDist).length ? `<div class="demo-row">🚻 ${Object.entries(genderDist).map(([k, v]) => `${k}${v}`).join(' / ')}</div>` : ''}
          ${topFaculty.length ? `<div class="demo-row">🏫 ${topFaculty.map(([k, v]) => `${k}${v}`).join(' / ')}</div>` : ''}
        </div>

        <div class="cluster-representative" style="background:${palette[ci % palette.length]}15;border-left:4px solid ${palette[ci % palette.length]}">
          <div class="rep-label">⭐ 代表的な受験者（中心に最も近い）</div>
          <div class="rep-info">
            ${representative.photo ? `<img class="avatar-sm" src="${representative.photo}" alt="">` : '<div class="avatar-sm avatar-blank">👤</div>'}
            <div>
              <div class="rep-name"><a href="#" data-jump-id="${representative.id}">${escapeHtml(fullName(representative))}</a></div>
              <div class="rep-meta">${escapeHtml(representative.examineeId || '')} ・ ${escapeHtml(representative.faculty || '')}</div>
            </div>
          </div>
        </div>

        <div class="cluster-members">
          <div class="trait-title">全メンバー（チェックで合格マーク）</div>
          <div class="cluster-member-list">${members.map(m => `
            <label class="cluster-member-row" data-jump-id="${m.id}">
              <input type="checkbox" class="cluster-pass-check" data-id="${m.id}" ${m.passed ? 'checked' : ''}>
              ${m.photo ? `<img class="avatar-sm" src="${m.photo}" alt="" style="width:22px;height:22px">` : '<span class="avatar-sm avatar-blank" style="width:22px;height:22px">👤</span>'}
              <span class="cluster-member-name">${escapeHtml(fullName(m))}</span>
              <span class="cluster-member-score">${Stats.hasAcademic(m) ? Stats.scoreAcademic(m, sess.academicTest).percent.toFixed(1) + '%' : ''}</span>
            </label>
          `).join('')}</div>
        </div>

        <div class="cluster-hint">💡 多様性確保のため、この系統から <strong>${Math.max(1, Math.ceil(members.length / 5))}名</strong> 程度の採用を推奨</div>
      </div>`;
    }
    charHtml += '</div>';
    $('#cluster-assign-list').innerHTML = charHtml;
    // Pass-check toggles in cluster cards
    document.querySelectorAll('.cluster-pass-check').forEach(cb => {
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', e => {
        e.stopPropagation();
        const updated = Storage.load();
        const rec = updated.find(x => x.id === cb.dataset.id);
        if (rec) { rec.passed = cb.checked; Storage.save(updated); toast(`${fullName(rec)} を ${cb.checked ? '合格' : '未合格'} に更新`, 'success', 1500); renderOverview(); }
      });
    });
    // Representative name / member row clicks jump to profile
    document.querySelectorAll('[data-jump-id]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.matches('input,a')) return;
        e.preventDefault();
        showView('profile');
        openProfileTab(el.dataset.jumpId);
      });
    });
  }

  // Infer cluster "系統名" from top traits
  function inferClusterSystem(diffs, cats) {
    const sorted = [...diffs].sort((a, b) => b.diff - a.diff);
    const topPos = sorted.filter(d => d.diff > 0.05);
    const acHi = topPos.filter(d => d.isAcademic).map(d => d.label);
    const svHi = topPos.filter(d => !d.isAcademic).map(d => d.label);
    const acCount = acHi.length;
    const svCount = svHi.length;

    // Pattern matching for 系統 (heuristic)
    const has = (arr, kw) => arr.some(l => l.includes(kw));
    if (acCount >= 3 && svCount < 2) return '🎓 学力重視・知識型';
    if (svCount >= 4 && acCount < 2) return '🤝 対人スキル・人間性型';
    if (has(acHi, '論理') || has(acHi, '統計') || has(svHi, 'データ')) return '📊 分析・データ思考型';
    if (has(acHi, '英語')) return '🌐 グローバル・語学型';
    if (has(acHi, 'プレゼン') || has(acHi, '文章') || has(svHi, '人前で話す')) return '💬 表現・コミュ型';
    if (has(svHi, 'リーダー')) return '👑 リーダーシップ型';
    if (has(svHi, '創造') || has(svHi, '新しいアイデア')) return '🎨 創造・イノベーション型';
    if (acCount === 0 && svCount === 0) return '⚖ バランス・標準型';
    if (acCount >= 2 && svCount >= 2) return '✨ オールラウンド型';
    return '🌟 個性派型';
  }

  // ===== Profile =====
  function refreshProfileSelect() {
    const sel = $('#profile-select');
    const list = Storage.loadForSession();
    const current = sel.value;
    const printBtn = document.getElementById('print-profile');
    const hasSelection = !!(current && list.find(c => c.id === current));
    if (printBtn) {
      printBtn.disabled = !hasSelection;
      printBtn.title = hasSelection ? '印刷' : '受験者を選択すると印刷できます';
    }
    if (hasSelection) {
      updateProfileTriggerLabel(current);
      renderProfile(current);
    } else {
      updateProfileTriggerLabel('');
      const list = Storage.loadForSession();
      $('#profile-body').innerHTML = list.length === 0
        ? '<div class="empty-state"><div class="empty-icon">👤</div><p>受験者がまだ登録されていません。</p><p style="font-size:12px">設定 → データから「デモデータを投入」、または受験申込URLを配布してください。</p></div>'
        : `<div class="empty-state"><div class="empty-icon">🔍</div><p>上部の「-- 受験者を選択 --」ボタンから ${list.length}名 の中から受験者を選んでください。</p></div>`;
    }
  }

  function updateProfileTriggerLabel(id) {
    const lbl = document.getElementById('profile-trigger-label');
    if (!lbl) return;
    if (!id) { lbl.textContent = '-- 受験者を選択 --'; return; }
    const c = Storage.loadForSession().find(x => x.id === id);
    if (!c) { lbl.textContent = '-- 受験者を選択 --'; return; }
    lbl.innerHTML = `${c.photo ? `<img class="avatar-sm" src="${c.photo}" style="width:24px;height:24px;margin-right:6px;vertical-align:middle">` : ''}${escapeHtml(c.examineeId || '')} ${escapeHtml(fullName(c))}`;
  }

  function toggleProfilePicker() {
    const pop = document.getElementById('profile-picker-popover');
    if (pop.style.display === 'none') {
      pop.style.display = 'block';
      document.getElementById('profile-picker-search').value = '';
      renderProfilePickerList();
      setTimeout(() => document.getElementById('profile-picker-search').focus(), 0);
    } else closeProfilePicker();
  }
  function closeProfilePicker() { document.getElementById('profile-picker-popover').style.display = 'none'; }

  function renderProfilePickerList() {
    const q = (document.getElementById('profile-picker-search').value || '').trim().toLowerCase();
    const sess = getSession();
    const curId = document.getElementById('profile-select').value;
    let list = Storage.loadForSession();
    if (q) list = list.filter(c => [fullName(c), fullKana(c), c.examineeId, c.faculty, c.department].some(v => String(v || '').toLowerCase().includes(q)));
    const wrap = document.getElementById('profile-picker-list');
    if (list.length === 0) {
      wrap.innerHTML = '<div class="muted" style="padding:14px;text-align:center;font-size:12px">該当する受験者がいません</div>';
      return;
    }
    wrap.innerHTML = list.map(c => {
      const ac = Stats.scoreAcademic(c, sess.academicTest);
      const isCurrent = c.id === curId;
      const phaseDots = [
        Stats.hasResume(c) ? '<span class="pp-dot done" title="履歴書済">📄</span>' : '<span class="pp-dot miss" title="履歴書未">📄</span>',
        Stats.hasAcademic(c) ? '<span class="pp-dot done" title="学力済">📚</span>' : '<span class="pp-dot miss" title="学力未">📚</span>',
        Stats.hasSurvey(c) ? '<span class="pp-dot done" title="アンケ済">📋</span>' : '<span class="pp-dot miss" title="アンケ未">📋</span>',
        Stats.hasInterview(c) ? '<span class="pp-dot done" title="面接済">🎤</span>' : '<span class="pp-dot miss" title="面接未">🎤</span>'
      ].join('');
      return `<div class="pp-item ${isCurrent ? 'current' : ''} ${c.passed ? 'passed' : ''}" data-id="${c.id}">
        ${c.photo ? `<img class="avatar-sm" src="${c.photo}" alt="">` : '<div class="avatar-sm avatar-blank">👤</div>'}
        <div class="pp-main">
          <div class="pp-name">${escapeHtml(fullName(c))} ${c.passed ? '<span class="pp-pass">✅合格</span>' : ''}</div>
          <div class="pp-meta">${escapeHtml(c.examineeId || '')} ・ ${escapeHtml(c.faculty || '')} ${escapeHtml(c.department || '')}</div>
          <div class="pp-detail">
            <span class="pp-phases">${phaseDots}</span>
            <span class="pp-score">学力 <strong>${Stats.hasAcademic(c) ? ac.percent.toFixed(1) + '%' : '—'}</strong></span>
          </div>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.pp-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        document.getElementById('profile-select').value = id;
        saveUiState({ profileId: id });
        updateProfileTriggerLabel(id);
        renderProfile(id);
        closeProfilePicker();
      });
    });
  }

  // ===== Profile tab system (console-style multi-open) =====
  const MAX_PROFILE_TABS = 10;
  function getProfileTabs() {
    const arr = Array.isArray(_uiState.profileTabs) ? _uiState.profileTabs.slice() : [];
    // ensure they still exist in current session
    const list = Storage.loadForSession();
    return arr.filter(tid => list.some(c => c.id === tid));
  }
  function setProfileTabs(arr) {
    _uiState.profileTabs = arr.slice(0, MAX_PROFILE_TABS);
    saveUiState({ profileTabs: _uiState.profileTabs });
  }
  function openProfileTab(id) {
    if (!id) return;
    const list = Storage.loadForSession();
    if (!list.some(c => c.id === id)) return;
    let tabs = getProfileTabs();
    if (!tabs.includes(id)) {
      tabs.push(id);
      if (tabs.length > MAX_PROFILE_TABS) tabs = tabs.slice(-MAX_PROFILE_TABS);
      setProfileTabs(tabs);
    }
    document.getElementById('profile-select').value = id;
    saveUiState({ profileId: id });
    updateProfileTriggerLabel(id);
    renderProfileTabbar();
    renderProfile(id);
  }
  function closeProfileTab(id) {
    let tabs = getProfileTabs();
    const idx = tabs.indexOf(id);
    if (idx < 0) return;
    tabs.splice(idx, 1);
    setProfileTabs(tabs);
    const active = _uiState.profileId;
    if (active === id) {
      const next = tabs[idx] || tabs[idx - 1] || tabs[0] || null;
      if (next) {
        document.getElementById('profile-select').value = next;
        saveUiState({ profileId: next });
        updateProfileTriggerLabel(next);
        renderProfile(next);
      } else {
        document.getElementById('profile-select').value = '';
        saveUiState({ profileId: '' });
        updateProfileTriggerLabel('');
        $('#profile-body').innerHTML = '<div class="empty-cta" style="padding:40px;text-align:center;color:var(--muted)"><div style="font-size:48px">👤</div><p>受験者を選択するとプロフィールが開きます</p></div>';
      }
    }
    renderProfileTabbar();
  }
  function closeAllProfileTabs() {
    setProfileTabs([]);
    document.getElementById('profile-select').value = '';
    saveUiState({ profileId: '' });
    updateProfileTriggerLabel('');
    $('#profile-body').innerHTML = '<div class="empty-cta" style="padding:40px;text-align:center;color:var(--muted)"><div style="font-size:48px">👤</div><p>受験者を選択するとプロフィールが開きます</p></div>';
    renderProfileTabbar();
  }
  function renderProfileTabbar() {
    const bar = document.getElementById('profile-tabbar');
    if (!bar) return;
    const tabs = getProfileTabs();
    const list = Storage.loadForSession();
    const active = _uiState.profileId;
    if (tabs.length === 0) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = tabs.map(tid => {
      const c = list.find(x => x.id === tid);
      if (!c) return '';
      const name = fullName(c) || '(無名)';
      const eid = c.examineeId ? `<span class="ptab-id">${escapeHtml(c.examineeId)}</span>` : '';
      const isActive = tid === active;
      return `<div class="ptab ${isActive ? 'active' : ''}" data-id="${tid}" role="tab" tabindex="0" aria-selected="${isActive}">
        ${eid}<span class="ptab-name">${escapeHtml(name)}</span>
        <button type="button" class="ptab-close" data-close="${tid}" aria-label="${escapeHtml(name)} のタブを閉じる" title="タブを閉じる">×</button>
      </div>`;
    }).join('');
    bar.querySelectorAll('.ptab').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.ptab-close')) return;
        openProfileTab(el.dataset.id);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfileTab(el.dataset.id); }
      });
    });
    bar.querySelectorAll('.ptab-close').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); closeProfileTab(b.dataset.close); });
    });
  }

  function renderProfile(id) {
    const sess = getSession();
    const c = Storage.loadForSession().find(x => x.id === id);
    const body = $('#profile-body');
    const printBtn = document.getElementById('print-profile');
    if (printBtn) {
      printBtn.disabled = !c;
      printBtn.title = c ? '印刷' : '受験者を選択すると印刷できます';
    }
    if (!c) { body.innerHTML = ''; return; }
    const ac = Stats.scoreAcademic(c, sess.academicTest);
    const sv = Stats.surveyAvg(c, sess.surveyTest);
    const total = Stats.totalScore(c, sess);
    const radar = Stats.radarData(c, sess);

    body.innerHTML = `
      <nav class="profile-nav">
        <a href="#sec-summary" class="profile-nav-link">📋 概要</a>
        <a href="#sec-radar" class="profile-nav-link">📊 レーダー</a>
        <a href="#sec-resume" class="profile-nav-link">📄 履歴書</a>
        <a href="#sec-academic" class="profile-nav-link">📚 学力</a>
        <a href="#sec-survey" class="profile-nav-link">📋 アンケート</a>
        <a href="#sec-interview" class="profile-nav-link">🎤 面接</a>
      </nav>
      <div class="profile-card" id="sec-summary">
        <div class="profile-head">
          ${c.photo ? `<img class="avatar-lg" src="${c.photo}" alt="顔写真">` : '<div class="avatar-lg avatar-blank">👤</div>'}
          <div style="flex:1;min-width:200px">
            <div class="profile-name">${escapeHtml(fullName(c))}</div>
            <div class="profile-meta">${escapeHtml(fullKana(c))}</div>
            <div class="profile-meta">受験番号: ${escapeHtml(c.examineeId || '')} ・ ${c.gender ? '🚻 ' + escapeHtml(c.gender) + ' ・ ' : ''}${calcAge(c.birthdate) != null ? `🎂 ${calcAge(c.birthdate)}歳 ・ ` : ''}${escapeHtml(c.faculty || '')} ${escapeHtml(c.department || '')} ${escapeHtml(c.grade || '')}</div>
            <div style="margin-top:10px"><label class="pass-toggle"><input type="checkbox" id="profile-pass" ${c.passed ? 'checked' : ''}> <span>🏆 この受験者を合格にする</span></label></div>
            <div class="profile-submissions">
              <span class="ps-item ${c.applicationSubmittedAt ? 'ps-done' : 'ps-miss'}">①📝 申込: ${c.applicationSubmittedAt ? formatDate(c.applicationSubmittedAt) : '未'}</span>
              <span class="ps-item ${c.resumeSubmittedAt ? 'ps-done' : 'ps-miss'}">②📄 履歴書: ${c.resumeSubmittedAt ? formatDate(c.resumeSubmittedAt) : '未'}</span>
              <span class="ps-item ${c.surveySubmittedAt ? 'ps-done' : 'ps-miss'}">②📋 アンケート: ${c.surveySubmittedAt ? formatDate(c.surveySubmittedAt) : '未'}</span>
              <span class="ps-item ${c.academicSubmittedAt ? 'ps-done' : 'ps-miss'}">③📚 学力: ${c.academicSubmittedAt ? formatDate(c.academicSubmittedAt) : '未'}</span>
              <span class="ps-item ${Stats.hasInterview(c) ? 'ps-done' : 'ps-miss'}">④🎤 面接: ${Stats.hasInterview(c) ? `実施済 (${Stats.interviewCount(c)}件)` : '未実施'}</span>
            </div>
          </div>
          <div>
            <div class="score-badges">
              <span class="score-badge alt">学力 ${Stats.hasAcademic(c) ? ac.percent.toFixed(1) + '% (' + ac.total + ' / ' + ac.max + '点)' : '未'}</span>
              <span class="score-badge warn">アンケート ${Stats.hasSurvey(c) ? sv.toFixed(2) + ' / 5.00' : '未'}</span>
              <span class="score-badge interview">面接 ${Stats.hasInterview(c) ? Stats.interviewAvg(c, sess).toFixed(2) + ' / 5.00' : '未'}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2" id="sec-radar">
        <div class="profile-card"><h3>学力試験レーダー（カテゴリ別正答率%）</h3><canvas id="profile-radar-academic" height="280"></canvas></div>
        <div class="profile-card"><h3>アンケート傾向</h3><canvas id="profile-radar-survey" height="280"></canvas></div>
      </div>

      <div class="profile-card" id="sec-resume">
        <h3>📄 履歴書情報</h3>
        <div class="form-grid">
          <div><dt>生年月日</dt><dd>${escapeHtml(c.birthdate || '')}${calcAge(c.birthdate) != null ? ` <span class="muted">(${calcAge(c.birthdate)}歳)</span>` : ''}</dd></div>
          <div><dt>性別</dt><dd>${escapeHtml(c.gender || '')}</dd></div>
          <div><dt>メール</dt><dd>${c.email ? `<a href="mailto:${encodeURIComponent(c.email).replace(/%40/g,'@')}" title="メールを送信">${escapeHtml(c.email)}</a>` : ''}</dd></div>
          <div><dt>電話</dt><dd>${c.phone ? `<a href="tel:${encodeURIComponent(c.phone.replace(/[^0-9+\-]/g,''))}" title="電話をかける">${escapeHtml(c.phone)}</a>` : ''}</dd></div>
          <div><dt>GPA</dt><dd>${c.gpa ?? ''}</dd></div>
          <div class="full"><dt>取得資格・スキル</dt><dd>${(normalizeQualifications(c.qualifications).map(q => `<span class="qual-chip">${escapeHtml(q)}</span>`).join('') || '<span class="muted">なし</span>')}</dd></div>
          <div class="full"><dt>サークル・部活動</dt><dd>${escapeHtml(c.club || '') || '<span class="muted">なし</span>'}</dd></div>
        </div>
        ${(c.history && c.history.length) ? `
          <h4 style="margin-top:14px">学歴・職歴・受賞歴</h4>
          <table class="history-table">
            <tbody>${c.history.map(h => `<tr><td class="history-year">${h.year || ''}${h.month ? ' 年 ' + h.month + ' 月' : (h.year ? ' 年' : '')}</td><td>${escapeHtml(h.content || '')}</td></tr>`).join('')}</tbody>
          </table>
        ` : ''}
        <h4 style="margin-top:14px">志望動機</h4><p>${escapeHtml(c.motivation || '')}</p>
        <h4>自己PR</h4><p>${escapeHtml(c.selfPr || '')}</p>
        <h4>研究したいテーマ</h4><p>${escapeHtml(c.researchTopic || '')}</p>
        ${(sess.resumeExtraFields || []).map(f => `<h4>${escapeHtml(f.label)}</h4><p>${escapeHtml(c.extra?.[f.id] || '')}</p>`).join('')}
      </div>

      <div class="profile-card" id="sec-academic">
        <h3>📚 学力試験 回答内訳</h3>
        ${Stats.hasAcademic(c) ? renderAcademicReview(c, sess) : '<p class="muted">未受験</p>'}
      </div>

      <div class="profile-card" id="sec-survey">
        <h3>📋 アンケート 自由記述</h3>
        <h4>力を入れた活動</h4><p>${escapeHtml(c.freeAchievement || '')}</p>
        <h4>挑戦したいこと</h4><p>${escapeHtml(c.freeAspiration || '')}</p>
      </div>

      <div class="profile-card" id="sec-interview">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <h3 style="margin:0">🎤 面接記録 ${Stats.interviewCount(c) > 0 ? `<span class="muted" style="font-size:13px">(${Stats.interviewCount(c)}件)</span>` : ''}</h3>
          <button class="btn primary" id="edit-interview">＋ 面接記録を追加</button>
        </div>
        ${renderInterviewView(c)}
      </div>
    `;

    document.getElementById('edit-interview').addEventListener('click', () => openInterviewEditor(c.id));
    // Profile section scroll-spy (highlight active TOC link)
    const sections = ['sec-summary', 'sec-radar', 'sec-resume', 'sec-academic', 'sec-survey', 'sec-interview']
      .map(id => document.getElementById(id)).filter(Boolean);
    const links = document.querySelectorAll('.profile-nav-link');
    function updateActiveLink() {
      let activeId = sections[0]?.id;
      const offset = 200;
      sections.forEach(sec => { if (sec.getBoundingClientRect().top < offset) activeId = sec.id; });
      links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + activeId));
    }
    updateActiveLink();
    window.removeEventListener('scroll', window._profileScrollSpy);
    window._profileScrollSpy = updateActiveLink;
    window.addEventListener('scroll', window._profileScrollSpy);
    // Interview radar — show each interviewer + average overlay (session-aware categories)
    if (Stats.hasInterview(c)) {
      const ivCtx = document.getElementById('profile-radar-interview');
      const sessForIv = getSession();
      const ratingsIv = Stats.getInterviewRatings(sessForIv);
      const catAvgs = Stats.interviewCategoryAvgs(c, sessForIv);
      const recs = Stats.interviewRecords(c);
      const recColors = ['#06b6d4', '#f59e0b', '#ec4899', '#84cc16', '#ef4444'];
      const datasets = [];
      if (recs.length > 1) {
        recs.forEach((r, i) => {
          datasets.push({
            label: r.interviewer || `面接官${i + 1}`,
            data: ratingsIv.map(k => Number(r.ratings?.[k.key]) || 0),
            backgroundColor: 'transparent',
            borderColor: recColors[i % recColors.length],
            borderDash: [4, 3],
            borderWidth: 1.5,
            pointRadius: 3,
            pointBackgroundColor: recColors[i % recColors.length]
          });
        });
      }
      datasets.push({
        label: recs.length > 1 ? `★平均 (${recs.length}人)` : '評価',
        data: ratingsIv.map(r => catAvgs[r.key] || 0),
        backgroundColor: 'rgba(139,92,246,.25)',
        borderColor: '#8b5cf6',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: '#8b5cf6'
      });
      if (ivCtx) {
        const ivOpts = radarChartOptions(5, 1);
        ivOpts.plugins.legend = { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: chartPalette().text } };
        new Chart(ivCtx, {
          type: 'radar',
          data: { labels: ratingsIv.map(r => truncateLabel(r.label, 10)), datasets },
          options: ivOpts
        });
      }
    }
    document.getElementById('profile-pass').addEventListener('change', e => {
      const list = Storage.load();
      const rec = list.find(x => x.id === c.id);
      if (rec) { rec.passed = e.target.checked; Storage.save(list); renderOverview(); }
    });

    new Chart($('#profile-radar-academic'), {
      type: 'radar',
      data: { labels: radar.labels.map(l => truncateLabel(l, 10)), datasets: [{ label: fullName(c), data: radar.data, backgroundColor: 'rgba(79,70,229,.2)', borderColor: '#4f46e5', pointBackgroundColor: '#4f46e5', borderWidth: 2, pointRadius: 4, pointHoverRadius: 6 }] },
      options: radarChartOptions(100, 20)
    });
    new Chart($('#profile-radar-survey'), {
      type: 'radar',
      data: {
        labels: (sess.surveyTest?.questions || []).map(q => truncateLabel(q.text, 10)),
        datasets: [{ label: 'アンケート', data: Stats.surveyVector(c, sess), backgroundColor: 'rgba(245,158,11,.2)', borderColor: '#f59e0b', pointBackgroundColor: '#f59e0b' }]
      },
      options: radarChartOptions(5, 1)
    });
  }

  function renderInterviewView(c) {
    const sess = getSession();
    const ratings = Stats.getInterviewRatings(sess);
    const recs = Stats.interviewRecords(c);
    if (recs.length === 0) return '<p class="muted" style="padding:10px">面接記録はまだありません。「＋ 面接記録を追加」から登録できます。</p>';
    const avg = Stats.interviewAvg(c, sess);
    const catAvgs = Stats.interviewCategoryAvgs(c, sess);
    const disagree = Stats.interviewDisagreement(c, sess);

    const catHeader = `<div class="iv-rating-row iv-rating-head">
      <span>評価項目</span>
      <span class="iv-col-avg">平均</span>
      ${recs.length > 1 ? '<span class="iv-col-range">範囲（最低〜最高）</span>' : ''}
    </div>`;
    const catRows = ratings.map(r => {
      const perRec = recs.map(rec => Number(rec.ratings?.[r.key]) || 0).filter(v => v > 0);
      const minV = perRec.length ? Math.min(...perRec) : 0;
      const maxV = perRec.length ? Math.max(...perRec) : 0;
      const rngDisplay = recs.length > 1
        ? `<span class="iv-col-range">${perRec.length ? (minV === maxV ? `<span class="muted" style="font-size:11px">全員一致 ${minV}</span>` : `${minV} 〜 ${maxV}`) : '—'}</span>`
        : '';
      return `<div class="iv-rating-row"><span>${escapeHtml(r.label)}</span><span class="iv-col-avg"><strong>${(catAvgs[r.key] || 0).toFixed(2)}</strong> / 5.00</span>${rngDisplay}</div>`;
    }).join('');

    return `
      <div class="iv-summary">
        <div class="iv-meta">
          <div><span class="iv-k">面接実施数</span><span class="iv-v"><strong>${recs.length}件</strong></span></div>
          <div><span class="iv-k">総合評価<small style="color:var(--muted);font-size:10px">${recs.length > 1 ? `（全${recs.length}人×全${ratings.length}項目の平均）` : `（全${ratings.length}項目の平均）`}</small></span><span class="iv-v"><strong style="color:var(--primary)">${avg.toFixed(2)} / 5.00</strong></span></div>
          ${recs.length > 1 ? `<div><span class="iv-k">面接官間ばらつき<small style="color:var(--muted);font-size:10px">（標準偏差・0=全員一致）</small></span><span class="iv-v" title="各面接官の総合評価の標準偏差。0に近いほど一致">${disagree.toFixed(2)} ${disagree >= 0.5 ? '<span style="color:var(--warn);font-size:11px">⚠評価に差あり</span>' : '<span style="color:var(--accent);font-size:11px">✓概ね一致</span>'}</span></div>` : ''}
        </div>
        <div class="grid-2" style="margin-top:10px">
          <div>
            <canvas id="profile-radar-interview" height="240"></canvas>
          </div>
          <div>
            <h4 style="margin-top:0">評価項目別の集計${recs.length > 1 ? `（${recs.length}名分）` : ''}</h4>
            ${catHeader}
            ${catRows}
          </div>
        </div>
        <h4 style="margin-top:14px">面接記録一覧（${recs.length}件・各面接官の評価）</h4>
        ${recs.map((r, i) => {
          const ratingVals = ratings.map(k => Number(r.ratings?.[k.key]) || 0).filter(v => v > 0);
          const ravg = ratingVals.length ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : 0;
          const sum = ratingVals.reduce((a, b) => a + b, 0);
          return `
          <div class="iv-record-card">
            <div class="iv-record-head">
              <strong>面接 ${i + 1}: ${escapeHtml(r.interviewer || '（面接官未記入）')}</strong>
              <span class="iv-rec-avg">この面接官の評価: <strong>${ravg.toFixed(2)} / 5.00</strong> <span class="muted" style="font-size:11px">(${sum}/${ratingVals.length * 5}点)</span></span>
              <span class="muted" style="font-size:12px">${formatDate(r.heldAt)}</span>
            </div>
            <div class="iv-record-ratings">
              ${ratings.map(k => `<span class="iv-rec-rating"><span class="muted">${escapeHtml(k.label)}:</span> <strong>${Number(r.ratings?.[k.key]) || '—'}</strong></span>`).join('')}
            </div>
            ${r.notes ? `<div class="iv-record-notes">${escapeHtml(r.notes)}</div>` : ''}
          </div>
        `;}).join('')}
      </div>
    `;
  }

  function openInterviewEditor(candId, recordId) {
    const c = Storage.load().find(x => x.id === candId);
    if (!c) return;
    const records = Stats.interviewRecords(c);
    const editing = recordId ? records.find(r => r.id === recordId) : null;
    const iv = editing || {};
    const heldAtVal = iv.heldAt ? toLocalInputValue(iv.heldAt) : toLocalInputValue(new Date().toISOString());
    const existing = document.getElementById('interview-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'interview-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'interview-modal-title');
    modal.innerHTML = `
      <div class="modal-window" style="max-width:720px">
        <div class="modal-head">
          <h3 style="margin:0" id="interview-modal-title">🎤 面接記録 — ${escapeHtml(fullName(c))}</h3>
          <button class="btn modal-close" aria-label="面接記録ダイアログを閉じる">✕</button>
        </div>
        <div class="modal-body" style="display:block">
          ${records.length > 0 && !editing ? `
            <h4 style="margin-top:0">既存の面接記録（${records.length}件）</h4>
            <div class="iv-record-mgr">
              ${records.map(r => `
                <div class="iv-record-mgr-row">
                  <div>
                    <strong>${escapeHtml(r.interviewer || '（未記入）')}</strong>
                    <span class="muted" style="font-size:12px"> ・ ${formatDate(r.heldAt)}</span>
                  </div>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-icon" data-edit-rec="${r.id}" title="編集">✏</button>
                    <button class="btn btn-icon danger" data-del-rec="${r.id}" title="削除">🗑</button>
                  </div>
                </div>
              `).join('')}
            </div>
            <hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">
          ` : ''}
          <h4 style="margin-top:0">${editing ? '面接記録を編集' : '新規面接記録'}</h4>
          <div class="form-grid">
            <label>面接日時<input type="datetime-local" id="iv-heldAt" value="${heldAtVal}"></label>
            <label>面接官名<input type="text" id="iv-interviewer" value="${escapeHtml(iv.interviewer || '')}" placeholder="例: 山田 太郎"></label>
          </div>
          <h4 style="margin-top:14px">評価（1〜5）</h4>
          <div class="iv-rating-grid">
            ${Stats.getInterviewRatings(getSession()).map(r => `
              <div class="iv-rating-edit">
                <label>${escapeHtml(r.label)}</label>
                <div class="iv-scale">
                  ${[1,2,3,4,5].map(v => `<label><input type="radio" name="iv-${r.key}" value="${v}" ${Number(iv.ratings?.[r.key]) === v ? 'checked' : ''}>${v}</label>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
          <h4 style="margin-top:14px">所見・メモ</h4>
          <textarea id="iv-notes" rows="4" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px">${escapeHtml(iv.notes || '')}</textarea>
          <div class="form-actions" style="margin-top:14px;justify-content:flex-end">
            <button class="btn" id="iv-cancel">キャンセル</button>
            <button class="btn primary" id="iv-save">${editing ? '更新' : '保存'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#iv-cancel').addEventListener('click', close);

    // Edit existing record
    modal.querySelectorAll('[data-edit-rec]').forEach(b => b.addEventListener('click', () => {
      close();
      openInterviewEditor(candId, b.dataset.editRec);
    }));
    // Delete existing record
    modal.querySelectorAll('[data-del-rec]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('この面接記録を削除しますか？')) return;
      const updated = Storage.load();
      const rec = updated.find(x => x.id === candId);
      const recs = Stats.interviewRecords(rec);
      const idx = recs.findIndex(r => r.id === b.dataset.delRec);
      if (idx >= 0) {
        recs.splice(idx, 1);
        rec.interview = rec.interview || {};
        rec.interview.records = recs;
        delete rec.interview.heldAt; delete rec.interview.interviewer; delete rec.interview.ratings; delete rec.interview.notes;
        Storage.save(updated);
        close();
        renderProfile(candId);
        renderOverview();
        if (recs.length > 0) toast('面接記録を削除しました', 'success', 1500);
      }
    }));

    modal.querySelector('#iv-save').addEventListener('click', () => {
      const ratings = {};
      Stats.getInterviewRatings(getSession()).forEach(r => {
        const sel = modal.querySelector(`input[name="iv-${r.key}"]:checked`);
        ratings[r.key] = sel ? Number(sel.value) : 0;
      });
      const heldAt = localInputToIso(modal.querySelector('#iv-heldAt').value) || new Date().toISOString();
      const interviewer = modal.querySelector('#iv-interviewer').value.trim();
      const notes = modal.querySelector('#iv-notes').value.trim();
      const updated = Storage.load();
      const rec = updated.find(x => x.id === candId);
      const existingRecs = Stats.interviewRecords(rec);
      rec.interview = rec.interview || {};
      // Clear legacy fields if any
      delete rec.interview.heldAt; delete rec.interview.interviewer; delete rec.interview.ratings; delete rec.interview.notes;
      if (editing) {
        // update existing
        const idx = existingRecs.findIndex(r => r.id === editing.id);
        if (idx >= 0) existingRecs[idx] = { id: editing.id, heldAt, interviewer, ratings, notes };
      } else {
        existingRecs.push({ id: 'iv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5), heldAt, interviewer, ratings, notes });
      }
      rec.interview.records = existingRecs;
      Storage.save(updated);
      close();
      renderProfile(candId);
      renderOverview();
      toast(editing ? '面接記録を更新しました' : `面接記録を追加しました（合計${existingRecs.length}件）`, 'success', 2000);
    });
  }

  function renderAcademicReview(c, sess) {
    return `<table class="data-table"><thead><tr><th>#</th><th>問題</th><th>回答</th><th>正解</th><th>得点</th></tr></thead><tbody>` +
      sess.academicTest.questions.map((q, i) => {
        const a = c.academicAnswers?.[q.id];
        const correct = a !== undefined && Number(a) === q.correctIndex;
        return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(q.text)}</td>
          <td>${a !== undefined ? escapeHtml(q.choices[a]) : '—'}</td>
          <td>${escapeHtml(q.choices[q.correctIndex])}</td>
          <td class="num">${correct ? q.points : 0}/${q.points}</td>
        </tr>`;
      }).join('') + `</tbody></table>`;
  }

  // ===== Portal =====
  function renderPortal() {
    const sess = ensureTests(getSession());
    const portalCards = $('#portal-cards');
    const idInput = $('#portal-examinee-id');
    const isCandidateMode = document.body.classList.contains('candidate-mode');
    const idRow = document.querySelector('.portal-id-row');
    const introP = document.querySelector('.portal-intro > p');

    let examineeId;
    let cand;

    if (isCandidateMode) {
      // 候補者モード: URLから来た受験番号で固定。検索不可
      examineeId = (idInput.value || '').trim();
      cand = examineeId ? Storage.findByExamineeId(sess.id, examineeId) : null;
      if (idRow) idRow.style.display = 'none';
      // 申込ポータル（公開URL）の場合は名前なし
      const params = new URLSearchParams(location.search);
      if (params.get('phase') === 'application') {
        if (introP) introP.textContent = '受験申込フォームです。下記の項目をご入力ください。';
        portalCards.innerHTML = '';
        $('#portal-status').textContent = '';
        // フォームを直接開く
        openPortalForm('application');
        return;
      }
      if (introP) introP.textContent = `${cand ? fullName(cand) + ' さん用の' : ''}受験ページです。受付中の試験をクリックしてご回答ください。`;
    } else {
      // 管理者モード: 検索は許可しない（プライバシー）
      if (idRow) idRow.style.display = 'none';
      if (introP) introP.innerHTML = '⚠ <strong>受験ポータルは個別配布URLからのみアクセス可能</strong>です。<br>各受験者にメッセージを送るには <strong>設定 → 履歴書 → 📨 配布メッセージ</strong> セクションをご利用ください。受験者専用URLの「プレビュー」ボタンからも本人のポータルを開いて動作確認できます。';
      portalCards.innerHTML = '';
      $('#portal-status').textContent = '';
      // すべてのフォームも閉じる
      ['portal-resume', 'portal-academic', 'portal-survey'].forEach(id => { const el = $('#' + id); if (el) el.style.display = 'none'; });
      return;
    }
    $('#portal-status').textContent = examineeId ? (cand ? '本人確認OK' : '') : '';

    const phases = [
      { key: 'resume',   icon: '📄', title: '履歴書記入', done: cand && Stats.hasResume(cand), doneAt: cand?.resumeSubmittedAt },
      { key: 'academic', icon: '📚', title: '学力試験',   done: cand && Stats.hasAcademic(cand), doneAt: cand?.academicSubmittedAt, requiresResume: true },
      { key: 'survey',   icon: '📋', title: 'アンケート', done: cand && Stats.hasSurvey(cand), doneAt: cand?.surveySubmittedAt, requiresResume: true }
    ];
    portalCards.innerHTML = phases.map(p => {
      const open = Storage.isPhaseOpen(sess, p.key);
      const blocked = p.requiresResume && !(cand && Stats.hasResume(cand)) && p.key !== 'resume';
      const statusText = Storage.phaseStatusText(sess, p.key);
      const status = !open ? statusText : p.done ? '提出済' : blocked ? '履歴書を先に提出してください' : statusText;
      const cls = !open ? 'closed' : p.done ? 'done' : blocked ? 'blocked' : 'open';
      const clickable = open && !blocked && (p.key === 'resume' || examineeId);
      return `<div class="portal-card ${cls}" data-phase="${p.key}" ${clickable ? '' : 'data-disabled="1"'}>
        <div class="pc-icon">${p.icon}</div>
        <div class="pc-title">${p.title}</div>
        <div class="pc-status">${status}</div>
        ${p.doneAt ? `<div class="pc-meta">${formatDate(p.doneAt)}</div>` : ''}
      </div>`;
    }).join('');
    portalCards.querySelectorAll('.portal-card').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.disabled) return;
        openPortalForm(el.dataset.phase);
      });
    });
  }

  function openPortalForm(phase) {
    const sess = ensureTests(getSession());
    ['portal-application', 'portal-resume', 'portal-academic', 'portal-survey'].forEach(id => { const el = $('#' + id); if (el) el.style.display = 'none'; });
    const idInput = $('#portal-examinee-id');
    const examineeId = (idInput.value || '').trim();
    const cand = Storage.findByExamineeId(sess.id, examineeId);

    if (phase === 'application') {
      const sec = $('#portal-application');
      sec.style.display = 'block';
      // 学部・学科セレクトを充填（カスケード）
      const fSel = sec.querySelector('select[name="faculty"]');
      const dSel = sec.querySelector('select[name="department"]');
      fSel.innerHTML = '<option value="">-- 学部を選択 --</option>' + (sess.facultyDept || []).map(f => `<option value="${escapeHtml(f.name)}">${escapeHtml(f.name)}</option>`).join('');
      function updateDepts() {
        const f = (sess.facultyDept || []).find(x => x.name === fSel.value);
        const depts = f?.departments || [];
        dSel.innerHTML = '<option value="">-- 学科を選択 --</option>' + depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
      }
      updateDepts();
      fSel.addEventListener('change', updateDepts);
      sec.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (phase === 'resume') {
      $('#portal-resume').style.display = 'block';
      const form = $('#form-resume');
      form.reset();
      populateFacultySelects(form, cand);
      if (cand) {
        ['examineeId', 'lastName', 'firstName', 'lastKana', 'firstKana', 'birthdate', 'gender', 'email', 'phone', 'grade', 'gpa', 'club', 'motivation', 'selfPr', 'researchTopic'].forEach(k => {
          if (form.elements[k]) form.elements[k].value = cand[k] || '';
        });
      } else if (examineeId) {
        form.elements.examineeId.value = examineeId;
      }
      // 候補者モードでは受験番号変更不可
      if (document.body.classList.contains('candidate-mode')) {
        form.elements.examineeId.readOnly = true;
      }
      // Photo
      setPhotoPreview(cand?.photo || '');
      form.elements.photo.value = cand?.photo || '';
      // Qualifications as tags
      const quals = normalizeQualifications(cand?.qualifications);
      renderQualTags(quals);
      // 学歴・職歴
      setHistoryFromCandidate(cand);
      // Build extra fields
      const extraWrap = $('#form-resume-custom');
      const extraWrapper = document.getElementById('form-resume-custom-wrap');
      extraWrap.innerHTML = '';
      const extras = sess.resumeExtraFields || [];
      extraWrapper.style.display = extras.length ? 'block' : 'none';
      extras.forEach(f => {
        const lbl = document.createElement('label');
        lbl.className = 'full';
        lbl.innerHTML = `${escapeHtml(f.label)}${f.type === 'textarea' ? `<textarea data-extra-id="${f.id}" rows="3"></textarea>` : `<input type="text" data-extra-id="${f.id}">`}`;
        const inp = lbl.querySelector('[data-extra-id]');
        if (cand?.extra?.[f.id]) inp.value = cand.extra[f.id];
        extraWrap.appendChild(lbl);
      });
      $('#portal-resume').scrollIntoView({ behavior: 'smooth' });
    }
    if (phase === 'academic') {
      if (!cand) { alert('まず履歴書を提出してください。'); return; }
      $('#portal-academic').style.display = 'block';
      $('#form-academic').elements.examineeId.value = cand.examineeId;
      // タイマー表示
      startAcademicCountdown(sess);
      const wrap = $('#academic-questions');
      wrap.innerHTML = sess.academicTest.questions.map((q, i) => `
        <div class="exam-q">
          <div class="exam-q-head"><span class="q-num">問${i + 1}</span> <span class="q-cat">${escapeHtml(q.category || '')}</span> <span class="q-pt">${q.points}点</span></div>
          <div class="exam-q-text">${escapeHtml(q.text)}</div>
          <div class="exam-q-choices">
            ${q.choices.map((ch, j) => `<label class="choice"><input type="radio" name="ans_${q.id}" value="${j}" required>${escapeHtml(ch)}</label>`).join('')}
          </div>
        </div>
      `).join('');
      $('#portal-academic').scrollIntoView({ behavior: 'smooth' });
    }
    if (phase === 'survey') {
      if (!cand) { alert('まず履歴書を提出してください。'); return; }
      $('#portal-survey').style.display = 'block';
      $('#form-survey').elements.examineeId.value = cand.examineeId;
      $('#form-survey-id-display').value = cand.examineeId;
      const wrap = $('#survey-questions');
      wrap.innerHTML = sess.surveyTest.questions.map(q => `
        <div class="survey-item">
          <div class="q">${escapeHtml(q.text)}</div>
          <div class="scale">
            ${[1, 2, 3, 4, 5].map(v => `<label><input type="radio" name="sv_${q.id}" value="${v}" required>${v}</label>`).join('')}
          </div>
        </div>
      `).join('');
      $('#portal-survey').scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Generate a tiny SVG-based avatar (data URL) — used for demo data so storage stays small
  function generateAvatarDataUrl(name, gender) {
    const palette = ['#4f46e5', '#059669', '#f59e0b', '#dc2626', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const color = palette[Math.abs(hash) % palette.length];
    const initial = (name || '?').slice(0, 1);
    const accent = gender === '女性' ? '#fda4af' : (gender === '男性' ? '#93c5fd' : '#d1d5db');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140">` +
      `<rect width="120" height="140" fill="${accent}"/>` +
      `<circle cx="60" cy="55" r="28" fill="${color}"/>` +
      `<path d="M20 140 C20 100, 100 100, 100 140 Z" fill="${color}" opacity="0.9"/>` +
      `<text x="60" y="68" font-size="32" font-family="sans-serif" font-weight="700" fill="white" text-anchor="middle">${initial}</text>` +
      `</svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }

  // ===== Resume history rows (学歴・職歴) =====
  let _currentHistory = [];
  function renderHistoryRows() {
    const wrap = document.getElementById('history-rows');
    if (!wrap) return;
    wrap.innerHTML = _currentHistory.length === 0
      ? '<p class="muted" style="font-size:12px;margin:0 0 8px">まだ履歴がありません。下の「＋ 行を追加」から記入してください。</p>'
      : _currentHistory.map((h, i) => `
        <div class="history-row">
          <input type="number" class="hr-year" min="1980" max="2100" value="${h.year || ''}" placeholder="年" data-idx="${i}" data-field="year">
          <span class="hr-sep">年</span>
          <input type="number" class="hr-month" min="1" max="12" value="${h.month || ''}" placeholder="月" data-idx="${i}" data-field="month">
          <span class="hr-sep">月</span>
          <input type="text" class="hr-content" value="${escapeHtml(h.content || '')}" placeholder="例: 〇〇高等学校 卒業 / 〇〇株式会社 入社" data-idx="${i}" data-field="content">
          <button type="button" class="btn btn-icon danger" data-hr-del="${i}" title="削除">×</button>
        </div>
      `).join('');
    wrap.querySelectorAll('[data-idx]').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.dataset.idx);
        if (inp.dataset.field === 'content') _currentHistory[idx].content = inp.value;
        else _currentHistory[idx][inp.dataset.field] = inp.value ? Number(inp.value) : null;
      });
    });
    wrap.querySelectorAll('[data-hr-del]').forEach(b => b.addEventListener('click', () => {
      _currentHistory.splice(Number(b.dataset.hrDel), 1);
      renderHistoryRows();
    }));
  }
  function addHistoryRow() {
    _currentHistory.push({ year: null, month: null, content: '' });
    renderHistoryRows();
  }
  function setHistoryFromCandidate(c) {
    _currentHistory = (c?.history || []).map(h => ({ ...h }));
    renderHistoryRows();
  }
  function getHistoryForSave() {
    return _currentHistory
      .filter(h => h.year || h.content)
      .map(h => ({ year: h.year || null, month: h.month || null, content: (h.content || '').trim() }))
      .sort((a, b) => (a.year || 0) - (b.year || 0) || (a.month || 0) - (b.month || 0));
  }

  // ===== Photo handling =====
  function setPhotoPreview(dataUrl) {
    const wrap = document.getElementById('photo-preview');
    const clearBtn = document.getElementById('photo-clear');
    if (!wrap) return;
    if (dataUrl) {
      wrap.innerHTML = `<img src="${dataUrl}" alt="顔写真">`;
      if (clearBtn) clearBtn.style.display = 'inline-flex';
    } else {
      wrap.innerHTML = '<span class="photo-placeholder">📷<br>顔写真</span>';
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }
  function handlePhotoUpload(file) {
    const r = new FileReader();
    r.onload = e => {
      // Resize to max 320x320 to keep localStorage small
      const img = new Image();
      img.onload = () => {
        const maxSide = 320;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setPhotoPreview(dataUrl);
        document.querySelector('#form-resume [name="photo"]').value = dataUrl;
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  }

  // ===== Qualifications (tag input) =====
  function normalizeQualifications(q) {
    if (!q) return [];
    if (Array.isArray(q)) return q.slice();
    return String(q).split(/[,、\n]/).map(s => s.trim()).filter(Boolean);
  }
  let _currentQuals = [];
  function renderQualTags(quals) {
    _currentQuals = quals || [];
    const wrap = document.getElementById('qual-tags');
    if (!wrap) return;
    wrap.innerHTML = _currentQuals.map((q, i) =>
      `<span class="qual-tag">${escapeHtml(q)}<button type="button" data-qrm="${i}" aria-label="削除">×</button></span>`
    ).join('') || '<span class="muted" style="font-size:11px">資格が登録されていません</span>';
    wrap.querySelectorAll('[data-qrm]').forEach(b => b.addEventListener('click', () => {
      _currentQuals.splice(Number(b.dataset.qrm), 1);
      renderQualTags(_currentQuals);
    }));
  }
  function addQualFromInput() {
    const input = document.getElementById('qual-input');
    const v = (input.value || '').trim();
    if (!v) return;
    v.split(/[,、\n]/).map(s => s.trim()).filter(Boolean).forEach(s => {
      if (!_currentQuals.includes(s)) _currentQuals.push(s);
    });
    input.value = '';
    renderQualTags(_currentQuals);
  }

  function populateFacultySelects(form, cand) {
    const sess = getSession();
    const fSel = form.querySelector('select[name="faculty"]');
    const dSel = form.querySelector('select[name="department"]');
    if (!fSel || !dSel) return;
    fSel.innerHTML = '<option value="">-- 学部を選択 --</option>' +
      (sess.facultyDept || []).map(f => `<option value="${escapeHtml(f.name)}" ${cand?.faculty === f.name ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
    function updateDepartments() {
      const facultyName = fSel.value;
      const faculty = (sess.facultyDept || []).find(f => f.name === facultyName);
      const depts = faculty?.departments || [];
      dSel.innerHTML = '<option value="">-- 学科を選択 --</option>' +
        depts.map(d => `<option value="${escapeHtml(d)}" ${cand?.department === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('');
    }
    updateDepartments();
    fSel.addEventListener('change', updateDepartments);
  }

  function nextExamineeId(sessionId) {
    const list = Storage.loadForSession(sessionId);
    const year = new Date().getFullYear();
    const prefix = 'Z' + year;
    const existing = list.map(c => c.examineeId)
      .filter(id => id && id.startsWith(prefix))
      .map(id => parseInt(id.slice(prefix.length), 10))
      .filter(n => !isNaN(n));
    const next = (existing.length ? Math.max(...existing) : 0) + 1;
    return prefix + String(next).padStart(3, '0');
  }

  function submitApplication(e) {
    e.preventDefault();
    const sess = ensureTests(getSession());
    if (!Storage.isPhaseOpen(sess, 'application')) { alert('受験申込の受付期間外です。'); return; }
    const form = e.target;
    const fd = new FormData(form);
    const data = {};
    fd.forEach((v, k) => data[k] = v);
    // メアド重複チェック
    const existing = Storage.loadForSession(sess.id).find(c => c.email && c.email === data.email);
    if (existing) {
      alert('このメールアドレスは既に申込済みです。重複の場合は事務局までご連絡ください。');
      return;
    }
    data.examineeId = nextExamineeId(sess.id);
    data.applicationSubmittedAt = new Date().toISOString();
    const saved = Storage.upsert(data);
    form.reset();
    // 完了画面
    document.getElementById('portal-application').innerHTML = `
      <div class="card" style="background:#dcfce7;border-color:#86efac;text-align:center;padding:30px">
        <h2 style="color:#166534">✅ 受験申込を受け付けました</h2>
        <p>${escapeHtml(saved.lastName)} ${escapeHtml(saved.firstName)} 様</p>
        <p>あなたの受験番号は <strong style="font-size:24px;color:var(--primary);font-family:monospace">${escapeHtml(saved.examineeId)}</strong> です。</p>
        <p class="muted" style="font-size:13px">後日、メールアドレス <strong>${escapeHtml(saved.email)}</strong> 宛に専用URL・パスワードをお送りし、履歴書／学力試験／アンケートの提出をご案内します。</p>
        <p class="muted" style="font-size:12px;margin-top:20px">このページは閉じていただいて構いません。</p>
      </div>
    `;
  }

  function submitResume(e) {
    e.preventDefault();
    const sess = ensureTests(getSession());
    if (!Storage.isPhaseOpen(sess, 'resume')) { alert('履歴書の受付期間外です。'); return; }
    const form = e.target;
    const fd = new FormData(form);
    const data = {};
    fd.forEach((v, k) => data[k] = v);
    data.gpa = data.gpa ? Number(data.gpa) : null;
    data.qualifications = _currentQuals.slice();   // array
    data.history = getHistoryForSave();
    data.resumeSubmittedAt = new Date().toISOString();
    data.extra = Object.assign({}, Storage.findByExamineeId(sess.id, data.examineeId)?.extra || {});
    form.querySelectorAll('[data-extra-id]').forEach(inp => { data.extra[inp.dataset.extraId] = inp.value; });
    try {
      Storage.upsert(data);
    } catch (err) {
      if (String(err).includes('QuotaExceeded')) {
        alert('保存容量を超えました。顔写真を削除するか、不要な試験回を削除してください。');
        return;
      }
      throw err;
    }
    toast('履歴書を提出しました', 'success');
    $('#portal-resume').style.display = 'none';
    renderPortal();
    renderOverview();
  }

  let _acTimerInterval = null;
  function startAcademicCountdown(sess) {
    if (_acTimerInterval) clearInterval(_acTimerInterval);
    let banner = document.getElementById('academic-timer-banner');
    const formEl = document.getElementById('form-academic');
    const sec = document.getElementById('portal-academic');
    if (!banner && sec) {
      banner = document.createElement('div');
      banner.id = 'academic-timer-banner';
      banner.className = 'ac-timer';
      sec.insertBefore(banner, sec.firstChild.nextSibling);
    }
    const endsAtIso = sess.phaseSchedule?.academic?.endsAt;
    if (!endsAtIso) {
      if (banner) banner.style.display = 'none';
      return;
    }
    const endTs = new Date(endsAtIso).getTime();
    const graceMin = sess.academicTest?.graceMinutes ?? 5;
    const graceEnd = endTs + graceMin * 60000;
    function update() {
      const now = Date.now();
      const remain = endTs - now;
      if (remain > 0) {
        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        banner.className = 'ac-timer ' + (m < 5 ? 'warn' : 'ok');
        banner.innerHTML = `⏱ 試験残り時間 <strong>${m}分${String(s).padStart(2, '0')}秒</strong> ・ 終了 ${formatDateShort(endsAtIso)}`;
      } else if (now < graceEnd) {
        const r = graceEnd - now;
        const m = Math.floor(r / 60000);
        const s = Math.floor((r % 60000) / 1000);
        banner.className = 'ac-timer grace';
        banner.innerHTML = `⛔ 試験時間終了。提出のみ受付中 <strong>残り ${m}:${String(s).padStart(2, '0')}</strong>（猶予${graceMin}分）`;
      } else {
        banner.className = 'ac-timer expired';
        banner.innerHTML = `🔒 提出期限を過ぎました（${formatDateShort(new Date(graceEnd).toISOString())}）`;
        if (formEl) Array.from(formEl.querySelectorAll('input,button')).forEach(el => el.disabled = true);
        clearInterval(_acTimerInterval);
        _acTimerInterval = null;
      }
    }
    update();
    _acTimerInterval = setInterval(update, 1000);
  }

  function submitAcademic(e) {
    e.preventDefault();
    const sess = ensureTests(getSession());
    if (!Storage.isPhaseOpen(sess, 'academic')) { alert('学力試験の受付期間外です。'); return; }
    const form = e.target;
    const examineeId = form.elements.examineeId.value;
    const answers = {};
    sess.academicTest.questions.forEach(q => {
      const sel = form.querySelector(`input[name="ans_${q.id}"]:checked`);
      if (sel) answers[q.id] = Number(sel.value);
    });
    const result = Stats.scoreAcademic({ academicAnswers: answers }, sess.academicTest);
    Storage.upsert({ examineeId, academicAnswers: answers, academicScore: result, academicSubmittedAt: new Date().toISOString() });
    toast(`学力試験を提出しました（自動採点 ${result.total} / ${result.max}点・${result.percent.toFixed(1)}%）`, 'success', 5000);
    $('#portal-academic').style.display = 'none';
    renderPortal();
    renderOverview();
  }

  function submitSurvey(e) {
    e.preventDefault();
    const sess = ensureTests(getSession());
    if (!Storage.isPhaseOpen(sess, 'survey')) { alert('アンケートの受付期間外です。'); return; }
    const form = e.target;
    const examineeId = form.elements.examineeId.value;
    const answers = {};
    sess.surveyTest.questions.forEach(q => {
      const sel = form.querySelector(`input[name="sv_${q.id}"]:checked`);
      if (sel) answers[q.id] = Number(sel.value);
    });
    Storage.upsert({
      examineeId, surveyAnswers: answers,
      freeAchievement: form.elements.freeAchievement.value,
      freeAspiration: form.elements.freeAspiration.value,
      surveySubmittedAt: new Date().toISOString()
    });
    toast('アンケートを提出しました', 'success');
    $('#portal-survey').style.display = 'none';
    renderPortal();
    renderOverview();
  }

  // ===== Session info modal (session-bar から開く) =====
  function openSessionInfoModal() {
    const sess = getSession();
    if (!sess) return;
    const m = document.getElementById('session-info-modal');
    if (!m) return;
    $('#sim-name').value = sess.name || '';
    $('#sim-exam-date').value = sess.examDate || '';
    $('#sim-exam-location').value = sess.examLocation || '';
    $('#sim-target-pass').value = sess.targetPassCount ?? '';
    $('#sim-notes').value = sess.notes || '';
    m.style.display = 'flex';
    setTimeout(() => $('#sim-name')?.focus(), 0);
  }
  function closeSessionInfoModal() {
    const m = document.getElementById('session-info-modal');
    if (m) m.style.display = 'none';
  }
  function saveSessionInfoModal(e) {
    if (e) e.preventDefault();
    const sess = getSession();
    if (!sess) return;
    const num = (v) => {
      const s = String(v ?? '').trim();
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    Storage.updateSessionInfo(sess.id, {
      name: ($('#sim-name').value || '').trim() || sess.name,
      examDate: $('#sim-exam-date').value || '',
      examLocation: ($('#sim-exam-location').value || '').trim(),
      targetPassCount: num($('#sim-target-pass').value),
      notes: $('#sim-notes').value || ''
    });
    renderSessionBar();
    // admin の試験回情報フォームも追随
    try { if (document.getElementById('si-name')) renderSessionInfoMgr(); } catch (_) {}
    closeSessionInfoModal();
    toast('試験回の基本情報を保存しました', 'success', 2000);
  }

  // ===== Session info manager =====
  function renderSessionInfoMgr() {
    const sess = getSession();
    if (!sess) return;
    const setVal = (id, v) => { const el = $(id); if (el) el.value = (v ?? ''); };
    setVal('#si-name', sess.name || '');
    setVal('#si-exam-date', sess.examDate || '');
    setVal('#si-exam-location', sess.examLocation || '');
    setVal('#si-target-pass', sess.targetPassCount ?? '');
    setVal('#si-notes', sess.notes || '');
    const status = $('#si-saved-status');
    if (status) status.textContent = '';
  }
  function saveSessionInfoForm(e) {
    if (e) e.preventDefault();
    const sess = getSession();
    if (!sess) return;
    const num = (v) => {
      const s = String(v ?? '').trim();
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    const payload = {
      name: ($('#si-name').value || '').trim() || sess.name,
      examDate: $('#si-exam-date').value || '',
      examLocation: ($('#si-exam-location').value || '').trim(),
      targetPassCount: num($('#si-target-pass').value),
      notes: $('#si-notes').value || ''
    };
    Storage.updateSessionInfo(sess.id, payload);
    renderSessionBar();
    const status = $('#si-saved-status');
    if (status) {
      const t = new Date();
      const pad = n => String(n).padStart(2, '0');
      status.textContent = `✅ 保存しました（${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}）`;
      setTimeout(() => { if (status.textContent.startsWith('✅')) status.textContent = ''; }, 4000);
    }
  }

  // ===== Question editors =====
  function renderAcademicMgr() {
    const sess = ensureTests(getSession());
    renderPhaseShare('academic', 'view-mgr-academic');
    // Load grace minutes + deadline info
    const graceInput = document.getElementById('academic-grace-min');
    if (graceInput) graceInput.value = sess.academicTest?.graceMinutes ?? 5;
    const infoEl = document.getElementById('academic-deadline-info');
    if (infoEl) {
      const endsAt = sess.phaseSchedule?.academic?.endsAt;
      if (endsAt) {
        const grace = sess.academicTest?.graceMinutes ?? 5;
        const graceEnd = new Date(new Date(endsAt).getTime() + grace * 60000);
        infoEl.innerHTML = `📅 現在の試験終了時刻: <strong>${formatDate(endsAt)}</strong> ・ 提出受付終了: <strong>${formatDate(graceEnd.toISOString())}</strong>（+${grace}分）`;
      } else {
        infoEl.innerHTML = '⚠ 受付制御に「学力試験 終了日時」が未設定です。<a href="#" data-jump-to-receipt>受付制御へ移動</a>';
        const lnk = infoEl.querySelector('[data-jump-to-receipt]');
        if (lnk) lnk.addEventListener('click', e => { e.preventDefault(); showAdminview('resume'); showResumeview('control'); });
      }
    }
    const wrap = $('#academic-q-list');
    if (!wrap) return;
    $('#academic-q-count').textContent = `現在 ${sess.academicTest.questions.length} 問 / 合計 ${sess.academicTest.questions.reduce((s, q) => s + (q.points || 0), 0)} 点`;
    if (sess.academicTest.questions.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📚</div>
          <p>問題がまだありません</p>
          <p class="muted">「＋ 問題を追加」または「デフォルト問題に戻す」から始めてください</p>
        </div>`;
      wireAcademicEditor();
      return;
    }
    wrap.innerHTML = sess.academicTest.questions.map((q, idx) => `
      <div class="q-edit-card" data-idx="${idx}">
        <div class="q-edit-head">
          <span class="q-edit-num">問${idx + 1}</span>
          <input class="q-edit-cat" type="text" value="${escapeHtml(q.category || '')}" placeholder="カテゴリ" data-field="category">
          <input class="q-edit-pt" type="number" value="${q.points}" min="1" placeholder="配点" data-field="points">
          <button class="btn danger" data-act="del-academic">削除</button>
        </div>
        <textarea data-field="text" rows="2" placeholder="問題文">${escapeHtml(q.text)}</textarea>
        <div class="q-edit-choices">
          ${q.choices.map((c, j) => `
            <div class="q-choice">
              <input type="radio" name="correct_${idx}" ${q.correctIndex === j ? 'checked' : ''} data-correct="${j}">
              <input type="text" value="${escapeHtml(c)}" data-choice="${j}" placeholder="選択肢">
              <button class="btn" data-act="del-choice-academic" data-choice-idx="${j}">×</button>
            </div>
          `).join('')}
        </div>
        <div class="q-edit-actions">
          <button class="btn" data-act="add-choice-academic">＋選択肢を追加</button>
        </div>
      </div>
    `).join('') || '<p class="muted">問題がありません。「問題を追加」ボタンから作成してください。</p>';
    wireAcademicEditor();
  }
  function wireAcademicEditor() {
    const sess = getSession();
    const wrap = $('#academic-q-list');
    wrap.querySelectorAll('.q-edit-card').forEach(card => {
      const idx = Number(card.dataset.idx);
      const q = sess.academicTest.questions[idx];
      card.querySelectorAll('[data-field]').forEach(inp => {
        inp.addEventListener('change', () => {
          q[inp.dataset.field] = inp.dataset.field === 'points' ? Number(inp.value) || 0 : inp.value;
          saveSession(sess);
        });
      });
      card.querySelectorAll('[data-choice]').forEach(inp => {
        inp.addEventListener('change', () => {
          q.choices[Number(inp.dataset.choice)] = inp.value;
          saveSession(sess);
        });
      });
      card.querySelectorAll('[data-correct]').forEach(rb => {
        rb.addEventListener('change', () => { if (rb.checked) { q.correctIndex = Number(rb.dataset.correct); saveSession(sess); } });
      });
      card.querySelector('[data-act="del-academic"]')?.addEventListener('click', () => {
        if (!confirm('この問題を削除しますか？')) return;
        sess.academicTest.questions.splice(idx, 1); saveSession(sess); renderAcademicMgr();
      });
      card.querySelector('[data-act="add-choice-academic"]')?.addEventListener('click', () => {
        q.choices.push(''); saveSession(sess); renderAcademicMgr();
      });
      card.querySelectorAll('[data-act="del-choice-academic"]').forEach(b => {
        b.addEventListener('click', () => {
          const j = Number(b.dataset.choiceIdx);
          if (q.choices.length <= 2) { alert('選択肢は最低2つ必要です。'); return; }
          q.choices.splice(j, 1);
          if (q.correctIndex >= q.choices.length) q.correctIndex = 0;
          saveSession(sess); renderAcademicMgr();
        });
      });
    });
  }

  function renderSurveyMgr() {
    const sess = ensureTests(getSession());
    renderPhaseShare('survey', 'view-mgr-survey');
    const wrap = $('#survey-q-list');
    if (!wrap) return;
    $('#survey-q-count').textContent = `現在 ${sess.surveyTest.questions.length} 項目`;
    wrap.innerHTML = sess.surveyTest.questions.length === 0
      ? `<div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>アンケート項目がまだありません</p>
          <p class="muted">「＋ 項目を追加」または「デフォルト項目に戻す」から始めてください</p>
        </div>`
      : sess.surveyTest.questions.map((q, idx) => `
        <div class="q-edit-card" data-idx="${idx}">
          <div class="q-edit-head">
            <span class="q-edit-num">項目${idx + 1}</span>
            <button class="btn danger" data-act="del-survey">削除</button>
          </div>
          <textarea data-field="text" rows="2" placeholder="質問文">${escapeHtml(q.text)}</textarea>
        </div>
      `).join('');
    wrap.querySelectorAll('.q-edit-card').forEach(card => {
      const idx = Number(card.dataset.idx);
      const q = sess.surveyTest.questions[idx];
      card.querySelector('[data-field="text"]').addEventListener('change', e => { q.text = e.target.value; saveSession(sess); });
      card.querySelector('[data-act="del-survey"]').addEventListener('click', () => {
        if (!confirm('この項目を削除しますか？')) return;
        sess.surveyTest.questions.splice(idx, 1); saveSession(sess); renderSurveyMgr();
      });
    });
  }

  function renderResumeMgr() {
    const sess = ensureTests(getSession());
    renderFacultyDeptEditor(sess);
    // Load message template (auto-populate default if empty)
    const msgT = document.getElementById('msg-template');
    if (msgT) {
      if (!sess.messageTemplate || sess.messageTemplate.trim() === '') {
        sess.messageTemplate = DEFAULT_MSG_TEMPLATE;
        saveSession(sess);
      }
      msgT.value = sess.messageTemplate;
    }
    // Load application passcode
    const passInp = document.getElementById('app-passcode');
    if (passInp) passInp.value = sess.applicationPasscode || '';
    const wrap = $('#resume-fields-list');
    if (!wrap) return;
    wrap.innerHTML = (sess.resumeExtraFields || []).map((f, idx) => `
      <div class="q-edit-card" data-idx="${idx}">
        <div class="q-edit-head">
          <span class="q-edit-num">追加${idx + 1}</span>
          <select data-field="type">
            <option value="text" ${f.type === 'text' ? 'selected' : ''}>1行テキスト</option>
            <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>複数行テキスト</option>
          </select>
          <button class="btn danger" data-act="del-extra">削除</button>
        </div>
        <input type="text" data-field="label" value="${escapeHtml(f.label)}" placeholder="質問ラベル">
      </div>
    `).join('') || '<p class="muted">標準フィールド（受験番号・氏名・大学・GPA・志望動機など）のみが表示されています。必要に応じて追加質問を加えてください。</p>';
    wrap.querySelectorAll('.q-edit-card').forEach(card => {
      const idx = Number(card.dataset.idx);
      const f = sess.resumeExtraFields[idx];
      card.querySelectorAll('[data-field]').forEach(inp => inp.addEventListener('change', () => { f[inp.dataset.field] = inp.value; saveSession(sess); }));
      card.querySelector('[data-act="del-extra"]').addEventListener('click', () => {
        if (!confirm('この追加質問を削除しますか？')) return;
        sess.resumeExtraFields.splice(idx, 1); saveSession(sess); renderResumeMgr();
      });
    });
    renderPhaseShare('resume', 'view-mgr-resume');
  }

  // ===== Interview schedule manager =====
  function buildSlots(sch) {
    const slots = [];
    if (!sch?.startDate) return slots;
    const days = Number(sch.days) || 1;
    for (let d = 0; d < days; d++) {
      const date = new Date(sch.startDate + 'T00:00:00');
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().slice(0, 10);
      const [sh, sm] = sch.dailyStart.split(':').map(Number);
      const [eh, em] = sch.dailyEnd.split(':').map(Number);
      const dayStart = new Date(date); dayStart.setHours(sh, sm, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(eh, em, 0, 0);
      const bs = sch.breakStart ? sch.breakStart.split(':').map(Number) : null;
      const be = sch.breakEnd ? sch.breakEnd.split(':').map(Number) : null;
      const breakStart = bs ? new Date(date) : null; if (breakStart) breakStart.setHours(bs[0], bs[1], 0, 0);
      const breakEnd   = be ? new Date(date) : null; if (breakEnd)   breakEnd.setHours(be[0], be[1], 0, 0);
      const slotMs = (Number(sch.slotMinutes) || 30) * 60000;
      for (let t = dayStart.getTime(); t + slotMs <= dayEnd.getTime() + 1; t += slotMs) {
        // skip break range
        if (breakStart && breakEnd && t >= breakStart.getTime() && t < breakEnd.getTime()) continue;
        slots.push({ iso: new Date(t).toISOString(), dateStr });
      }
    }
    return slots;
  }

  function interviewStatus(c, sch) {
    if (!c.interview) return 'unscheduled';
    const slotMs = (Number(sch?.slotMinutes) || 30) * 60000;
    const recs = Stats.interviewRecords(c);
    if (recs.length > 0) {
      const firstHeld = recs[0].heldAt;
      if (firstHeld && c.interview.scheduledAt) {
        const lag = new Date(firstHeld) - new Date(c.interview.scheduledAt);
        if (lag > slotMs * 1.5) return 'done-late';
      }
      return 'done';
    }
    if (!c.interview.scheduledAt) return 'unscheduled';
    const now = Date.now();
    const t = new Date(c.interview.scheduledAt).getTime();
    if (now < t) return 'future';
    if (now >= t && now < t + slotMs) return 'now';
    return 'delayed';
  }

  const IV_STATUS_LABEL = { unscheduled: '未', future: '予定', now: '進行中', delayed: '⚠遅延中', done: '✅実施済', 'done-late': '⏰遅延で実施' };

  function renderInterviewRatingsEditor(sess) {
    const wrap = document.getElementById('iv-ratings-list');
    if (!wrap) return;
    // ユーザー独自デフォルト状態表示
    const statusEl = document.getElementById('iv-default-status');
    if (statusEl) {
      const userDefault = Storage.getDefaultInterviewRatings();
      statusEl.textContent = userDefault ? `✅ ユーザーデフォルト保存中 (${userDefault.length}項目)` : '（システム標準を使用）';
    }
    const ratings = sess.interviewRatings || [];
    wrap.innerHTML = ratings.length === 0
      ? '<p class="muted">評価項目がありません。デフォルトに戻すか追加してください。</p>'
      : ratings.map((r, idx) => `
        <div class="q-edit-card" data-idx="${idx}">
          <div class="q-edit-head">
            <span class="q-edit-num">項目${idx + 1}</span>
            <input type="text" data-iv-rate-label value="${escapeHtml(r.label)}" placeholder="評価項目名（例: 学業への取り組み）">
            <button class="btn danger" data-act="del-iv-rate">削除</button>
          </div>
          <div class="muted" style="font-size:11px;padding:0 4px">識別子: <code>${escapeHtml(r.key)}</code>（変更不可）</div>
        </div>
      `).join('');
    wrap.querySelectorAll('.q-edit-card').forEach(card => {
      const idx = Number(card.dataset.idx);
      card.querySelector('[data-iv-rate-label]').addEventListener('change', e => {
        ratings[idx].label = e.target.value;
        saveSession(sess);
        toast('評価項目を更新しました', 'success', 1500);
      });
      card.querySelector('[data-act="del-iv-rate"]').addEventListener('click', () => {
        if (!confirm(`「${ratings[idx].label}」を削除しますか？\n（既に登録された面接記録の数値は残ります）`)) return;
        ratings.splice(idx, 1);
        saveSession(sess);
        renderInterviewRatingsEditor(sess);
        toast('評価項目を削除しました', 'success', 1500);
      });
    });
  }

  function renderInterviewMgr() {
    const sess = ensureTests(getSession());
    renderInterviewRatingsEditor(sess);
    const sch = sess.interviewSchedule;
    $('#iv-sch-startDate').value = sch.startDate || '';
    $('#iv-sch-days').value = sch.days || 1;
    $('#iv-sch-dailyStart').value = sch.dailyStart || '09:00';
    $('#iv-sch-dailyEnd').value = sch.dailyEnd || '17:00';
    $('#iv-sch-slotMinutes').value = sch.slotMinutes || 30;
    $('#iv-sch-breakStart').value = sch.breakStart || '';
    $('#iv-sch-breakEnd').value = sch.breakEnd || '';
    renderInterviewTimeline();
  }

  function getScheduleConfig() {
    return {
      startDate: $('#iv-sch-startDate').value,
      days: Number($('#iv-sch-days').value) || 1,
      dailyStart: $('#iv-sch-dailyStart').value,
      dailyEnd: $('#iv-sch-dailyEnd').value,
      slotMinutes: Number($('#iv-sch-slotMinutes').value) || 30,
      breakStart: $('#iv-sch-breakStart').value || '',
      breakEnd: $('#iv-sch-breakEnd').value || ''
    };
  }

  function saveScheduleConfig() {
    const sess = getSession();
    sess.interviewSchedule = getScheduleConfig();
    saveSession(sess);
  }

  function renderInterviewTimeline() {
    const sess = getSession();
    const sch = sess.interviewSchedule;
    const slots = buildSlots(sch);
    const list = Storage.loadForSession();
    // group by slot
    const bySlot = {};
    list.forEach(c => { if (c.interview?.scheduledAt) bySlot[c.interview.scheduledAt] = c; });
    const unscheduled = list.filter(c => !c.interview?.scheduledAt);

    // group slots by day
    const days = {};
    slots.forEach(s => { (days[s.dateStr] = days[s.dateStr] || []).push(s); });

    const wrap = $('#iv-timeline-area');
    wrap.innerHTML = `
      <div class="iv-timeline-grid">
        <div class="iv-pool-col">
          <div class="iv-col-head">📦 未スケジュール (${unscheduled.length})</div>
          <div class="iv-drop-zone iv-pool" data-drop="pool">
            ${unscheduled.map(c => candidateCard(c, sch)).join('') || '<div class="iv-empty">全員配置済</div>'}
          </div>
        </div>
        ${Object.entries(days).map(([dateStr, daySlots]) => `
          <div class="iv-day-col">
            <div class="iv-col-head">📅 ${formatDateJ(dateStr)} <small>(${daySlots.length}枠)</small></div>
            <div class="iv-slots">
              ${daySlots.map(s => {
                const c = bySlot[s.iso];
                const t = s.iso;
                const hhmm = new Date(t).toTimeString().slice(0, 5);
                return `
                  <div class="iv-slot">
                    <div class="iv-time">${hhmm}</div>
                    <div class="iv-drop-zone" data-drop="slot" data-slot-iso="${t}">
                      ${c ? candidateCard(c, sch) : '<div class="iv-empty-slot">(空き枠)</div>'}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    wireInterviewDnD();
  }

  function candidateCard(c, sch) {
    const status = interviewStatus(c, sch);
    const cls = `iv-card status-${status}`;
    return `<div class="${cls}" draggable="true" data-id="${c.id}" title="クリックで面接記録を編集">
      ${c.photo ? `<img class="avatar-sm" src="${c.photo}" alt="">` : '<div class="avatar-sm avatar-blank">👤</div>'}
      <div class="iv-card-info">
        <div class="iv-card-name">${escapeHtml(fullName(c))}</div>
        <div class="iv-card-meta">${escapeHtml(c.examineeId || '')} <span class="iv-status-pill ${status}">${IV_STATUS_LABEL[status]}</span></div>
      </div>
    </div>`;
  }

  function wireInterviewDnD() {
    let draggedId = null;
    document.querySelectorAll('.iv-card[draggable="true"]').forEach(card => {
      card.addEventListener('dragstart', e => {
        draggedId = card.dataset.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', e => {
        if (e.target.closest('.iv-card')) {
          const id = card.dataset.id;
          openInterviewEditor(id);
        }
      });
    });
    document.querySelectorAll('.iv-drop-zone').forEach(zone => {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (!draggedId) return;
        const targetType = zone.dataset.drop;
        const list = Storage.load();
        const draggedRec = list.find(x => x.id === draggedId);
        if (!draggedRec) return;
        if (targetType === 'pool') {
          if (draggedRec.interview) { delete draggedRec.interview.scheduledAt; }
        } else if (targetType === 'slot') {
          const slotIso = zone.dataset.slotIso;
          // If slot is occupied, swap
          const occupant = list.find(x => x.interview?.scheduledAt === slotIso && x.id !== draggedId);
          const prevSchedule = draggedRec.interview?.scheduledAt || null;
          draggedRec.interview = draggedRec.interview || {};
          draggedRec.interview.scheduledAt = slotIso;
          if (occupant) {
            if (prevSchedule) { occupant.interview.scheduledAt = prevSchedule; }
            else { delete occupant.interview.scheduledAt; }
          }
        }
        Storage.save(list);
        renderInterviewTimeline();
      });
    });
  }

  function autoAllocateInterviews(mode = 'fill') {
    const sess = getSession();
    saveScheduleConfig();
    const sch = sess.interviewSchedule;
    const slots = buildSlots(sch).map(s => s.iso);
    if (slots.length === 0) { toast('⚠ 時間枠が0です。開始日・時間設定を確認してください', 'warn', 4500); return; }
    const list = Storage.load();
    const inSession = list.filter(c => c.sessionId === sess.id);
    if (mode === 'reallocate') {
      // Clear all scheduled
      inSession.forEach(c => { if (c.interview) delete c.interview.scheduledAt; });
    }
    // 未配置候補: scheduledAt 無し全員 (実施済も含めて再スケジュール可能とする)
    const unscheduled = inSession.filter(c => !c.interview?.scheduledAt)
      .sort((a, b) => (a.examineeId || '').localeCompare(b.examineeId || '', 'ja'));
    const skipped = unscheduled.filter(c => Stats.hasInterview(c)).length;
    const targets = unscheduled.filter(c => !Stats.hasInterview(c));
    // Find open slots
    const used = new Set(inSession.filter(c => c.interview?.scheduledAt).map(c => c.interview.scheduledAt));
    const openSlots = slots.filter(s => !used.has(s));
    let assigned = 0;
    targets.forEach((c, i) => {
      if (i >= openSlots.length) return;
      c.interview = c.interview || {};
      c.interview.scheduledAt = openSlots[i];
      assigned++;
    });
    Storage.save(list);
    renderInterviewTimeline();
    // 詳細フィードバック (toast でモバイルでも見やすく)
    if (assigned === 0 && skipped > 0 && targets.length === 0) {
      toast(`ℹ 未配置 ${skipped}名 は全員すでに面接実施済みのため配置不要`, 'info', 5000);
    } else if (assigned === 0 && openSlots.length === 0) {
      toast(`⚠ 空き枠なし。「全員を再配置」を試すか日数を増やしてください`, 'warn', 5000);
    } else {
      const parts = [`✅ ${assigned}名を配置`];
      if (targets.length - assigned > 0) parts.push(`枠不足で${targets.length - assigned}名未配置`);
      if (skipped > 0) parts.push(`実施済${skipped}名スキップ`);
      toast(parts.join(' / '), 'success', 4500);
    }
  }

  function clearAllSchedules() {
    if (!confirm('全員の面接予定をクリアします（面接記録は残ります）。よろしいですか？')) return;
    const list = Storage.load();
    list.forEach(c => { if (c.sessionId === Storage.getCurrentSessionId() && c.interview) delete c.interview.scheduledAt; });
    Storage.save(list);
    renderInterviewTimeline();
  }

  function formatDateJ(yyyymmdd) {
    const d = new Date(yyyymmdd + 'T00:00:00');
    const wd = ['日','月','火','水','木','金','土'][d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}(${wd})`;
  }

  // ===== Distribution message template =====
  function fillTemplate(template, candidate, sess) {
    const ivAt = candidate.interview?.scheduledAt || (Stats.interviewRecords(candidate)[0]?.heldAt);
    let ivDate = '', ivTime = '', ivDt = '';
    if (ivAt) {
      const d = new Date(ivAt);
      const pad = n => String(n).padStart(2, '0');
      ivDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      ivTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      ivDt = `${d.getMonth() + 1}/${d.getDate()} ${ivTime}`;
    }
    const vars = {
      name: fullName(candidate),
      lastName: candidate.lastName || '',
      firstName: candidate.firstName || '',
      examineeId: candidate.examineeId || '',
      password: candidate.password || '',
      url_resume: buildPhaseUrl('resume', candidate),
      url_academic: buildPhaseUrl('academic', candidate),
      url_survey: buildPhaseUrl('survey', candidate),
      interview_date: ivDate || '（未定）',
      interview_time: ivTime || '（未定）',
      interview_datetime: ivDt || '（未定）',
      sessionName: sess.name || ''
    };
    return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '{{' + k + '}}');
  }

  function generateAllMessages() {
    const sess = ensureTests(getSession());
    const template = document.getElementById('msg-template').value;
    sess.messageTemplate = template;
    saveSession(sess);
    const list = Storage.loadForSession();
    if (list.length === 0) { alert('受験者がいません。先に履歴書を登録するか、デモデータを投入してください。'); return; }
    const area = document.getElementById('msg-result-area');
    area.innerHTML = `
      <div class="msg-result-head">
        <strong>${list.length}名のメッセージを生成しました</strong>
        <button class="btn" id="msg-copy-all">📋 全員分をまとめてコピー</button>
      </div>
      <div class="msg-list">
        ${list.map(c => {
          const text = fillTemplate(template, c, sess);
          return `<div class="msg-item">
            <div class="msg-item-head">
              <strong>${escapeHtml(fullName(c))}</strong> <span class="muted">(${escapeHtml(c.examineeId || '')}) ・ パスワード: <code>${escapeHtml(c.password || '')}</code></span>
              <button class="btn btn-sm" data-msg-id="${c.id}">📋 コピー</button>
            </div>
            <pre class="msg-body" data-msg-body="${c.id}">${escapeHtml(text)}</pre>
          </div>`;
        }).join('')}
      </div>
    `;
    area.querySelectorAll('[data-msg-id]').forEach(b => {
      b.addEventListener('click', () => {
        const txt = area.querySelector(`[data-msg-body="${b.dataset.msgId}"]`).textContent;
        navigator.clipboard.writeText(txt).then(() => {
          b.textContent = '✅ コピー済';
          setTimeout(() => { b.textContent = '📋 コピー'; }, 1500);
        });
      });
    });
    document.getElementById('msg-copy-all').addEventListener('click', () => {
      const allTexts = list.map(c => `=== ${fullName(c)} (${c.examineeId}) ===\n${fillTemplate(template, c, sess)}`).join('\n\n---\n\n');
      navigator.clipboard.writeText(allTexts).then(() => toast('全員分をクリップボードにコピーしました', 'success'));
    });
  }

  const DEFAULT_MSG_TEMPLATE = `{{name}}さん

ゼミ入試のご案内です。下記の専用URLから各試験にアクセスしてください。

▼受験者情報
受験番号: {{examineeId}}
パスワード: {{password}}

▼履歴書
{{url_resume}}

▼学力試験
{{url_academic}}

▼アンケート
{{url_survey}}

▼面接予定
{{interview_datetime}}

ご不明な点は事務局までお問い合わせください。`;

  function renderFacultyDeptEditor(sess) {
    const wrap = $('#faculty-dept-list');
    if (!wrap) return;
    wrap.innerHTML = (sess.facultyDept || []).map((f, idx) => `
      <details class="q-edit-card collapsible-faculty" data-idx="${idx}">
        <summary class="fac-summary">
          <span class="q-edit-num">学部${idx + 1}</span>
          <span class="fac-summary-name">${escapeHtml(f.name)}</span>
          <span class="fac-summary-count">学科 ${(f.departments || []).length}</span>
        </summary>
        <div class="q-edit-head" style="margin-top:10px">
          <input type="text" data-faculty-name value="${escapeHtml(f.name)}" placeholder="学部名（例: 経済学部）">
          <button class="btn danger" data-act="del-faculty">学部を削除</button>
        </div>
        <div class="dept-list">
          <div class="dept-label">学科:</div>
          ${(f.departments || []).map((d, j) => `
            <div class="dept-row">
              <input type="text" data-dept="${j}" value="${escapeHtml(d)}" placeholder="学科名">
              <button class="btn" data-act="del-dept" data-dept-idx="${j}">×</button>
            </div>
          `).join('')}
          <button class="btn" data-act="add-dept">＋ 学科を追加</button>
        </div>
      </details>
    `).join('') || '<p class="muted">学部が登録されていません。</p>';
    wrap.querySelectorAll('.q-edit-card').forEach(card => {
      const idx = Number(card.dataset.idx);
      const f = sess.facultyDept[idx];
      card.querySelector('[data-faculty-name]').addEventListener('change', e => { f.name = e.target.value; saveSession(sess); });
      card.querySelectorAll('[data-dept]').forEach(inp => inp.addEventListener('change', () => { f.departments[Number(inp.dataset.dept)] = inp.value; saveSession(sess); }));
      card.querySelector('[data-act="del-faculty"]').addEventListener('click', () => {
        if (!confirm(`「${f.name}」を削除しますか？`)) return;
        sess.facultyDept.splice(idx, 1); saveSession(sess); renderFacultyDeptEditor(sess);
      });
      card.querySelector('[data-act="add-dept"]').addEventListener('click', () => {
        f.departments.push('新しい学科'); saveSession(sess); renderFacultyDeptEditor(sess);
      });
      card.querySelectorAll('[data-act="del-dept"]').forEach(b => b.addEventListener('click', () => {
        f.departments.splice(Number(b.dataset.deptIdx), 1); saveSession(sess); renderFacultyDeptEditor(sess);
      }));
    });
  }

  function saveSession(sess) {
    const list = Storage.loadSessions();
    const idx = list.findIndex(s => s.id === sess.id);
    if (idx >= 0) { list[idx] = sess; Storage.saveSessions(list); }
  }

  // ===== Share URLs =====
  function buildPhaseUrl(phase, candidate) {
    const sess = getSession();
    const base = location.href.split('?')[0].split('#')[0];
    if (candidate && candidate.password) {
      return `${base}?session=${encodeURIComponent(sess.id)}&phase=${phase}&id=${encodeURIComponent(candidate.examineeId)}&pwd=${encodeURIComponent(candidate.password)}`;
    }
    if (phase === 'application' && sess.applicationPasscode) {
      return `${base}?session=${encodeURIComponent(sess.id)}&phase=application&pass=${encodeURIComponent(sess.applicationPasscode)}`;
    }
    return `${base}?session=${encodeURIComponent(sess.id)}&phase=${phase}`;
  }
  function renderPhaseShare(phase, containerId) {
    // For 'resume' phase target the resumeview-apply sub-tab container
    const targetId = phase === 'resume' ? 'resumeview-apply' : containerId;
    const container = document.getElementById(targetId);
    if (!container) return;
    // Remove from both potential locations
    document.querySelectorAll('.share-section').forEach(el => {
      if (el.dataset.phase === phase) el.remove();
    });
    const section = document.createElement('div');
    section.className = 'card share-section';
    section.dataset.phase = phase;
    if (phase === 'resume') {
      const sess = getSession();
      const url = buildPhaseUrl('application');
      const hasPass = !!sess.applicationPasscode;
      section.innerHTML = `
        <h3>🌐 受験申込ポータル（公開URL）</h3>
        <p class="hint">${hasPass ? '🔐 <strong>合言葉付き</strong>のURLです。アクセス時に合言葉の入力が求められます。' : '⚠ 現在 <strong>合言葉なし</strong>。誰でもアクセス可能です。「🔐 受験申込の合言葉」で設定できます。'}</p>
        <div class="share-grid">
          <div class="share-card">
            <h4>📝 受験申込フォーム ${hasPass ? '<span class="pin-badge">🔐 合言葉付</span>' : ''}</h4>
            <div class="share-url">${escapeHtml(url)}</div>
            ${hasPass ? `<div class="muted" style="font-size:12px;margin-bottom:6px">合言葉: <code>${escapeHtml(sess.applicationPasscode)}</code></div>` : ''}
            <div class="share-actions">
              <button class="btn" data-copy-app>URLをコピー</button>
              <a class="btn" href="${escapeHtml(url)}" target="_blank">プレビュー</a>
            </div>
            <div class="qr-area" id="qr-application"></div>
          </div>
        </div>
        <p class="hint" style="margin-top:14px">💡 申込後に届く <strong>受験者ごとの個別URL（履歴書・学力・アンケート）</strong>は下記「📨 配布メッセージ」から生成・送信してください。</p>
      `;
      container.insertBefore(section, container.firstChild);
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      document.getElementById('qr-application').innerHTML = qr.createImgTag(4, 8);
      section.querySelector('[data-copy-app]').addEventListener('click', () => {
        navigator.clipboard.writeText(url).then(() => toast('URLをコピーしました', 'success'));
      });
    } else {
      section.innerHTML = `<p class="hint" style="margin:0">🔗 受験者ごとのアクセスURL・パスワード・配布用メッセージは <strong>設定 → 履歴書</strong> タブの「📨 配布メッセージ」セクションで生成・コピーできます。</p>`;
      container.insertBefore(section, container.firstChild);
    }
  }

  // ===== URL routing (candidate mode) =====
  function handleUrlMode() {
    const params = new URLSearchParams(location.search);
    const sid = params.get('session');
    const phase = params.get('phase');
    const idParam = params.get('id');
    const pinParam = params.get('pin');
    const pwdParam = params.get('pwd');
    if (!sid || !phase) return false;
    const sessions = Storage.loadSessions();
    const sess = sessions.find(s => s.id === sid);
    if (!sess) { alert('指定された試験回が見つかりません。'); return false; }
    // 'application' phase: optional passcode (合言葉) protection
    if (phase === 'application') {
      if (sess.applicationPasscode) {
        const passParam = params.get('pass');
        let pass = passParam;
        if (!pass || pass !== sess.applicationPasscode) {
          pass = prompt('受験申込フォームへアクセスするには合言葉が必要です。\n配布された合言葉を入力してください:');
          if (!pass || pass !== sess.applicationPasscode) { alert('合言葉が正しくありません。'); return false; }
        }
      }
    } else
    // Per-candidate password check (preferred). Fallback to legacy session-wide PIN.
    if (idParam && pwdParam) {
      const cand = Storage.findByExamineeId(sid, idParam);
      if (!cand || cand.password !== pwdParam) {
        alert('受験番号またはパスワードが正しくありません。');
        return false;
      }
    } else if ((phase === 'academic' || phase === 'survey') && sess.pin && !pwdParam) {
      // Backward compat: session PIN
      let pin = pinParam;
      if (!pin || pin !== sess.pin) {
        pin = prompt(`この試験を受けるにはアクセス情報が必要です（${PHASE_LABEL[phase]}）。配布されたPIN/パスワードを入力してください:`);
        if (!pin || pin !== sess.pin) { alert('認証に失敗しました。'); return false; }
      }
    }
    Storage.setCurrentSessionId(sid);
    document.body.classList.add('candidate-mode');
    // Hide admin chrome
    $('.session-bar').style.display = 'none';
    $('.tabs').style.display = 'none';
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-portal').classList.add('active');
    renderSessionBar();
    renderPortal();
    if (idParam) {
      $('#portal-examinee-id').value = idParam;
      renderPortal();
    }
    setTimeout(() => openPortalForm(phase), 50);
    return true;
  }

  // ===== CSV import/export for paper-based responses =====
  function toCsv(rows) {
    const esc = v => {
      const s = String(v ?? '');
      if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    return rows.map(r => r.map(esc).join(',')).join('\r\n');
  }
  function downloadCsv(filename, rows) {
    const csv = '﻿' + toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  function parseCsv(text) {
    const rows = [];
    let cur = [], val = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { val += '"'; i++; }
        else if (c === '"') inQ = false;
        else val += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { cur.push(val); val = ''; }
        else if (c === '\n') { cur.push(val); rows.push(cur); cur = []; val = ''; }
        else if (c === '\r') { /* skip */ }
        else val += c;
      }
    }
    if (val || cur.length) { cur.push(val); rows.push(cur); }
    return rows.filter(r => r.length && r.some(v => v.trim() !== ''));
  }
  function csvToObjects(text) {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
      return obj;
    });
  }

  // --- Template generators ---
  // 日本語ラベル → 内部キーの対応（履歴書）
  const RESUME_LABEL_TO_KEY = {
    '受験番号': 'examineeId', '姓': 'lastName', '名': 'firstName',
    '姓フリガナ': 'lastKana', '名フリガナ': 'firstKana',
    '性別': 'gender', 'メールアドレス': 'email', '電話番号': 'phone',
    '学部': 'faculty', '学科': 'department', '学年': 'grade',
    '生年月日': 'birthdate', 'GPA': 'gpa', 'サークル': 'club',
    '志望動機': 'motivation', '自己PR': 'selfPr', '研究テーマ': 'researchTopic',
    '取得資格': 'qualifications'
  };

  function downloadResumeTemplate() {
    const headers = ['受験番号', '姓', '名', '姓フリガナ', '名フリガナ', '性別', 'メールアドレス', '電話番号', '学部', '学科', '学年'];
    const sample  = ['Z2026001', '佐藤', '太郎', 'サトウ', 'タロウ', '男性', 'sato@example.com', '090-1234-5678', '商学部', '商学科', '2年'];
    downloadCsv(`履歴書テンプレート_${todayStr()}.csv`, [headers, sample]);
  }

  function downloadAcademicTemplate() {
    const sess = ensureTests(getSession());
    const qs = sess.academicTest.questions;
    // 人間が読める日本語ヘッダー（問1, 問2, ...）。パーサーは位置で照合
    const headers = ['受験番号', ...qs.map((q, i) => `問${i + 1}${q.category ? `(${q.category})` : ''}`)];
    const sample  = ['Z2026001', ...qs.map(q => String(q.correctIndex + 1))];
    downloadCsv(`学力試験テンプレート_${todayStr()}.csv`, [headers, sample]);
  }

  function downloadSurveyTemplate() {
    const sess = ensureTests(getSession());
    const qs = sess.surveyTest.questions;
    const headers = ['受験番号', ...qs.map((_, i) => `項目${i + 1}`), '力を入れた活動', '挑戦したいこと'];
    const sample  = ['Z2026001', ...qs.map(() => '4'), '学園祭実行委員', '実データを使った研究'];
    downloadCsv(`アンケートテンプレート_${todayStr()}.csv`, [headers, sample]);
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  // --- Import handlers ---
  function importResumeCsv(file) {
    readFileAsText(file).then(text => {
      const rows = parseCsv(text.replace(/^﻿/, ''));
      // Skip leading comment rows starting with '#'
      while (rows.length && rows[0][0] && rows[0][0].startsWith('#')) rows.shift();
      if (rows.length < 2) { alert('データ行が見つかりません。'); return; }
      const headers = rows[0].map(h => h.trim());
      let added = 0, updated = 0;
      // ヘッダーを内部キーに変換（日本語ラベル → key、未知のラベルはそのまま使用）
      const keyHeaders = headers.map(h => RESUME_LABEL_TO_KEY[h] || h);
      rows.slice(1).forEach(r => {
        const obj = {};
        // 空欄は既存データを上書きしない（CSVは部分更新として動作）
        keyHeaders.forEach((h, i) => { const v = (r[i] ?? '').trim(); if (v !== '') obj[h] = v; });
        if (!obj.examineeId) return;
        if (obj.gpa) obj.gpa = Number(obj.gpa);
        if (obj.qualifications) obj.qualifications = obj.qualifications.split(/[、,]/).map(s => s.trim()).filter(Boolean);
        obj.resumeSubmittedAt = new Date().toISOString();
        const existed = Storage.findByExamineeId(Storage.getCurrentSessionId(), obj.examineeId);
        Storage.upsert(obj);
        if (existed) updated++; else added++;
      });
      toast(`履歴書を取り込みました（新規 ${added}名 / 更新 ${updated}名）`, 'success', 4000);
      renderOverview();
    });
  }

  function importAcademicCsv(file) {
    readFileAsText(file).then(text => {
      const sess = ensureTests(getSession());
      const rows = parseCsv(text.replace(/^﻿/, ''));
      while (rows.length && rows[0][0] && rows[0][0].startsWith('#')) rows.shift();
      if (rows.length < 2) { alert('データ行が見つかりません。'); return; }
      // 位置ベース: 1列目=受験番号, 2列目以降=問1, 問2, ... (session の問題順)
      // 後方互換: ヘッダーが q_xxx 形式なら従来通りキー照合も試す
      const headers = rows[0].map(h => h.trim());
      const qIds = sess.academicTest.questions.map(q => q.id);
      const usingLegacyKeys = headers.slice(1).every(h => qIds.includes(h));
      let imported = 0, skipped = 0;
      rows.slice(1).forEach(r => {
        const examineeId = (r[0] || '').trim();
        if (!examineeId) return;
        const answers = {};
        if (usingLegacyKeys) {
          headers.slice(1).forEach((qid, i) => {
            const v = (r[i + 1] || '').trim(); if (!v) return;
            const idx = Number(v) - 1; if (idx >= 0) answers[qid] = idx;
          });
        } else {
          qIds.forEach((qid, i) => {
            const v = (r[i + 1] || '').trim(); if (!v) return;
            const idx = Number(v) - 1; if (idx >= 0) answers[qid] = idx;
          });
        }
        if (Object.keys(answers).length === 0) { skipped++; return; }
        const result = Stats.scoreAcademic({ academicAnswers: answers }, sess.academicTest);
        Storage.upsert({ examineeId, academicAnswers: answers, academicScore: result, academicSubmittedAt: new Date().toISOString() });
        imported++;
      });
      toast(`学力試験を取り込みました（${imported}名）` + (skipped ? ` / 空行スキップ ${skipped}名` : ''), 'success', 4000);
      renderOverview();
    });
  }

  function importSurveyCsv(file) {
    readFileAsText(file).then(text => {
      const sess = ensureTests(getSession());
      const rows = parseCsv(text.replace(/^﻿/, ''));
      while (rows.length && rows[0][0] && rows[0][0].startsWith('#')) rows.shift();
      if (rows.length < 2) { alert('データ行が見つかりません。'); return; }
      const headers = rows[0].map(h => h.trim());
      const qIds = sess.surveyTest.questions.map(q => q.id);
      // 位置ベース: 1列目=受験番号, 2〜=各項目, 末尾2列=自由記述
      // 後方互換: ヘッダーが q_xxx 形式ならキー照合
      const usingLegacyKeys = headers.slice(1).some(h => qIds.includes(h) || h === 'freeAchievement' || h === 'freeAspiration');
      let imported = 0;
      rows.slice(1).forEach(r => {
        const examineeId = (r[0] || '').trim();
        if (!examineeId) return;
        const answers = {};
        const payload = { examineeId, surveyAnswers: answers, surveySubmittedAt: new Date().toISOString() };
        if (usingLegacyKeys) {
          qIds.forEach(qid => {
            const idx = headers.indexOf(qid);
            if (idx >= 0) { const v = Number(r[idx]); if (!isNaN(v)) answers[qid] = v; }
          });
          const freeIdx1 = headers.indexOf('freeAchievement');
          const freeIdx2 = headers.indexOf('freeAspiration');
          if (freeIdx1 >= 0) payload.freeAchievement = r[freeIdx1] || '';
          if (freeIdx2 >= 0) payload.freeAspiration = r[freeIdx2] || '';
        } else {
          qIds.forEach((qid, i) => { const v = Number(r[i + 1]); if (!isNaN(v)) answers[qid] = v; });
          payload.freeAchievement = r[qIds.length + 1] || '';
          payload.freeAspiration = r[qIds.length + 2] || '';
        }
        Storage.upsert(payload);
        imported++;
      });
      toast(`アンケートを取り込みました（${imported}名）`, 'success', 4000);
      renderOverview();
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsText(file, 'UTF-8');
    });
  }

  // ===== Demo =====
  function seedDemo() {
    const name = `デモデータ ${new Date().toISOString().slice(0, 10)}`;
    const sess = Storage.addSession(name, { resume: true, academic: true, survey: true });
    Storage.setCurrentSessionId(sess.id);
    ensureTests(getSession());
    const live = getSession();
    // demo interview schedule = today
    live.interviewSchedule.startDate = new Date().toISOString().slice(0, 10);
    live.interviewSchedule.days = 2;
    saveSession(live);

    const facDeptList = live.facultyDept || Stats.DEFAULT_FACULTY_DEPT;
    const names = [
      ['佐藤', '大輔', 'サトウ', 'ダイスケ'], ['田中', '美咲', 'タナカ', 'ミサキ'], ['鈴木', '健', 'スズキ', 'ケン'],
      ['高橋', '優子', 'タカハシ', 'ユウコ'], ['伊藤', '翔', 'イトウ', 'ショウ'], ['渡辺', '葵', 'ワタナベ', 'アオイ'],
      ['山本', '直樹', 'ヤマモト', 'ナオキ'], ['中村', 'さくら', 'ナカムラ', 'サクラ'], ['小林', '蓮', 'コバヤシ', 'レン'],
      ['加藤', '結衣', 'カトウ', 'ユイ'], ['吉田', '颯太', 'ヨシダ', 'ソウタ'], ['山田', '凛', 'ヤマダ', 'リン'],
      ['佐々木', '陽', 'ササキ', 'ヨウ'], ['松本', '美月', 'マツモト', 'ミヅキ'], ['井上', '拓海', 'イノウエ', 'タクミ'],
      ['木村', '莉子', 'キムラ', 'リコ'], ['林', '大和', 'ハヤシ', 'ヤマト'], ['清水', '紗良', 'シミズ', 'サラ'],
      ['山崎', '蒼', 'ヤマザキ', 'ソウ'], ['森', '結菜', 'モリ', 'ユウナ']
    ];
    // candidate behavior profiles for richer clusters
    const profiles = [
      // high academic, high survey
      { acAcc: 0.85, sv: 4.3 },
      // mid academic, very high survey (people skills)
      { acAcc: 0.55, sv: 4.7 },
      // balanced
      { acAcc: 0.70, sv: 3.8 },
      // very high academic, low survey
      { acAcc: 0.92, sv: 2.8 }
    ];
    names.forEach((n, i) => {
      const p = profiles[i % profiles.length];
      // resume
      const fac = facDeptList[i % facDeptList.length];
      const dept = fac.departments[(i * 3) % fac.departments.length];
      const gender = i % 2 ? '女性' : '男性';
      const cand = {
        examineeId: 'Z' + String(2026001 + i),
        lastName: n[0], firstName: n[1], lastKana: n[2], firstKana: n[3],
        photo: generateAvatarDataUrl(n[0] + n[1], gender),
        birthdate: `200${3 + (i % 5)}-0${1 + (i % 9)}-1${i % 9}`,
        gender: gender,
        email: `applicant${i + 1}@example.com`, phone: `090-${1000 + i}-${1000 + i}`,
        faculty: fac.name,
        department: dept,
        grade: ['1年', '2年', '3年', '4年'][i % 4],
        gpa: Number((2.0 + Math.random() * 2).toFixed(2)),
        qualifications: i % 3 === 0 ? ['TOEIC 750', '簿記2級'] : (i % 4 === 0 ? ['Python', 'Excel VBA'] : []),
        club: ['軽音楽部', 'テニスサークル', 'ボランティアサークル', 'バスケットボール部', '〇〇研究会', '映画研究部'][i % 6],
        motivation: 'データ分析を通じて社会課題を解決したいと考えています。',
        selfPr: 'チームでの企画運営経験があり、議論をまとめるのが得意です。',
        researchTopic: '消費者行動と購買データの関係',
        resumeSubmittedAt: new Date().toISOString()
      };
      // academic answers
      const answers = {};
      live.academicTest.questions.forEach(q => {
        const correct = Math.random() < p.acAcc;
        answers[q.id] = correct ? q.correctIndex : (q.correctIndex + 1 + Math.floor(Math.random() * (q.choices.length - 1))) % q.choices.length;
      });
      const score = Stats.scoreAcademic({ academicAnswers: answers }, live.academicTest);
      cand.academicAnswers = answers;
      cand.academicScore = score;
      cand.academicSubmittedAt = new Date().toISOString();
      // survey
      const sa = {};
      live.surveyTest.questions.forEach(q => {
        const v = Math.round(p.sv + (Math.random() - 0.5) * 1.4);
        sa[q.id] = Math.max(1, Math.min(5, v));
      });
      cand.surveyAnswers = sa;
      cand.freeAchievement = '学園祭実行委員として広報を担当しました。';
      cand.freeAspiration = '実データを用いたゼミ研究プロジェクトに挑戦したい。';
      cand.surveySubmittedAt = new Date().toISOString();
      // Interview record (mix: scheduled+done / scheduled-only / unscheduled)
      // Schedule all candidates today/tomorrow as a demo
      const today = new Date(); today.setHours(9, 0, 0, 0);
      const slotMs = 30 * 60000;
      const slotIso = new Date(today.getTime() + i * slotMs + (i >= 6 ? 60 * 60000 : 0)).toISOString();
      const base = Math.round(p.sv * 0.8 + 1);
      const r = () => Math.max(1, Math.min(5, base + Math.round((Math.random() - 0.5) * 2)));
      if (i < 8) {
        // Done — multiple interviewers (1〜3名)
        const lagMin = i % 4 === 0 ? 45 : 5;
        const baseHeld = new Date(new Date(slotIso).getTime() + lagMin * 60000);
        const interviewers = ['田中先生', '佐藤先生', '山本先生'];
        const numIv = (i % 3) + 1; // 1〜3名
        const records = [];
        for (let j = 0; j < numIv; j++) {
          const r2 = () => Math.max(1, Math.min(5, Math.round(p.sv * 0.8 + 1) + Math.round((Math.random() - 0.5) * 2)));
          records.push({
            id: 'iv_demo_' + i + '_' + j,
            heldAt: new Date(baseHeld.getTime() + j * 10 * 60000).toISOString(),
            interviewer: interviewers[(i + j) % 3],
            ratings: { communication: r2(), motivation: r2(), logic: r2(), knowledge: r2(), fit: r2() },
            notes: j === 0 && i % 4 === 0 ? '志望動機が明確で、研究テーマへの関心が高い。論理的に説明できる。' : (j === 0 ? '受け答えは丁寧。今後の伸びしろに期待。' : '前面接の印象を補強する内容。')
          });
        }
        cand.interview = { scheduledAt: slotIso, records };
      } else if (i < 16) {
        cand.interview = { scheduledAt: slotIso };
      }

      Storage.upsert(cand);
    });
    renderSessionBar();
    refreshAllViews();
    toast(`デモ試験回「${name}」を作成し、20名投入しました`, 'success', 4000);
  }

  // ===== Auth UI (Supabase) =====
  function initAuthUI() {
    const wrap = document.getElementById('auth-status');
    const txt = document.getElementById('auth-status-text');
    const signInBtn = document.getElementById('auth-signin-btn');
    const signOutBtn = document.getElementById('auth-signout-btn');
    const modal = document.getElementById('login-modal');
    if (!wrap || !modal || typeof SupabaseClient === 'undefined') return;

    // Supabase 未設定なら何も表示しない (localStorage モードでそのまま動作)
    if (!SupabaseClient.isConfigured()) return;
    SupabaseClient.init();
    wrap.style.display = 'inline-flex';

    const closeLogin = () => { modal.style.display = 'none'; document.getElementById('login-error').style.display = 'none'; };
    const openLogin = () => { modal.style.display = 'flex'; setTimeout(() => document.getElementById('login-email').focus(), 0); };

    document.getElementById('login-close').addEventListener('click', closeLogin);
    document.getElementById('login-cancel').addEventListener('click', closeLogin);
    modal.addEventListener('click', e => { if (e.target === modal) closeLogin(); });

    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      const btn = document.getElementById('login-submit');
      errEl.style.display = 'none';
      btn.disabled = true; btn.textContent = 'ログイン中...';
      try {
        await SupabaseClient.signInAdmin(email, password);
        closeLogin();
        toast('ログインしました', 'success');
      } catch (err) {
        errEl.textContent = err?.message || 'ログインに失敗しました';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false; btn.textContent = 'ログイン';
      }
    });

    signInBtn.addEventListener('click', openLogin);
    signOutBtn.addEventListener('click', async () => {
      await SupabaseClient.signOut();
      toast('ログアウトしました', 'info');
    });

    async function syncAuthUI() {
      const session = await SupabaseClient.getSession();
      const cloudCard = document.getElementById('cloud-sync-card');
      const cloudStatus = document.getElementById('cloud-sync-status');
      if (session) {
        const adm = await SupabaseClient.isAdmin();
        txt.textContent = adm ? `👤 ${session.user.email} (管理者)` : `👤 ${session.user.email}`;
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'inline-flex';
        if (cloudCard) cloudCard.style.display = '';
        if (cloudStatus) cloudStatus.innerHTML = adm ? '✅ ログイン中: 全変更がリアルタイムで Supabase へ自動同期されています' : '⚠ ログイン中ですが管理者権限がありません (admins テーブルに INSERT が必要)';
      } else {
        txt.textContent = '未ログイン';
        signInBtn.style.display = 'inline-flex';
        signOutBtn.style.display = 'none';
        if (cloudCard) cloudCard.style.display = 'none';
      }
    }
    syncAuthUI();
    SupabaseClient.onAuthChange(() => syncAuthUI());

    // 手動 push/pull ハンドラ
    document.getElementById('cloud-push-all')?.addEventListener('click', async () => {
      if (!confirm('ローカルの全データを Supabase に上書きします。よろしいですか？')) return;
      try { toast('Cloud へ push 中...', 'info', 2000); await DataSync.fullPushToSupabase(); toast('Cloud へ全件 push 完了', 'success'); }
      catch (e) { toast('push 失敗: ' + (e?.message || e), 'error', 5000); }
    });
    document.getElementById('cloud-pull-all')?.addEventListener('click', async () => {
      if (!confirm('Cloud のデータでローカルを上書きします。ローカルの未同期変更は失われます。よろしいですか？')) return;
      try { toast('Cloud から pull 中...', 'info', 2000); await DataSync.fullPullFromSupabase(); toast('Cloud から全件 pull 完了 (画面を更新します)', 'success'); setTimeout(() => location.reload(), 1500); }
      catch (e) { toast('pull 失敗: ' + (e?.message || e), 'error', 5000); }
    });
  }

  // ===== Theme toggle =====
  function applyChartDefaults() {
    if (typeof Chart === 'undefined') return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const txt = isDark ? '#e2e8f0' : '#334155';
    const grid = isDark ? 'rgba(148,163,184,.22)' : 'rgba(15,23,42,.08)';
    const tick = isDark ? '#cbd5e1' : '#475569';
    Chart.defaults.color = txt;
    Chart.defaults.borderColor = grid;
    Chart.defaults.plugins.legend.labels.color = txt;
    // Linear/Category scale (棒・線)
    Chart.defaults.scale.grid = Object.assign({}, Chart.defaults.scale.grid, { color: grid });
    Chart.defaults.scale.ticks = Object.assign({}, Chart.defaults.scale.ticks, { color: tick, backdropColor: 'transparent' });
    // Radial (radar) — Chart.js v4 では scales.r.ticks.backdropColor が白固定
    if (Chart.defaults.scales && Chart.defaults.scales.radialLinear) {
      Chart.defaults.scales.radialLinear.ticks = Object.assign({}, Chart.defaults.scales.radialLinear.ticks, { color: tick, backdropColor: 'transparent', font: { weight: '600' } });
      Chart.defaults.scales.radialLinear.grid = Object.assign({}, Chart.defaults.scales.radialLinear.grid, { color: grid });
      Chart.defaults.scales.radialLinear.angleLines = Object.assign({}, Chart.defaults.scales.radialLinear.angleLines, { color: grid });
      Chart.defaults.scales.radialLinear.pointLabels = Object.assign({}, Chart.defaults.scales.radialLinear.pointLabels, { color: txt, font: { weight: '500' } });
    }
    // 既存チャート再描画
    Object.values(charts).forEach(c => { try { c.update(); } catch (e) {} });
  }
  function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const saved = localStorage.getItem('zemiSA.theme');
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
    const updateIcon = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.textContent = isDark ? '☀' : '🌙';
      btn.title = isDark ? 'ライトモードに切替' : 'ダークモードに切替';
    };
    updateIcon();
    applyChartDefaults();
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('zemiSA.theme', next);
      updateIcon();
      applyChartDefaults();
      // 全画面再描画 (Chart.js を完全に作り直してテーマ追従)
      try { renderOverview(); } catch (e) {}
      // 個人画面が開いていれば、active タブのプロフィールを再描画
      try {
        if (document.getElementById('view-profile')?.classList.contains('active') && _uiState.profileId) {
          renderProfile(_uiState.profileId);
        }
      } catch (e) {}
      // クラスター結果が表示中なら再実行
      try {
        const cl = document.getElementById('cluster-result');
        if (cl && cl.style.display !== 'none') runCluster();
      } catch (e) {}
    });
  }

  // ===== Session bar collapse toggle =====
  function initSessionCollapse() {
    const btn = document.getElementById('session-collapse');
    const bar = document.querySelector('.session-bar');
    if (!btn || !bar) return;
    // 状態を localStorage に保存。デスクトップは常に展開、モバイルは保存値 or デフォルト折畳
    const isMobile = window.matchMedia('(max-width:760px)').matches;
    const saved = localStorage.getItem('zemiSA.sessionBarExpanded');
    if (isMobile) {
      if (saved === '1') bar.classList.add('expanded');
    } else {
      bar.classList.add('expanded'); // デスクトップは常に展開
    }
    btn.addEventListener('click', () => {
      bar.classList.toggle('expanded');
      const expanded = bar.classList.contains('expanded');
      btn.setAttribute('aria-expanded', String(expanded));
      localStorage.setItem('zemiSA.sessionBarExpanded', expanded ? '1' : '0');
    });
  }

  // ===== Init =====
  function init() {
    initThemeToggle();
    initSessionCollapse();
    ensureTests(getSession());
    attachAdminContent();
    initAuthUI();
    if (typeof DataSync !== 'undefined') DataSync.init();

    // URL候補者モード判定
    if (handleUrlMode()) return;

    renderSessionBar();
    // First-visit hint: highlight ❓ help button
    if (!_uiState.helpSeen) {
      setTimeout(() => {
        const btn = document.getElementById('help-btn');
        if (btn) {
          btn.classList.add('first-visit-pulse');
          toast('💡 初めての方は「❓ 使い方」をご覧ください', 'info', 6000);
        }
      }, 1500);
    }
    // Restore saved UI state (portal is candidate-only now, fall back to overview)
    const savedView = (_uiState.view === 'portal' ? 'overview' : _uiState.view) || 'overview';
    const savedSubview = _uiState.subview || 'list';
    if (_uiState.search) $('#search-cand').value = _uiState.search;
    if (_uiState.listFilters) {
      document.querySelectorAll('#cand-table thead .filter-row [data-filter]').forEach(el => {
        const v = _uiState.listFilters[el.dataset.filter];
        if (v != null) el.value = v;
      });
    }
    showView(savedView);
    if (savedView === 'overview') showSubview(savedSubview);
    // 復元: profileTabs があれば全タブを再構築し、active を開く
    if (Array.isArray(_uiState.profileTabs) && _uiState.profileTabs.length) {
      const list = Storage.loadForSession();
      const valid = _uiState.profileTabs.filter(tid => list.some(c => c.id === tid));
      _uiState.profileTabs = valid;
      saveUiState({ profileTabs: valid });
      const active = (valid.includes(_uiState.profileId) ? _uiState.profileId : valid[valid.length - 1]) || null;
      if (active) {
        document.getElementById('profile-select').value = active;
        saveUiState({ profileId: active });
        updateProfileTriggerLabel(active);
        renderProfileTabbar();
        if (savedView === 'profile') renderProfile(active);
      }
    } else if (savedView === 'profile' && _uiState.profileId) {
      openProfileTab(_uiState.profileId);
    }

    // Session bar
    $('#session-select').addEventListener('change', onSessionChange);
    $('#session-popover-add').addEventListener('click', () => { closeSessionPopover(); onAddSession(); });
    $('#session-delete').addEventListener('click', onDeleteSession);
    // Session picker popover
    $('#session-picker-btn').addEventListener('click', e => { e.stopPropagation(); toggleSessionPopover(); });
    $('#session-popover-search').addEventListener('input', renderSessionPopoverList);
    document.addEventListener('click', e => {
      const pop = $('#session-popover');
      if (pop.style.display !== 'none' && !pop.contains(e.target) && e.target !== $('#session-picker-btn')) {
        closeSessionPopover();
      }
    });
    // inline rename via name input
    const nameInput = $('#session-name-input');
    const commitRename = () => {
      const v = nameInput.value.trim();
      const cur = getSession();
      if (!v || v === cur.name) { nameInput.value = cur.name; return; }
      Storage.renameSession(cur.id, v);
      renderSessionBar();
    };
    nameInput.addEventListener('blur', commitRename);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); } });

    // Tabs
    $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
    // Header action buttons (設定 etc.) — same as tabs
    $$('.header-action-btn[data-view]').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
    // Help modal
    document.getElementById('help-btn').addEventListener('click', openHelpModal);
    document.getElementById('footer-help')?.addEventListener('click', openHelpModal);
    document.getElementById('help-close').addEventListener('click', closeHelpModal);
    document.getElementById('help-modal').addEventListener('click', e => { if (e.target === document.getElementById('help-modal')) closeHelpModal(); });
    document.querySelectorAll('.help-tab').forEach(t => t.addEventListener('click', () => {
      document.querySelectorAll('.help-tab').forEach(x => x.classList.toggle('active', x === t));
      document.querySelectorAll('.help-section').forEach(s => s.classList.toggle('active', s.id === 'helpsec-' + t.dataset.helptab));
    }));
    // Global keyboard shortcuts
    document.addEventListener('keydown', e => {
      const active = document.activeElement;
      const inEditable = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);
      // ESC: close modals
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => {
          if (m.style.display !== 'none' && getComputedStyle(m).display !== 'none') {
            if (m.id === 'help-modal') closeHelpModal();
            else if (m.id === 'login-modal') m.style.display = 'none';
            else m.remove();
          }
        });
        return;
      }
      if (inEditable) return;
      // / : focus search
      if (e.key === '/') {
        const search = document.getElementById('search-cand');
        if (search && document.querySelector('#view-overview.active') && document.querySelector('#sub-list.active')) {
          e.preventDefault();
          search.focus();
        }
      }
      // ? : open help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        openHelpModal();
      }
    });
    $$('.subtab:not(.adminsubtab)').forEach(t => t.addEventListener('click', () => showSubview(t.dataset.subview)));
    $$('.adminsubtab').forEach(t => t.addEventListener('click', () => showAdminview(t.dataset.adminview)));
    $$('.resume-subtab').forEach(t => t.addEventListener('click', () => {
      if (t.dataset.resumeview)    showResumeview(t.dataset.resumeview);
      else if (t.dataset.interviewview) showInterviewview(t.dataset.interviewview);
      else if (t.dataset.dataview) showDataview(t.dataset.dataview);
      else if (t.dataset.analysisview) showAnalysisView(t.dataset.analysisview);
    }));
    // Session info form
    const siForm = document.getElementById('form-session-info');
    if (siForm) siForm.addEventListener('submit', saveSessionInfoForm);
    const siReset = document.getElementById('si-reset');
    if (siReset) siReset.addEventListener('click', () => renderSessionInfoMgr());
    // Session info modal (session-bar)
    const sibBtn = document.getElementById('session-info-btn');
    if (sibBtn) sibBtn.addEventListener('click', openSessionInfoModal);
    const simClose = document.getElementById('sim-close');
    if (simClose) simClose.addEventListener('click', closeSessionInfoModal);
    const simCancel = document.getElementById('sim-cancel');
    if (simCancel) simCancel.addEventListener('click', closeSessionInfoModal);
    const simForm = document.getElementById('form-session-info-modal');
    if (simForm) simForm.addEventListener('submit', saveSessionInfoModal);
    const simOverlay = document.getElementById('session-info-modal');
    if (simOverlay) simOverlay.addEventListener('click', (e) => { if (e.target === simOverlay) closeSessionInfoModal(); });
    // k-value stepper
    const kInc = document.getElementById('k-inc');
    const kDec = document.getElementById('k-dec');
    const kInp = document.getElementById('k-value');
    function clampK(v) {
      const min = Number(kInp.min) || 2, max = Number(kInp.max) || 8;
      return Math.max(min, Math.min(max, v));
    }
    function updateKStepperState() {
      if (!kInp) return;
      const v = Number(kInp.value) || 2;
      const min = Number(kInp.min) || 2, max = Number(kInp.max) || 8;
      if (kDec) kDec.disabled = v <= min;
      if (kInc) kInc.disabled = v >= max;
    }
    if (kInc && kInp) kInc.addEventListener('click', () => {
      kInp.value = clampK((Number(kInp.value) || 2) + 1);
      kInp.dispatchEvent(new Event('change', { bubbles: true }));
      updateKStepperState();
    });
    if (kDec && kInp) kDec.addEventListener('click', () => {
      kInp.value = clampK((Number(kInp.value) || 2) - 1);
      kInp.dispatchEvent(new Event('change', { bubbles: true }));
      updateKStepperState();
    });
    if (kInp) kInp.addEventListener('change', updateKStepperState);
    if (kInp) kInp.addEventListener('input', updateKStepperState);
    updateKStepperState();
    // ESC closes any open modal
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const sim = document.getElementById('session-info-modal');
      if (sim && sim.style.display === 'flex') { closeSessionInfoModal(); return; }
    });

    // Overview controls
    let searchDebounce;
    $('#search-cand').addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        saveUiState({ search: $('#search-cand').value });
        renderCandidateList();
      }, 150);
    });
    // Column header sort
    document.querySelectorAll('#cand-table thead .sort-row th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (_listSort.key === key) _listSort.dir = _listSort.dir === 'asc' ? 'desc' : 'asc';
        else { _listSort.key = key; _listSort.dir = 'asc'; }
        saveUiState({ listSort: _listSort });
        renderCandidateList();
      });
    });
    // Per-column filters
    document.querySelectorAll('#cand-table thead .filter-row [data-filter]').forEach(el => {
      const onChange = () => { _listFilters[el.dataset.filter] = el.value; saveUiState({ listFilters: _listFilters }); renderCandidateList(); };
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    });
    // Filter row collapse toggle
    const filterRow = document.querySelector('#cand-table thead .filter-row');
    const toggleBtn = document.getElementById('toggle-filter-row');
    // Restore saved state (default: hidden)
    const filtersVisible = _uiState.filtersVisible === true;
    if (filterRow) filterRow.style.display = filtersVisible ? '' : 'none';
    if (toggleBtn) toggleBtn.classList.toggle('active', filtersVisible);
    toggleBtn?.addEventListener('click', () => {
      const visible = filterRow.style.display === 'none';
      filterRow.style.display = visible ? '' : 'none';
      toggleBtn.classList.toggle('active', visible);
      saveUiState({ filtersVisible: visible });
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
      _listFilters = {};
      $('#search-cand').value = '';
      document.querySelectorAll('#cand-table thead .filter-row [data-filter]').forEach(el => { el.value = ''; });
      saveUiState({ listFilters: {}, search: '' });
      renderCandidateList();
    });
    $('#rank-n').addEventListener('change', renderRanking);
    $('#run-cluster').addEventListener('click', runCluster);

    // Profile
    // Profile picker
    document.getElementById('profile-trigger').addEventListener('click', e => { e.stopPropagation(); toggleProfilePicker(); });
    document.getElementById('profile-picker-search').addEventListener('input', renderProfilePickerList);
    document.addEventListener('click', e => {
      const pop = document.getElementById('profile-picker-popover');
      if (pop && pop.style.display !== 'none' && !pop.contains(e.target) && e.target !== document.getElementById('profile-trigger') && !document.getElementById('profile-trigger').contains(e.target)) {
        closeProfilePicker();
      }
    });
    $('#print-profile').addEventListener('click', () => window.print());
    const closeAllBtn = document.getElementById('close-all-tabs');
    if (closeAllBtn) closeAllBtn.addEventListener('click', () => {
      if (getProfileTabs().length === 0) return;
      if (confirm('開いている全ての受験者タブを閉じます。よろしいですか？')) closeAllProfileTabs();
    });

    // Portal
    $('#portal-load').addEventListener('click', renderPortal);
    $('#portal-examinee-id').addEventListener('change', renderPortal);
    $('#form-application').addEventListener('submit', submitApplication);
    $('#form-resume').addEventListener('submit', submitResume);
    // Photo upload
    document.getElementById('photo-input').addEventListener('change', e => {
      const f = e.target.files[0]; if (f) handlePhotoUpload(f);
    });
    document.getElementById('photo-clear').addEventListener('click', () => {
      setPhotoPreview('');
      document.querySelector('#form-resume [name="photo"]').value = '';
      document.getElementById('photo-input').value = '';
    });
    // Qualification tag input
    document.getElementById('qual-add').addEventListener('click', addQualFromInput);
    document.getElementById('history-add')?.addEventListener('click', addHistoryRow);
    document.getElementById('qual-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addQualFromInput(); }
    });
    // Dashboard stat card → open submission modal
    document.querySelectorAll('[data-quick-filter]').forEach(el => {
      el.addEventListener('click', () => openSubmissionModal(el.dataset.quickFilter));
    });
    $('#form-academic').addEventListener('submit', submitAcademic);
    $('#form-survey').addEventListener('submit', submitSurvey);
    $$('[data-cancel]').forEach(b => b.addEventListener('click', () => {
      $$('.portal-form').forEach(f => f.style.display = 'none');
    }));

    // Question editors
    // Save grace minutes
    document.getElementById('save-grace-min')?.addEventListener('click', () => {
      const sess = ensureTests(getSession());
      const v = Number(document.getElementById('academic-grace-min').value);
      sess.academicTest.graceMinutes = isNaN(v) || v < 0 ? 5 : Math.min(60, v);
      saveSession(sess);
      renderAcademicMgr();
      toast(`猶予時間 ${sess.academicTest.graceMinutes}分 を保存`, 'success', 1500);
    });
    $('#add-academic-q').addEventListener('click', () => {
      const sess = getSession();
      sess.academicTest.questions.push({ id: 'q_' + Date.now().toString(36), category: '', text: '新しい問題', choices: ['選択肢1', '選択肢2', '選択肢3', '選択肢4'], correctIndex: 0, points: 10 });
      saveSession(sess); renderAcademicMgr();
    });
    $('#reset-academic-default').addEventListener('click', () => {
      if (!confirm('現在の問題を破棄してデフォルト問題に戻しますか？')) return;
      const sess = getSession(); sess.academicTest = { questions: Stats.DEFAULT_ACADEMIC_QUESTIONS.map(q => ({ ...q })) }; saveSession(sess); renderAcademicMgr();
    });
    $('#add-survey-q').addEventListener('click', () => {
      const sess = getSession();
      sess.surveyTest.questions.push({ id: 'q_' + Date.now().toString(36), text: '新しい項目' });
      saveSession(sess); renderSurveyMgr();
    });
    $('#reset-survey-default').addEventListener('click', () => {
      if (!confirm('現在の項目を破棄してデフォルトに戻しますか？')) return;
      const sess = getSession(); sess.surveyTest = { questions: Stats.DEFAULT_SURVEY_QUESTIONS.map(q => ({ ...q })) }; saveSession(sess); renderSurveyMgr();
    });
    // Message template (auto-save with debounce + visual feedback)
    const msgTextarea = document.getElementById('msg-template');
    if (msgTextarea) {
      let msgSaveTimer;
      msgTextarea.addEventListener('input', () => {
        clearTimeout(msgSaveTimer);
        // Show saving indicator
        showAutoSaveStatus('saving');
        msgSaveTimer = setTimeout(() => {
          const sess = getSession();
          sess.messageTemplate = msgTextarea.value;
          saveSession(sess);
          showAutoSaveStatus('saved');
        }, 500);
      });
    }
    const msgReset = document.getElementById('msg-template-reset');
    if (msgReset) msgReset.addEventListener('click', () => {
      if (!confirm('テンプレートをデフォルトに戻しますか？')) return;
      const sess = getSession();
      sess.messageTemplate = DEFAULT_MSG_TEMPLATE;
      saveSession(sess);
      document.getElementById('msg-template').value = DEFAULT_MSG_TEMPLATE;
    });
    const msgGen = document.getElementById('msg-generate-all');
    if (msgGen) msgGen.addEventListener('click', generateAllMessages);
    // Save passcode
    const savePassBtn = document.getElementById('save-passcode');
    if (savePassBtn) savePassBtn.addEventListener('click', () => {
      const sess = getSession();
      sess.applicationPasscode = (document.getElementById('app-passcode').value || '').trim();
      saveSession(sess);
      alert(sess.applicationPasscode ? `合言葉「${sess.applicationPasscode}」を設定しました。配布URLにも反映されます。` : '合言葉を解除しました（誰でもアクセス可能）。');
      // Re-render share section to update URL
      renderPhaseShare('resume', 'view-mgr-resume');
    });

    $('#add-faculty').addEventListener('click', () => {
      const sess = getSession();
      const name = prompt('追加する学部名を入力してください', '新学部');
      if (!name) return;
      sess.facultyDept.push({ name, departments: ['新学科'] });
      saveSession(sess); renderFacultyDeptEditor(sess);
    });
    $('#reset-faculty').addEventListener('click', () => {
      if (!confirm('学部・学科をデフォルトに戻しますか？')) return;
      const sess = getSession();
      sess.facultyDept = JSON.parse(JSON.stringify(Stats.DEFAULT_FACULTY_DEPT));
      saveSession(sess); renderFacultyDeptEditor(sess);
    });
    $('#add-resume-field').addEventListener('click', () => {
      const sess = getSession();
      const label = prompt('追加質問のラベルを入力してください', '追加質問');
      if (!label) return;
      sess.resumeExtraFields.push({ id: 'rx_' + Date.now().toString(36), label, type: 'textarea' });
      saveSession(sess); renderResumeMgr();
    });
    $('#reset-resume-fields').addEventListener('click', () => {
      if (!confirm('追加質問をすべて削除しますか？')) return;
      const sess = getSession(); sess.resumeExtraFields = []; saveSession(sess); renderResumeMgr();
    });

    // Interview rating categories editor
    document.getElementById('add-iv-rating')?.addEventListener('click', () => {
      const sess = ensureTests(getSession());
      const newKey = 'cust_' + Date.now().toString(36);
      sess.interviewRatings = sess.interviewRatings || [];
      sess.interviewRatings.push({ key: newKey, label: '新しい評価項目' });
      saveSession(sess);
      renderInterviewRatingsEditor(sess);
      toast('評価項目を追加しました', 'success', 1500);
    });
    document.getElementById('reset-iv-ratings')?.addEventListener('click', () => {
      const userDefault = Storage.getDefaultInterviewRatings();
      const target = userDefault ? 'ユーザー保存のデフォルト' : 'システム標準';
      if (!confirm(`評価項目を ${target} に戻しますか？\n（既に登録された面接記録の数値は残ります）`)) return;
      const sess = ensureTests(getSession());
      sess.interviewRatings = (userDefault && userDefault.length > 0)
        ? userDefault.map(r => ({ ...r }))
        : Stats.INTERVIEW_RATINGS.map(r => ({ ...r }));
      saveSession(sess);
      renderInterviewRatingsEditor(sess);
      toast(`${target} に戻しました`, 'success', 1500);
    });
    document.getElementById('save-iv-as-default')?.addEventListener('click', () => {
      const sess = ensureTests(getSession());
      Storage.setDefaultInterviewRatings(sess.interviewRatings || []);
      renderInterviewRatingsEditor(sess);
      toast('現在の評価項目を次回新規試験回のデフォルトとして保存しました', 'success', 2500);
    });
    document.getElementById('clear-iv-default')?.addEventListener('click', () => {
      if (!confirm('ユーザー保存のデフォルトを削除してシステム標準（5項目）に戻しますか？\n（既存試験回には影響しません）')) return;
      Storage.setDefaultInterviewRatings(null);
      const sess = ensureTests(getSession());
      renderInterviewRatingsEditor(sess);
      toast('ユーザーデフォルトを削除しました', 'success', 1500);
    });
    // Interview schedule
    ['startDate', 'days', 'dailyStart', 'dailyEnd', 'slotMinutes', 'breakStart', 'breakEnd'].forEach(k => {
      const el = document.getElementById('iv-sch-' + k);
      if (el) el.addEventListener('change', () => { saveScheduleConfig(); renderInterviewTimeline(); });
    });
    document.getElementById('iv-sch-allocate').addEventListener('click', () => autoAllocateInterviews('fill'));
    document.getElementById('iv-sch-reallocate').addEventListener('click', () => {
      if (!confirm('既存スケジュールを破棄し、全員を最初から再配置します。よろしいですか？')) return;
      autoAllocateInterviews('reallocate');
    });
    document.getElementById('iv-sch-clear').addEventListener('click', clearAllSchedules);
    // Auto-refresh timeline every minute to update delay status
    setInterval(() => {
      if (document.querySelector('#adminview-interview.active')) renderInterviewTimeline();
    }, 60000);

    // Phase toggles
    $$('[data-phase-toggle]').forEach(cb => cb.addEventListener('change', () => {
      Storage.setPhase(Storage.getCurrentSessionId(), cb.dataset.phaseToggle, cb.checked);
      renderSessionBar(); renderPortal();
    }));
    // Phase schedule inputs
    function onScheduleChange(phase) {
      const sid = Storage.getCurrentSessionId();
      const start = document.querySelector(`[data-phase-start="${phase}"]`).value;
      const end   = document.querySelector(`[data-phase-end="${phase}"]`).value;
      Storage.setPhaseSchedule(sid, phase, localInputToIso(start), localInputToIso(end));
      renderSessionBar(); renderPortal();
    }
    $$('[data-phase-start], [data-phase-end]').forEach(inp => {
      const phase = inp.dataset.phaseStart || inp.dataset.phaseEnd;
      inp.addEventListener('change', () => onScheduleChange(phase));
    });

    // Data tab - CSV templates / imports / data ops
    document.getElementById('dl-template-resume').addEventListener('click', downloadResumeTemplate);
    document.getElementById('dl-template-academic').addEventListener('click', downloadAcademicTemplate);
    document.getElementById('dl-template-survey').addEventListener('click', downloadSurveyTemplate);
    document.getElementById('up-csv-resume').addEventListener('change', e => { if (e.target.files[0]) { importResumeCsv(e.target.files[0]); e.target.value = ''; } });
    document.getElementById('up-csv-academic').addEventListener('change', e => { if (e.target.files[0]) { importAcademicCsv(e.target.files[0]); e.target.value = ''; } });
    document.getElementById('up-csv-survey').addEventListener('change', e => { if (e.target.files[0]) { importSurveyCsv(e.target.files[0]); e.target.value = ''; } });
    $('#seed-demo').addEventListener('click', seedDemo);
    $('#clear-all').addEventListener('click', () => {
      if (!confirm('この試験回の全受験者データを削除しますか？（試験回自体は残ります）')) return;
      Storage.clearAll(); renderOverview(); alert('削除しました。');
    });

  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
