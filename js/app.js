// =========================================================
// ゼミ選抜アナライザー v2.0
// =========================================================
const App = (() => {

  let cfg = Storage.loadCfg();
  const charts = {};
  const PHASE_LABEL = { resume: '履歴書', academic: '学力試験', survey: 'アンケート', interview: '面接' };

  // ===== UI state persistence (active tab / subview / profile / filters / sort) =====
  const UI_KEY = 'zemiSA.uiState.v1';
  let _uiState = (() => {
    try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; }
  })();
  function saveUiState(patch) {
    Object.assign(_uiState, patch);
    try { localStorage.setItem(UI_KEY, JSON.stringify(_uiState)); } catch (e) {}
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
      sess.academicTest = { questions: DEFAULT_ACADEMIC_QUESTIONS.map(q => ({ ...q })) };
      changed = true;
    }
    if (!sess.surveyTest || !Array.isArray(sess.surveyTest.questions)) {
      sess.surveyTest = { questions: DEFAULT_SURVEY_QUESTIONS.map(q => ({ ...q })) };
      changed = true;
    }
    if (!sess.resumeExtraFields) { sess.resumeExtraFields = []; changed = true; }
    if (!sess.facultyDept) { sess.facultyDept = JSON.parse(JSON.stringify(Stats.DEFAULT_FACULTY_DEPT)); changed = true; }
    if (!sess.pin) { sess.pin = Storage.generatePin(); changed = true; }
    if (!sess.phaseSchedule) { sess.phaseSchedule = { resume:{startsAt:null,endsAt:null}, academic:{startsAt:null,endsAt:null}, survey:{startsAt:null,endsAt:null} }; changed = true; }
    if (changed) {
      const list = Storage.loadSessions();
      const idx = list.findIndex(s => s.id === sess.id);
      if (idx >= 0) { list[idx] = sess; localStorage.setItem('zemiSA.sessions.v1', JSON.stringify(list)); }
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
    ['resume', 'academic', 'survey'].forEach(p => {
      const el = document.querySelector(`[data-phase-state="${p}"]`);
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
    renderOverview();
    refreshProfileSelect();
    renderAcademicMgr();
    renderSurveyMgr();
    renderResumeMgr();
  }

  // ===== Tabs =====
  function showView(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    saveUiState({ view: name });
    if (name === 'overview') renderOverview();
    if (name === 'profile') refreshProfileSelect();
    if (name === 'portal')   renderPortal();
    if (name === 'admin') {
      const sub = _uiState.adminview || 'academic';
      showAdminview(sub);
    }
  }
  function showAdminview(name) {
    $$('.adminsubtab').forEach(t => t.classList.toggle('active', t.dataset.adminview === name));
    $$('.adminview').forEach(v => v.classList.toggle('active', v.id === 'adminview-' + name));
    saveUiState({ adminview: name });
    if (name === 'academic') renderAcademicMgr();
    if (name === 'survey')   renderSurveyMgr();
    if (name === 'resume')   renderResumeMgr();
    if (name === 'data')     loadCfgUi();
  }
  function attachAdminContent() {
    document.querySelectorAll('.admin-content').forEach(el => {
      const target = document.getElementById('adminview-' + el.dataset.admin);
      if (target && !target.contains(el)) target.appendChild(el);
    });
  }
  function showSubview(name) {
    $$('.subtab').forEach(t => t.classList.toggle('active', t.dataset.subview === name));
    $$('.subview').forEach(v => v.classList.toggle('active', v.id === 'sub-' + name));
    saveUiState({ subview: name });
    if (name === 'chart')   renderChartView();
    if (name === 'rank')    renderRanking();
    if (name === 'cluster') { /* on-demand */ }
    if (name === 'list')    renderCandidateList();
  }

  // ===== Overview =====
  function renderOverview() {
    const sess = ensureTests(getSession());
    const list = Storage.loadForSession();
    const N = list.length;
    const nR = list.filter(c => Stats.hasResume(c)).length;
    const nA = list.filter(c => Stats.hasAcademic(c)).length;
    const nS = list.filter(c => Stats.hasSurvey(c)).length;
    const nI = list.filter(c => Stats.hasInterview(c)).length;
    $('#stat-count').textContent = N;
    $('#stat-resume').textContent    = `${nR} / ${N}`;
    $('#stat-academic').textContent  = `${nA} / ${N}`;
    $('#stat-survey').textContent    = `${nS} / ${N}`;
    $('#stat-interview').textContent = `${nI} / ${N}`;
    const totals = list.filter(c => Stats.hasAcademic(c) || Stats.hasSurvey(c)).map(c => Stats.totalScore(c, sess, cfg));
    $('#stat-avg').textContent = totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1) : '-';
    $('#stat-max').textContent = totals.length ? Math.max(...totals).toFixed(1) : '-';
    $('#stat-passed').textContent = list.filter(c => c.passed).length;
    renderEmptyStateBanner(list.length === 0);
    renderCandidateList();
    renderChartView();
    renderRanking();
  }

  // ===== Submission modal =====
  function openSubmissionModal(phase) {
    const list = Storage.loadForSession();
    const phaseLabel = PHASE_LABEL[phase] || phase;
    const hasFn   = { resume: Stats.hasResume, academic: Stats.hasAcademic, survey: Stats.hasSurvey, interview: Stats.hasInterview }[phase];
    const tsField = { resume: 'resumeSubmittedAt', academic: 'academicSubmittedAt', survey: 'surveySubmittedAt', interview: '_interviewHeldAt' }[phase];
    // Map interview timestamp for sort purposes
    if (phase === 'interview') list.forEach(c => { c._interviewHeldAt = c.interview?.heldAt; });
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
    modal.innerHTML = `
      <div class="modal-window">
        <div class="modal-head">
          <h3 style="margin:0">📊 ${escapeHtml(phaseLabel)} 提出状況</h3>
          <button class="btn modal-close" aria-label="閉じる">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-col">
            <h4 class="modal-col-title">✅ 提出者 <span class="muted">(${submitted.length}名・新しい順)</span></h4>
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
              `).join('') : '<p class="muted" style="text-align:center;padding:14px">提出者がいません</p>'}
            </div>
          </div>
          <div class="modal-col">
            <h4 class="modal-col-title">❌ 未提出者 <span class="muted">(${unsubmitted.length}名・受験番号順)</span></h4>
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
              `).join('') : '<p class="muted" style="text-align:center;padding:14px">全員提出済み</p>'}
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
        $('#profile-select').value = row.dataset.id;
        showView('profile');
        renderProfile(row.dataset.id);
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
      const total = Stats.totalScore(c, sess, cfg);
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
        case 'resume':     return ((Stats.hasResume(a.c) ? 1 : 0) - (Stats.hasResume(b.c) ? 1 : 0)) * dir;
        case 'academic':   return (a.ac.percent - b.ac.percent) * dir;
        case 'survey':     return (a.sv - b.sv) * dir;
        case 'interview':  return (Stats.interviewAvg(a.c) - Stats.interviewAvg(b.c)) * dir;
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
      const ivAvg = iv ? Stats.interviewAvg(c) : 0;
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
        <td>${Stats.hasResume(c) ? '✅' : missBadge}</td>
        <td class="num">${Stats.hasAcademic(c) ? ac.percent.toFixed(1) + '%' : missBadge}</td>
        <td class="num">${Stats.hasSurvey(c) ? sv.toFixed(2) : missBadge}</td>
        <td class="num">${iv ? ivAvg.toFixed(1) + '/5' : missBadge}</td>
        <td>${formatDate(lastUpdate)}</td>
        <td class="row-actions">
          <button class="btn" data-act="view">詳細</button>
          <button class="btn danger" data-act="del">削除</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:24px">受験者データがありません。</td></tr>`;
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
        $('#profile-select').value = tr.dataset.id;
        showView('profile');
        renderProfile(tr.dataset.id);
      });
      tr.querySelector('[data-act="del"]')?.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('この受験者データを削除しますか？')) { Storage.remove(tr.dataset.id); renderOverview(); }
      });
      tr.addEventListener('click', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        $('#profile-select').value = tr.dataset.id;
        showView('profile');
        renderProfile(tr.dataset.id);
      });
    });
  }

  function renderChartView() {
    const sess = getSession();
    const list = Storage.loadForSession();
    const totals = list.filter(c => Stats.hasAcademic(c) || Stats.hasSurvey(c)).map(c => Stats.totalScore(c, sess, cfg));
    // distribution
    const dctx = $('#chart-distribution'); if (dctx) {
      const bins = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const labels = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'];
      totals.forEach(t => bins[Math.min(9, Math.floor(t / 10))]++);
      if (charts.dist) charts.dist.destroy();
      charts.dist = new Chart(dctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: '受験者数', data: bins, backgroundColor: '#2563eb' }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
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
        data: { labels: cats, datasets: [{ label: '平均(%)', data: avgs, backgroundColor: 'rgba(16,185,129,.2)', borderColor: '#10b981', pointBackgroundColor: '#10b981' }] },
        options: { responsive: true, scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } } }
      });
    }
    // recent list
    const wrap = $('#recent-list'); if (wrap) {
      const recent = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
      wrap.innerHTML = recent.length
        ? recent.map(c => `<div class="row"><div><strong>${escapeHtml(fullName(c))}</strong> <span class="meta">${escapeHtml(c.examineeId || '')} ・ ${escapeHtml(c.university || '')}</span></div><div class="meta">${formatDate(c.createdAt)}</div></div>`).join('')
        : '<div class="row">まだデータがありません。</div>';
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
        $('#profile-select').value = tr.dataset.id;
        showView('profile');
        renderProfile(tr.dataset.id);
      });
    });
  }

  // ===== Cluster =====
  function runCluster() {
    const sess = getSession();
    const k = Math.max(2, Math.min(8, Number($('#k-value').value) || 3));
    const list = Storage.loadForSession().filter(c => Stats.hasAcademic(c) || Stats.hasSurvey(c));
    if (list.length < k) { alert(`分析対象が ${k} 人未満です（${list.length}名）。受験者を追加してください。`); return; }
    const vectors = list.map(c => Stats.featureVector(c, sess));
    const { assignments, centroids } = Cluster.kmeans(vectors, k);
    const { points } = Cluster.pca2(vectors);

    const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

    if (charts.cluster) charts.cluster.destroy();
    const datasets = [];
    for (let c = 0; c < k; c++) {
      const pts = points.map((p, i) => ({ x: p[0], y: p[1], _idx: i }))
                        .filter((_, i) => assignments[i] === c);
      datasets.push({ label: `クラスター ${c + 1} (${pts.length}名)`, data: pts, backgroundColor: palette[c % palette.length], pointRadius: 6, pointHoverRadius: 9 });
    }
    charts.cluster = new Chart($('#chart-cluster'), {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        plugins: { tooltip: { callbacks: { label: ctx => { const c = list[ctx.raw._idx]; return `${fullName(c)} (${c.examineeId})`; } } } },
        scales: { x: { title: { display: true, text: 'PC1' } }, y: { title: { display: true, text: 'PC2' } } }
      }
    });

    const cats = sess.academicTest?.questions?.length
      ? [...new Set(sess.academicTest.questions.map(q => q.category || 'その他'))]
      : Stats.DEFAULT_ACADEMIC_CATEGORIES;
    if (charts.clusterRadar) charts.clusterRadar.destroy();
    const radarDS = centroids.map((centroid, i) => ({
      label: `クラスター ${i + 1}`,
      data: centroid.slice(0, cats.length).map(v => v * 100),
      backgroundColor: palette[i % palette.length] + '33',
      borderColor: palette[i % palette.length],
      pointBackgroundColor: palette[i % palette.length]
    }));
    charts.clusterRadar = new Chart($('#chart-cluster-radar'), {
      type: 'radar',
      data: { labels: cats, datasets: radarDS },
      options: { responsive: true, scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } } }
    });

    // ===== Cluster characterization: 系統名・属性差分・スコア範囲 =====
    const surveyQs = sess.surveyTest?.questions || [];
    const featLabels = cats.concat(surveyQs.map(q => q.text));
    const overallMean = featLabels.map((_, fi) => vectors.reduce((s, v) => s + v[fi], 0) / vectors.length);

    let charHtml = '<div class="cluster-grid">';
    for (let ci = 0; ci < k; ci++) {
      const members = list.filter((_, i) => assignments[i] === ci);
      // diff per feature
      const diffs = featLabels.map((label, fi) => ({
        label, isAcademic: fi < cats.length,
        diff: centroids[ci][fi] - overallMean[fi],
        centroidVal: centroids[ci][fi]
      }));
      const sortedHi = [...diffs].sort((a, b) => b.diff - a.diff).slice(0, 3);
      const sortedLo = [...diffs].sort((a, b) => a.diff - b.diff).slice(0, 2);
      const fmtVal = (d) => d.isAcademic ? `${(d.centroidVal * 100).toFixed(0)}%` : `${(d.centroidVal * 5).toFixed(1)}/5`;
      const systemName = inferClusterSystem(diffs, cats);
      const acScores = members.map(m => Stats.scoreAcademic(m, sess.academicTest).percent).filter(v => !isNaN(v));
      const svScores = members.map(m => Stats.surveyAvg(m, sess.surveyTest)).filter(v => v > 0);
      const totalScores = members.map(m => Stats.totalScore(m, sess, cfg));
      const passedCount = members.filter(m => m.passed).length;
      const genderDist = {};
      members.forEach(m => { if (m.gender) genderDist[m.gender] = (genderDist[m.gender] || 0) + 1; });
      const facultyDist = {};
      members.forEach(m => { if (m.faculty) facultyDist[m.faculty] = (facultyDist[m.faculty] || 0) + 1; });
      const topFaculty = Object.entries(facultyDist).sort((a, b) => b[1] - a[1]).slice(0, 2);

      const rangeBlock = (label, arr, suffix = '') => arr.length ? `<div class="range-row"><span>${label}</span><strong>${Math.min(...arr).toFixed(1)}${suffix} 〜 ${Math.max(...arr).toFixed(1)}${suffix}</strong> <span class="range-mean">(平均 ${(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)}${suffix})</span></div>` : '';

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

        <div class="cluster-members">
          <div class="trait-title">メンバー</div>
          <div>${members.map(m => `<span class="cluster-chip" style="background:${palette[ci % palette.length]}">${escapeHtml(fullName(m))}${m.passed ? ' ✅' : ''}</span>`).join('')}</div>
        </div>

        <div class="cluster-hint">💡 多様性確保のため、この系統から <strong>${Math.max(1, Math.ceil(members.length / 5))}名</strong> 程度の採用を推奨</div>
      </div>`;
    }
    charHtml += '</div>';
    $('#cluster-assign-list').innerHTML = charHtml;
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
    const current = sel.value;
    const list = Storage.loadForSession();
    sel.innerHTML = '<option value="">-- 受験者を選択 --</option>' +
      list.map(c => `<option value="${c.id}">${escapeHtml(c.examineeId || '')} ${escapeHtml(fullName(c))}</option>`).join('');
    if (current && list.find(c => c.id === current)) { sel.value = current; renderProfile(current); }
    else { $('#profile-body').innerHTML = '<div class="card" style="text-align:center;color:var(--muted)">上のドロップダウンから受験者を選択してください。</div>'; }
  }

  function renderProfile(id) {
    const sess = getSession();
    const c = Storage.loadForSession().find(x => x.id === id);
    const body = $('#profile-body');
    if (!c) { body.innerHTML = ''; return; }
    const ac = Stats.scoreAcademic(c, sess.academicTest);
    const sv = Stats.surveyAvg(c, sess.surveyTest);
    const total = Stats.totalScore(c, sess, cfg);
    const radar = Stats.radarData(c, sess);

    body.innerHTML = `
      <div class="profile-card">
        <div class="profile-head">
          ${c.photo ? `<img class="avatar-lg" src="${c.photo}" alt="顔写真">` : '<div class="avatar-lg avatar-blank">👤</div>'}
          <div style="flex:1;min-width:200px">
            <div class="profile-name">${escapeHtml(fullName(c))}</div>
            <div class="profile-meta">${escapeHtml(fullKana(c))}</div>
            <div class="profile-meta">受験番号: ${escapeHtml(c.examineeId || '')} ・ ${c.gender ? '🚻 ' + escapeHtml(c.gender) + ' ・ ' : ''}${escapeHtml(c.faculty || '')} ${escapeHtml(c.department || '')} ${escapeHtml(c.grade || '')}</div>
            <div style="margin-top:10px"><label class="pass-toggle"><input type="checkbox" id="profile-pass" ${c.passed ? 'checked' : ''}> <span>🏆 この受験者を合格にする</span></label></div>
            <div class="profile-meta">履歴書: ${c.resumeSubmittedAt ? formatDate(c.resumeSubmittedAt) : '未'} / 学力: ${c.academicSubmittedAt ? formatDate(c.academicSubmittedAt) : '未'} / アンケート: ${c.surveySubmittedAt ? formatDate(c.surveySubmittedAt) : '未'}</div>
          </div>
          <div>
            <div class="score-badges">
              <span class="score-badge">総合 ${total.toFixed(1)}</span>
              <span class="score-badge alt">学力 ${ac.percent.toFixed(1)}% (${ac.total}/${ac.max})</span>
              <span class="score-badge warn">アンケート ${sv.toFixed(2)}/5</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="profile-card"><h3>学力試験レーダー（カテゴリ別正答率%）</h3><canvas id="profile-radar-academic" height="280"></canvas></div>
        <div class="profile-card"><h3>アンケート傾向</h3><canvas id="profile-radar-survey" height="280"></canvas></div>
      </div>

      <div class="profile-card">
        <h3>📄 履歴書情報</h3>
        <div class="form-grid">
          <div><dt>生年月日</dt><dd>${escapeHtml(c.birthdate || '')}</dd></div>
          <div><dt>性別</dt><dd>${escapeHtml(c.gender || '')}</dd></div>
          <div><dt>メール</dt><dd>${escapeHtml(c.email || '')}</dd></div>
          <div><dt>電話</dt><dd>${escapeHtml(c.phone || '')}</dd></div>
          <div><dt>GPA</dt><dd>${c.gpa ?? ''}</dd></div>
          <div class="full"><dt>取得資格・スキル</dt><dd>${(normalizeQualifications(c.qualifications).map(q => `<span class="qual-chip">${escapeHtml(q)}</span>`).join('') || '<span class="muted">なし</span>')}</dd></div>
        </div>
        <h4 style="margin-top:14px">志望動機</h4><p>${escapeHtml(c.motivation || '')}</p>
        <h4>自己PR</h4><p>${escapeHtml(c.selfPr || '')}</p>
        <h4>研究したいテーマ</h4><p>${escapeHtml(c.researchTopic || '')}</p>
        ${(sess.resumeExtraFields || []).map(f => `<h4>${escapeHtml(f.label)}</h4><p>${escapeHtml(c.extra?.[f.id] || '')}</p>`).join('')}
      </div>

      <div class="profile-card">
        <h3>📚 学力試験 回答内訳</h3>
        ${Stats.hasAcademic(c) ? renderAcademicReview(c, sess) : '<p class="muted">未受験</p>'}
      </div>

      <div class="profile-card">
        <h3>📋 アンケート 自由記述</h3>
        <h4>力を入れた活動</h4><p>${escapeHtml(c.freeAchievement || '')}</p>
        <h4>挑戦したいこと</h4><p>${escapeHtml(c.freeAspiration || '')}</p>
      </div>

      <div class="profile-card" id="interview-card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <h3 style="margin:0">🎤 面接記録</h3>
          <button class="btn primary" id="edit-interview">${c.interview?.heldAt ? '✏ 編集' : '＋ 面接記録を入力'}</button>
        </div>
        ${renderInterviewView(c)}
      </div>
    `;

    document.getElementById('edit-interview').addEventListener('click', () => openInterviewEditor(c.id));
    // Interview radar
    const iv = c.interview;
    if (iv?.heldAt) {
      const ivCtx = document.getElementById('profile-radar-interview');
      if (ivCtx) new Chart(ivCtx, {
        type: 'radar',
        data: {
          labels: Stats.INTERVIEW_RATINGS.map(r => r.label),
          datasets: [{ label: '面接評価', data: Stats.INTERVIEW_RATINGS.map(r => Number(iv.ratings?.[r.key]) || 0), backgroundColor: 'rgba(139,92,246,.2)', borderColor: '#8b5cf6', pointBackgroundColor: '#8b5cf6' }]
        },
        options: { responsive: true, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
      });
    }
    document.getElementById('profile-pass').addEventListener('change', e => {
      const list = Storage.load();
      const rec = list.find(x => x.id === c.id);
      if (rec) { rec.passed = e.target.checked; Storage.save(list); renderOverview(); }
    });

    new Chart($('#profile-radar-academic'), {
      type: 'radar',
      data: { labels: radar.labels, datasets: [{ label: fullName(c), data: radar.data, backgroundColor: 'rgba(37,99,235,.2)', borderColor: '#2563eb', pointBackgroundColor: '#2563eb' }] },
      options: { responsive: true, scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } } }
    });
    new Chart($('#profile-radar-survey'), {
      type: 'radar',
      data: {
        labels: (sess.surveyTest?.questions || []).map(q => q.text.length > 12 ? q.text.slice(0, 12) + '…' : q.text),
        datasets: [{ label: 'アンケート', data: Stats.surveyVector(c, sess), backgroundColor: 'rgba(245,158,11,.2)', borderColor: '#f59e0b', pointBackgroundColor: '#f59e0b' }]
      },
      options: { responsive: true, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
    });
  }

  function renderInterviewView(c) {
    const iv = c.interview;
    if (!iv?.heldAt) return '<p class="muted" style="padding:10px">面接記録はまだありません。「＋ 面接記録を入力」から登録できます。</p>';
    const avg = Stats.interviewAvg(c);
    return `
      <div class="iv-summary">
        <div class="iv-meta">
          <div><span class="iv-k">面接日時</span><span class="iv-v">${escapeHtml(formatDate(iv.heldAt))}</span></div>
          <div><span class="iv-k">面接官</span><span class="iv-v">${escapeHtml(iv.interviewer || '—')}</span></div>
          <div><span class="iv-k">総合評価</span><span class="iv-v"><strong style="color:var(--primary)">${avg.toFixed(2)} / 5</strong></span></div>
        </div>
        <div class="grid-2" style="margin-top:10px">
          <div>
            <canvas id="profile-radar-interview" height="240"></canvas>
          </div>
          <div>
            <h4 style="margin-top:0">評価項目</h4>
            ${Stats.INTERVIEW_RATINGS.map(r => `<div class="iv-rating-row"><span>${escapeHtml(r.label)}</span><strong>${Number(iv.ratings?.[r.key]) || 0} / 5</strong></div>`).join('')}
          </div>
        </div>
        ${iv.notes ? `<div style="margin-top:10px"><h4>所見・メモ</h4><p>${escapeHtml(iv.notes)}</p></div>` : ''}
      </div>
    `;
  }

  function openInterviewEditor(candId) {
    const c = Storage.load().find(x => x.id === candId);
    if (!c) return;
    const iv = c.interview || {};
    const heldAtVal = iv.heldAt ? toLocalInputValue(iv.heldAt) : toLocalInputValue(new Date().toISOString());
    const existing = document.getElementById('interview-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'interview-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-window" style="max-width:680px">
        <div class="modal-head">
          <h3 style="margin:0">🎤 面接記録 — ${escapeHtml(fullName(c))}</h3>
          <button class="btn modal-close">✕</button>
        </div>
        <div class="modal-body" style="display:block">
          <div class="form-grid">
            <label>面接日時<input type="datetime-local" id="iv-heldAt" value="${heldAtVal}"></label>
            <label>面接官<input type="text" id="iv-interviewer" value="${escapeHtml(iv.interviewer || '')}" placeholder="例: 山田 / 複数の場合カンマ区切り"></label>
          </div>
          <h4 style="margin-top:14px">評価（1〜5）</h4>
          <div class="iv-rating-grid">
            ${Stats.INTERVIEW_RATINGS.map(r => `
              <div class="iv-rating-edit">
                <label>${escapeHtml(r.label)}</label>
                <div class="iv-scale">
                  ${[1,2,3,4,5].map(v => `<label><input type="radio" name="iv-${r.key}" value="${v}" ${Number(iv.ratings?.[r.key]) === v ? 'checked' : ''}>${v}</label>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
          <h4 style="margin-top:14px">所見・メモ</h4>
          <textarea id="iv-notes" rows="5" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px">${escapeHtml(iv.notes || '')}</textarea>
          <div class="form-actions" style="margin-top:14px">
            ${iv.heldAt ? '<button class="btn danger" id="iv-delete">面接記録を削除</button>' : '<span></span>'}
            <div>
              <button class="btn" id="iv-cancel">キャンセル</button>
              <button class="btn primary" id="iv-save">保存</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#iv-cancel').addEventListener('click', close);
    modal.querySelector('#iv-save').addEventListener('click', () => {
      const ratings = {};
      Stats.INTERVIEW_RATINGS.forEach(r => {
        const sel = modal.querySelector(`input[name="iv-${r.key}"]:checked`);
        ratings[r.key] = sel ? Number(sel.value) : 0;
      });
      const heldAt = localInputToIso(modal.querySelector('#iv-heldAt').value) || new Date().toISOString();
      const updated = Storage.load();
      const rec = updated.find(x => x.id === candId);
      rec.interview = {
        heldAt,
        interviewer: modal.querySelector('#iv-interviewer').value.trim(),
        ratings,
        notes: modal.querySelector('#iv-notes').value.trim()
      };
      Storage.save(updated);
      close();
      renderProfile(candId);
      renderOverview();
    });
    const delBtn = modal.querySelector('#iv-delete');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!confirm('面接記録を削除しますか？')) return;
      const updated = Storage.load();
      const rec = updated.find(x => x.id === candId);
      delete rec.interview;
      Storage.save(updated);
      close();
      renderProfile(candId);
      renderOverview();
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
    const examineeId = (idInput.value || '').trim();
    const cand = examineeId ? Storage.findByExamineeId(sess.id, examineeId) : null;
    $('#portal-status').textContent = examineeId ? (cand ? `登録あり: ${fullName(cand)}` : '新規受験者として登録できます') : '受験番号を入力してください';

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
    ['portal-resume', 'portal-academic', 'portal-survey'].forEach(id => $('#' + id).style.display = 'none');
    const idInput = $('#portal-examinee-id');
    const examineeId = (idInput.value || '').trim();
    const cand = Storage.findByExamineeId(sess.id, examineeId);

    if (phase === 'resume') {
      $('#portal-resume').style.display = 'block';
      const form = $('#form-resume');
      form.reset();
      populateFacultySelects(form, cand);
      if (cand) {
        ['examineeId', 'lastName', 'firstName', 'lastKana', 'firstKana', 'birthdate', 'gender', 'email', 'phone', 'grade', 'gpa', 'motivation', 'selfPr', 'researchTopic'].forEach(k => {
          if (form.elements[k]) form.elements[k].value = cand[k] || '';
        });
      } else if (examineeId) {
        form.elements.examineeId.value = examineeId;
      }
      // Photo
      setPhotoPreview(cand?.photo || '');
      form.elements.photo.value = cand?.photo || '';
      // Qualifications as tags
      const quals = normalizeQualifications(cand?.qualifications);
      renderQualTags(quals);
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
    const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
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
    alert('履歴書を提出しました。');
    $('#portal-resume').style.display = 'none';
    renderPortal();
    renderOverview();
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
    alert(`学力試験を提出しました。\n自動採点結果: ${result.total} / ${result.max} (${result.percent.toFixed(1)}%)`);
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
    alert('アンケートを提出しました。');
    $('#portal-survey').style.display = 'none';
    renderPortal();
    renderOverview();
  }

  // ===== Question editors =====
  function renderAcademicMgr() {
    const sess = ensureTests(getSession());
    renderPhaseShare('academic', 'view-mgr-academic');
    const wrap = $('#academic-q-list');
    if (!wrap) return;
    $('#academic-q-count').textContent = `現在 ${sess.academicTest.questions.length} 問 / 合計 ${sess.academicTest.questions.reduce((s, q) => s + (q.points || 0), 0)} 点`;
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
    wrap.innerHTML = sess.surveyTest.questions.map((q, idx) => `
      <div class="q-edit-card" data-idx="${idx}">
        <div class="q-edit-head">
          <span class="q-edit-num">項目${idx + 1}</span>
          <button class="btn danger" data-act="del-survey">削除</button>
        </div>
        <textarea data-field="text" rows="2" placeholder="質問文">${escapeHtml(q.text)}</textarea>
      </div>
    `).join('') || '<p class="muted">項目がありません。</p>';
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

  function renderFacultyDeptEditor(sess) {
    const wrap = $('#faculty-dept-list');
    if (!wrap) return;
    wrap.innerHTML = (sess.facultyDept || []).map((f, idx) => `
      <div class="q-edit-card" data-idx="${idx}">
        <div class="q-edit-head">
          <span class="q-edit-num">学部${idx + 1}</span>
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
      </div>
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
    if (idx >= 0) { list[idx] = sess; localStorage.setItem('zemiSA.sessions.v1', JSON.stringify(list)); }
  }

  // ===== Share URLs + QR =====
  function buildPhaseUrl(phase) {
    const sess = getSession();
    const base = location.href.split('?')[0].split('#')[0];
    // 履歴書のみPIN不要、学力試験/アンケートはPIN付与
    const needPin = phase !== 'resume';
    const pinPart = needPin && sess.pin ? `&pin=${encodeURIComponent(sess.pin)}` : '';
    return `${base}?session=${encodeURIComponent(sess.id)}&phase=${phase}${pinPart}`;
  }
  // Render share URL + QR (+ PIN for academic/survey) for a single phase inside the specified container
  function renderPhaseShare(phase, containerId) {
    const sess = ensureTests(getSession());
    const container = document.getElementById(containerId);
    if (!container) return;
    const exist = container.querySelector('.share-section');
    if (exist) exist.remove();
    const url = buildPhaseUrl(phase);
    const needPin = phase !== 'resume';
    const section = document.createElement('div');
    section.className = 'card share-section';
    section.innerHTML = `
      <h3>🔗 受験者配布用URL / QRコード — ${PHASE_LABEL[phase]}</h3>
      ${needPin ? `
        <div class="pin-row">
          <div>
            <div class="pin-label">🔐 アクセスPIN</div>
            <div class="pin-value">${escapeHtml(sess.pin)}</div>
            <div class="pin-hint">${PHASE_LABEL[phase]}のURLにこのPINが含まれます。流出時は再発行してください（学力試験・アンケート共通）。</div>
          </div>
          <button class="btn" data-regenerate-pin>🔄 PINを再発行</button>
        </div>
      ` : ''}
      <div class="share-grid">
        <div class="share-card">
          <h4>${PHASE_LABEL[phase]}${needPin ? ' <span class="pin-badge">🔐 PIN付</span>' : ''}</h4>
          <div class="share-url">${escapeHtml(url)}</div>
          <div class="share-actions">
            <button class="btn" data-copy>URLをコピー</button>
            <a class="btn" href="${escapeHtml(url)}" target="_blank">プレビュー</a>
          </div>
          <div class="qr-area"></div>
        </div>
      </div>
    `;
    container.appendChild(section);
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    section.querySelector('.qr-area').innerHTML = qr.createImgTag(4, 8);
    section.querySelector('[data-copy]').addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => alert('URLをコピーしました'));
    });
    const regen = section.querySelector('[data-regenerate-pin]');
    if (regen) regen.addEventListener('click', () => {
      if (!confirm('PINを再発行すると、既に配布したURLは無効になります。続行しますか？')) return;
      Storage.regeneratePin(sess.id);
      // Re-render all share blocks since PIN is shared
      renderPhaseShare('resume', 'view-mgr-resume');
      renderPhaseShare('academic', 'view-mgr-academic');
      renderPhaseShare('survey', 'view-mgr-survey');
    });
  }

  // ===== URL routing (candidate mode) =====
  function handleUrlMode() {
    const params = new URLSearchParams(location.search);
    const sid = params.get('session');
    const phase = params.get('phase');
    const idParam = params.get('id');
    const pinParam = params.get('pin');
    if (!sid || !phase) return false;
    const sessions = Storage.loadSessions();
    const sess = sessions.find(s => s.id === sid);
    if (!sess) { alert('指定された試験回が見つかりません。'); return false; }
    // PIN check for academic/survey
    if ((phase === 'academic' || phase === 'survey') && sess.pin) {
      let pin = pinParam;
      if (!pin || pin !== sess.pin) {
        pin = prompt(`この試験を受けるにはアクセスPINが必要です（${PHASE_LABEL[phase]}）。配布されたPINを入力してください:`);
        if (!pin || pin !== sess.pin) { alert('PINが正しくありません。'); return false; }
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

  // ===== Settings (data tab) =====
  function loadCfgUi() {
    $('#weight-academic').value = cfg.weightAcademic;
    $('#weight-survey').value = cfg.weightSurvey;
  }
  function saveWeights() {
    const a = Number($('#weight-academic').value);
    const s = Number($('#weight-survey').value);
    if (a + s !== 100) { alert('合計が100％になるよう設定してください。'); return; }
    cfg.weightAcademic = a; cfg.weightSurvey = s;
    Storage.saveCfg(cfg);
    alert('保存しました。');
    renderOverview();
  }

  function exportJson() {
    const sess = getSession();
    const list = Storage.loadForSession();
    const payload = { session: sess, candidates: list, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zemi-${sess.name}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importJson(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        const arr = Array.isArray(obj) ? obj : (obj.candidates || []);
        if (!arr.length) throw new Error('候補データがありません');
        if (!confirm(`${arr.length}件のデータをこの試験回に取り込みます。よろしいですか？`)) return;
        arr.forEach(c => { delete c.id; Storage.upsert(c); });
        alert('取り込みました。');
        renderOverview();
      } catch (e) { alert('JSON読み込みに失敗しました: ' + e.message); }
    };
    r.readAsText(file);
  }

  // ===== Demo =====
  function seedDemo() {
    const name = `デモデータ ${new Date().toISOString().slice(0, 10)}`;
    const sess = Storage.addSession(name, { resume: true, academic: true, survey: true });
    Storage.setCurrentSessionId(sess.id);
    ensureTests(getSession());
    const live = getSession();

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
      // Interview record for ~60% of candidates
      if (i % 5 !== 0) {
        const base = Math.round(p.sv * 0.8 + 1);
        const r = () => Math.max(1, Math.min(5, base + Math.round((Math.random() - 0.5) * 2)));
        cand.interview = {
          heldAt: new Date(Date.now() - (20 - i) * 86400000).toISOString(),
          interviewer: ['田中先生', '佐藤先生', '山本先生'][i % 3],
          ratings: { communication: r(), motivation: r(), logic: r(), knowledge: r(), fit: r() },
          notes: i % 4 === 0 ? '志望動機が明確で、研究テーマへの関心が高い。論理的に説明できる。' : '受け答えは丁寧。今後の伸びしろに期待。'
        };
      }

      Storage.upsert(cand);
    });
    renderSessionBar();
    refreshAllViews();
    alert(`デモ試験回「${name}」を作成し、20名のデモ受験者を投入しました。`);
  }

  // ===== Init =====
  function init() {
    ensureTests(getSession());
    attachAdminContent();

    // URL候補者モード判定
    if (handleUrlMode()) return;

    renderSessionBar();
    // Restore saved UI state
    const savedView = _uiState.view || 'overview';
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
    if (savedView === 'profile' && _uiState.profileId) {
      const sel = $('#profile-select');
      if (sel.querySelector(`option[value="${_uiState.profileId}"]`)) {
        sel.value = _uiState.profileId;
        renderProfile(_uiState.profileId);
      }
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
    $$('.subtab:not(.adminsubtab)').forEach(t => t.addEventListener('click', () => showSubview(t.dataset.subview)));
    $$('.adminsubtab').forEach(t => t.addEventListener('click', () => showAdminview(t.dataset.adminview)));

    // Overview controls
    $('#search-cand').addEventListener('input', () => {
      saveUiState({ search: $('#search-cand').value });
      renderCandidateList();
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
    $('#profile-select').addEventListener('change', e => { saveUiState({ profileId: e.target.value }); renderProfile(e.target.value); });
    $('#print-profile').addEventListener('click', () => window.print());

    // Portal
    $('#portal-load').addEventListener('click', renderPortal);
    $('#portal-examinee-id').addEventListener('change', renderPortal);
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

    // Data tab
    $('#export-json').addEventListener('click', exportJson);
    $('#import-json').addEventListener('change', e => { if (e.target.files[0]) importJson(e.target.files[0]); });
    // weight editor removed — survey is no longer scored
    $('#seed-demo').addEventListener('click', seedDemo);
    $('#clear-all').addEventListener('click', () => {
      if (!confirm('この試験回の全受験者データを削除しますか？（試験回自体は残ります）')) return;
      Storage.clearAll(); renderOverview(); alert('削除しました。');
    });

    loadCfgUi();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
