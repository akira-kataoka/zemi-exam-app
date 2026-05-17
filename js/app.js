// =========================================================
// ゼミ選抜アナライザー  App controller
// =========================================================
const App = (() => {

  let cfg = Storage.loadCfg();
  const charts = {};

  // ---------- View switching ----------
  function showView(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'dashboard') renderDashboard();
    if (name === 'candidates') renderCandidates();
    if (name === 'profile') refreshProfileSelect();
    if (name === 'ranking') renderRanking();
    if (name === 'cluster') {/* on-demand */}
    if (name === 'exam') goExamStep(1);
  }

  // ---------- Survey rendering ----------
  function buildSurveyItems() {
    const wrap = document.getElementById('survey-items');
    wrap.innerHTML = '';
    SURVEY_ITEMS.forEach(item => {
      const row = document.createElement('div');
      row.className = 'survey-item';
      row.innerHTML = `
        <div class="q">${item.label}</div>
        <div class="scale">
          ${[1, 2, 3, 4, 5].map(v => `
            <label><input type="radio" name="${item.key}" value="${v}" required>${v}</label>
          `).join('')}
        </div>
      `;
      wrap.appendChild(row);
    });
  }

  // ---------- Exam wizard ----------
  function goExamStep(n) {
    document.querySelectorAll('.exam-steps .step').forEach(s => {
      s.classList.remove('active', 'done');
      const num = Number(s.dataset.step);
      if (num === n) s.classList.add('active');
      else if (num < n) s.classList.add('done');
    });
    document.querySelectorAll('.exam-step').forEach(s => {
      s.classList.toggle('active', Number(s.dataset.step) === n);
    });
    if (n === 4) renderConfirm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateStep(n) {
    const section = document.querySelector(`.exam-step[data-step="${n}"]`);
    const required = section.querySelectorAll('[required]');
    for (const el of required) {
      if (!el.value || (el.type === 'radio' && !section.querySelector(`input[name="${el.name}"]:checked`))) {
        el.focus();
        alert('未入力の項目があります。');
        return false;
      }
    }
    return true;
  }

  function gatherForm() {
    const form = document.getElementById('exam-form');
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    return obj;
  }

  function renderConfirm() {
    const data = gatherForm();
    const area = document.getElementById('confirm-area');
    const acadRows = ACADEMIC_KEYS.map(k => `<dt>${k.label}</dt><dd>${data[k.key] || '-'} / 100</dd>`).join('');
    const survRows = SURVEY_ITEMS.map(it => `<dt>${it.label}</dt><dd>${data[it.key] || '-'} / 5</dd>`).join('');
    area.innerHTML = `
      <div class="confirm-block">
        <h4>履歴書</h4>
        <dl>
          <dt>受験番号</dt><dd>${escapeHtml(data.examineeId || '')}</dd>
          <dt>氏名</dt><dd>${escapeHtml(data.name || '')}（${escapeHtml(data.kana || '')}）</dd>
          <dt>大学・学部</dt><dd>${escapeHtml(data.university || '')} ${escapeHtml(data.faculty || '')} ${escapeHtml(data.grade || '')}</dd>
          <dt>GPA</dt><dd>${escapeHtml(data.gpa || '')}</dd>
          <dt>資格</dt><dd>${escapeHtml(data.qualifications || '')}</dd>
          <dt>志望動機</dt><dd>${escapeHtml(data.motivation || '')}</dd>
          <dt>自己PR</dt><dd>${escapeHtml(data.selfPr || '')}</dd>
        </dl>
      </div>
      <div class="confirm-block">
        <h4>学力試験</h4><dl>${acadRows}</dl>
      </div>
      <div class="confirm-block">
        <h4>アンケート</h4><dl>${survRows}</dl>
      </div>
      <div class="confirm-block">
        <h4>自由記述</h4>
        <dl>
          <dt>力を入れた活動</dt><dd>${escapeHtml(data.freeAchievement || '')}</dd>
          <dt>挑戦したいこと</dt><dd>${escapeHtml(data.freeAspiration || '')}</dd>
        </dl>
      </div>
    `;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    const data = gatherForm();
    // coerce numerics
    ACADEMIC_KEYS.forEach(k => data[k.key] = Number(data[k.key]));
    SURVEY_ITEMS.forEach(it => data[it.key] = Number(data[it.key]));
    data.gpa = data.gpa ? Number(data.gpa) : null;
    Storage.add(data);
    alert('提出が完了しました。');
    document.getElementById('exam-form').reset();
    showView('candidates');
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const list = Storage.load();
    document.getElementById('stat-count').textContent = list.length;
    if (list.length === 0) {
      document.getElementById('stat-avg').textContent = '-';
      document.getElementById('stat-max').textContent = '-';
      document.getElementById('stat-latest').textContent = '-';
      document.getElementById('recent-list').innerHTML = '<div class="row">まだデータがありません。</div>';
      renderDistribution([]); renderSubjectAvg([]);
      return;
    }
    const totals = list.map(c => Stats.totalScore(c, cfg));
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const max = Math.max(...totals);
    const latest = list.reduce((a, b) => new Date(a.submittedAt) > new Date(b.submittedAt) ? a : b);
    document.getElementById('stat-avg').textContent = avg.toFixed(1);
    document.getElementById('stat-max').textContent = max.toFixed(1);
    document.getElementById('stat-latest').textContent = formatDate(latest.submittedAt);

    const recent = [...list].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 5);
    document.getElementById('recent-list').innerHTML = recent.map(c => `
      <div class="row">
        <div><strong>${escapeHtml(c.name)}</strong> <span class="meta">${escapeHtml(c.examineeId)} ・ ${escapeHtml(c.university || '')}</span></div>
        <div class="meta">${formatDate(c.submittedAt)} ・ 総合 <strong>${Stats.totalScore(c, cfg).toFixed(1)}</strong></div>
      </div>
    `).join('');

    renderDistribution(totals);
    renderSubjectAvg(list);
  }

  function renderDistribution(totals) {
    const ctx = document.getElementById('chart-distribution');
    if (!ctx) return;
    const bins = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const labels = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'];
    totals.forEach(t => { const i = Math.min(9, Math.floor(t / 10)); bins[i]++; });
    if (charts.dist) charts.dist.destroy();
    charts.dist = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: '受験者数', data: bins, backgroundColor: '#2563eb' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }

  function renderSubjectAvg(list) {
    const ctx = document.getElementById('chart-subjects');
    if (!ctx) return;
    const labels = ACADEMIC_KEYS.map(k => k.label);
    const avgs = ACADEMIC_KEYS.map(k => list.length ? list.reduce((s, c) => s + (Number(c[k.key]) || 0), 0) / list.length : 0);
    if (charts.subj) charts.subj.destroy();
    charts.subj = new Chart(ctx, {
      type: 'radar',
      data: { labels, datasets: [{ label: '平均点', data: avgs, backgroundColor: 'rgba(16,185,129,.2)', borderColor: '#10b981', pointBackgroundColor: '#10b981' }] },
      options: { responsive: true, scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } } }
    });
  }

  // ---------- Candidates list ----------
  function renderCandidates() {
    const tbody = document.querySelector('#cand-table tbody');
    const q = document.getElementById('search-cand').value.trim().toLowerCase();
    const sort = document.getElementById('sort-cand').value;
    let list = Storage.load();
    if (q) list = list.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.examineeId || '').toLowerCase().includes(q) ||
      (c.university || '').toLowerCase().includes(q)
    );
    const enriched = list.map(c => ({
      c,
      academic: Stats.academicAvg(c),
      survey: Stats.surveyAvg(c),
      total: Stats.totalScore(c, cfg)
    }));
    switch (sort) {
      case 'date-asc':   enriched.sort((a, b) => new Date(a.c.submittedAt) - new Date(b.c.submittedAt)); break;
      case 'score-desc': enriched.sort((a, b) => b.total - a.total); break;
      case 'score-asc':  enriched.sort((a, b) => a.total - b.total); break;
      case 'name':       enriched.sort((a, b) => (a.c.name || '').localeCompare(b.c.name || '', 'ja')); break;
      default:           enriched.sort((a, b) => new Date(b.c.submittedAt) - new Date(a.c.submittedAt));
    }
    tbody.innerHTML = enriched.map(({ c, academic, survey, total }) => `
      <tr data-id="${c.id}">
        <td>${escapeHtml(c.examineeId || '')}</td>
        <td>${escapeHtml(c.name || '')}</td>
        <td>${escapeHtml((c.university || '') + ' ' + (c.faculty || ''))}</td>
        <td class="num">${academic.toFixed(1)}</td>
        <td class="num">${survey.toFixed(2)}</td>
        <td class="num"><strong>${total.toFixed(1)}</strong></td>
        <td>${formatDate(c.submittedAt)}</td>
        <td class="row-actions">
          <button class="btn" data-act="view">詳細</button>
          <button class="btn danger" data-act="del">削除</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">データがありません。</td></tr>`;
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.querySelector('[data-act="view"]')?.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('profile-select').value = tr.dataset.id;
        showView('profile');
        renderProfile(tr.dataset.id);
      });
      tr.querySelector('[data-act="del"]')?.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('この受験者データを削除しますか？')) {
          Storage.remove(tr.dataset.id);
          renderCandidates();
        }
      });
      tr.addEventListener('click', () => {
        document.getElementById('profile-select').value = tr.dataset.id;
        showView('profile');
        renderProfile(tr.dataset.id);
      });
    });
  }

  // ---------- Profile ----------
  function refreshProfileSelect() {
    const sel = document.getElementById('profile-select');
    const current = sel.value;
    const list = Storage.load();
    sel.innerHTML = '<option value="">-- 受験者を選択 --</option>' +
      list.map(c => `<option value="${c.id}">${escapeHtml(c.examineeId || '')} ${escapeHtml(c.name || '')}</option>`).join('');
    if (current && list.find(c => c.id === current)) {
      sel.value = current;
      renderProfile(current);
    } else {
      document.getElementById('profile-body').innerHTML = '<div class="card" style="text-align:center;color:var(--muted)">上のドロップダウンから受験者を選択してください。</div>';
    }
  }

  function renderProfile(id) {
    const c = Storage.load().find(x => x.id === id);
    const body = document.getElementById('profile-body');
    if (!c) { body.innerHTML = ''; return; }
    const academic = Stats.academicAvg(c);
    const survey = Stats.surveyAvg(c);
    const total = Stats.totalScore(c, cfg);

    body.innerHTML = `
      <div class="profile-card">
        <div class="profile-head">
          <div>
            <div class="profile-name">${escapeHtml(c.name || '')}</div>
            <div class="profile-meta">${escapeHtml(c.kana || '')}</div>
            <div class="profile-meta">受験番号: ${escapeHtml(c.examineeId || '')} ・ ${escapeHtml(c.university || '')} ${escapeHtml(c.faculty || '')} ${escapeHtml(c.grade || '')}</div>
            <div class="profile-meta">提出: ${formatDate(c.submittedAt)}</div>
          </div>
          <div>
            <div class="score-badges">
              <span class="score-badge">総合 ${total.toFixed(1)}</span>
              <span class="score-badge alt">学力平均 ${academic.toFixed(1)}</span>
              <span class="score-badge warn">アンケート ${survey.toFixed(2)}/5</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="profile-card">
          <h3>学力試験レーダー</h3>
          <canvas id="profile-radar-academic" height="280"></canvas>
        </div>
        <div class="profile-card">
          <h3>アンケート傾向</h3>
          <canvas id="profile-radar-survey" height="280"></canvas>
        </div>
      </div>

      <div class="profile-card">
        <h3>履歴書情報</h3>
        <div class="form-grid">
          <div><dt>生年月日</dt><dd>${escapeHtml(c.birthdate || '')}</dd></div>
          <div><dt>性別</dt><dd>${escapeHtml(c.gender || '')}</dd></div>
          <div><dt>メール</dt><dd>${escapeHtml(c.email || '')}</dd></div>
          <div><dt>電話</dt><dd>${escapeHtml(c.phone || '')}</dd></div>
          <div><dt>GPA</dt><dd>${c.gpa ?? ''}</dd></div>
          <div><dt>資格</dt><dd>${escapeHtml(c.qualifications || '')}</dd></div>
        </div>
        <h4 style="margin-top:14px">志望動機</h4><p>${escapeHtml(c.motivation || '')}</p>
        <h4>自己PR</h4><p>${escapeHtml(c.selfPr || '')}</p>
        <h4>研究したいテーマ</h4><p>${escapeHtml(c.researchTopic || '')}</p>
      </div>

      <div class="profile-card">
        <h3>自由記述</h3>
        <h4>力を入れた活動</h4><p>${escapeHtml(c.freeAchievement || '')}</p>
        <h4>挑戦したいこと</h4><p>${escapeHtml(c.freeAspiration || '')}</p>
      </div>
    `;

    // Radar charts
    new Chart(document.getElementById('profile-radar-academic'), {
      type: 'radar',
      data: {
        labels: ACADEMIC_KEYS.map(k => k.label),
        datasets: [{
          label: c.name,
          data: ACADEMIC_KEYS.map(k => Number(c[k.key]) || 0),
          backgroundColor: 'rgba(37,99,235,.2)',
          borderColor: '#2563eb',
          pointBackgroundColor: '#2563eb'
        }]
      },
      options: { responsive: true, scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } } }
    });
    new Chart(document.getElementById('profile-radar-survey'), {
      type: 'radar',
      data: {
        labels: SURVEY_ITEMS.map(it => it.label.length > 10 ? it.label.slice(0, 10) + '…' : it.label),
        datasets: [{
          label: 'アンケート',
          data: SURVEY_ITEMS.map(it => Number(c[it.key]) || 0),
          backgroundColor: 'rgba(245,158,11,.2)',
          borderColor: '#f59e0b',
          pointBackgroundColor: '#f59e0b'
        }]
      },
      options: { responsive: true, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
    });
  }

  // ---------- Ranking ----------
  function renderRanking() {
    const n = Number(document.getElementById('rank-n').value);
    const metric = document.getElementById('rank-metric').value;
    const list = Storage.load().map(c => {
      const academic = Stats.academicAvg(c);
      const survey = Stats.surveyAvg(c);
      const total = Stats.totalScore(c, cfg);
      return { c, academic, survey, total };
    });
    let key;
    if (metric === 'academic') key = x => x.academic;
    else if (metric === 'survey') key = x => x.survey;
    else key = x => x.total;
    list.sort((a, b) => key(b) - key(a));
    const top = list.slice(0, n);
    const tbody = document.querySelector('#rank-table tbody');
    tbody.innerHTML = top.map((x, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(x.c.examineeId || '')}</td>
        <td>${escapeHtml(x.c.name || '')}</td>
        <td class="num">${x.academic.toFixed(1)}</td>
        <td class="num">${x.survey.toFixed(2)}</td>
        <td class="num"><strong>${x.total.toFixed(1)}</strong></td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">データがありません。</td></tr>`;
  }

  // ---------- Cluster ----------
  function runCluster() {
    const k = Math.max(2, Math.min(8, Number(document.getElementById('k-value').value) || 3));
    const list = Storage.load();
    if (list.length < k) { alert(`受験者が ${k} 人未満のためクラスター分析できません。`); return; }
    const vectors = list.map(c => Stats.featureVector(c));
    const { assignments, centroids } = Cluster.kmeans(vectors, k);
    const { points } = Cluster.pca2(vectors);

    const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

    // Scatter
    const ctx = document.getElementById('chart-cluster');
    if (charts.cluster) charts.cluster.destroy();
    const datasets = [];
    for (let c = 0; c < k; c++) {
      const ptsForK = points.map((p, i) => ({ x: p[0], y: p[1], _idx: i }))
                            .filter((_, i) => assignments[i] === c);
      datasets.push({
        label: `クラスター ${c + 1} (${ptsForK.length}名)`,
        data: ptsForK,
        backgroundColor: palette[c % palette.length],
        pointRadius: 6,
        pointHoverRadius: 9
      });
    }
    charts.cluster = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => {
                const p = ctx.raw;
                const c = list[p._idx];
                return `${c.name} (${c.examineeId})`;
              }
            }
          }
        },
        scales: { x: { title: { display: true, text: 'PC1' } }, y: { title: { display: true, text: 'PC2' } } }
      }
    });

    // Centroid radar (academic dims only - first 6 features)
    const ctxR = document.getElementById('chart-cluster-radar');
    if (charts.clusterRadar) charts.clusterRadar.destroy();
    const radarDatasets = centroids.map((c, i) => ({
      label: `クラスター ${i + 1}`,
      data: c.slice(0, ACADEMIC_KEYS.length).map(v => v * 100), // un-normalize
      backgroundColor: palette[i % palette.length] + '33',
      borderColor: palette[i % palette.length],
      pointBackgroundColor: palette[i % palette.length]
    }));
    charts.clusterRadar = new Chart(ctxR, {
      type: 'radar',
      data: { labels: ACADEMIC_KEYS.map(k => k.label), datasets: radarDatasets },
      options: { responsive: true, scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } } }
    });

    // Assignment list
    const assignWrap = document.getElementById('cluster-assign-list');
    let html = '';
    for (let c = 0; c < k; c++) {
      const members = list.filter((_, i) => assignments[i] === c);
      html += `<div style="margin-bottom:14px"><strong style="color:${palette[c % palette.length]}">クラスター ${c + 1}</strong>（${members.length}名）<br>`;
      members.forEach(m => {
        html += `<span class="cluster-chip" style="background:${palette[c % palette.length]}">${escapeHtml(m.name)} (${escapeHtml(m.examineeId || '')})</span>`;
      });
      html += '</div>';
    }
    assignWrap.innerHTML = html;
  }

  // ---------- Settings ----------
  function loadCfgUi() {
    document.getElementById('weight-academic').value = cfg.weightAcademic;
    document.getElementById('weight-survey').value = cfg.weightSurvey;
  }
  function saveWeights() {
    const a = Number(document.getElementById('weight-academic').value);
    const s = Number(document.getElementById('weight-survey').value);
    if (a + s !== 100) { alert('合計が100％になるよう設定してください。'); return; }
    cfg.weightAcademic = a; cfg.weightSurvey = s;
    Storage.saveCfg(cfg);
    alert('保存しました。');
  }

  // ---------- Import / Export ----------
  function exportJson() {
    const data = JSON.stringify(Storage.load(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zemi-candidates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importJson(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const arr = JSON.parse(r.result);
        if (!Array.isArray(arr)) throw new Error('不正な形式');
        if (!confirm(`${arr.length}件のデータを取り込みます。既存に追加されます。よろしいですか？`)) return;
        const existing = Storage.load();
        Storage.save(existing.concat(arr));
        alert('取り込みました。');
        renderCandidates();
      } catch (e) { alert('JSON読み込みに失敗しました: ' + e.message); }
    };
    r.readAsText(file);
  }

  // ---------- Demo data ----------
  function seedDemo() {
    if (Storage.load().length > 0 && !confirm('既存データに追加します。続行しますか？')) return;
    const universities = ['東都大学', '関西商科大学', '北辰大学', '南海工科大学', '中央経済大学'];
    const faculties = ['経済学部', '商学部', '情報学部', '社会学部', '法学部'];
    const names = [
      ['佐藤 大輔', 'サトウ ダイスケ'], ['田中 美咲', 'タナカ ミサキ'], ['鈴木 健', 'スズキ ケン'],
      ['高橋 優子', 'タカハシ ユウコ'], ['伊藤 翔', 'イトウ ショウ'], ['渡辺 葵', 'ワタナベ アオイ'],
      ['山本 直樹', 'ヤマモト ナオキ'], ['中村 さくら', 'ナカムラ サクラ'], ['小林 蓮', 'コバヤシ レン'],
      ['加藤 結衣', 'カトウ ユイ'], ['吉田 颯太', 'ヨシダ ソウタ'], ['山田 凛', 'ヤマダ リン'],
      ['佐々木 陽', 'ササキ ヨウ'], ['松本 美月', 'マツモト ミヅキ'], ['井上 拓海', 'イノウエ タクミ'],
      ['木村 莉子', 'キムラ リコ'], ['林 大和', 'ハヤシ ヤマト'], ['清水 紗良', 'シミズ サラ'],
      ['山崎 蒼', 'ヤマザキ ソウ'], ['森 結菜', 'モリ ユウナ']
    ];
    const profiles = [
      { logic: 90, english: 85, specialty: 80, statistics: 88, writing: 75, presentation: 82, sv: [5, 5, 4, 4, 4, 5, 4, 5, 4, 4] }, // 学力高型
      { logic: 60, english: 65, specialty: 70, statistics: 60, writing: 80, presentation: 88, sv: [5, 5, 5, 5, 5, 3, 5, 3, 4, 5] }, // コミュ型
      { logic: 78, english: 72, specialty: 75, statistics: 80, writing: 78, presentation: 75, sv: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4] }, // バランス
      { logic: 95, english: 60, specialty: 90, statistics: 92, writing: 50, presentation: 55, sv: [3, 4, 3, 2, 2, 5, 3, 5, 3, 2] }  // 理論型
    ];
    names.forEach((n, i) => {
      const p = profiles[i % profiles.length];
      const jitter = () => Math.round((Math.random() - 0.5) * 16);
      const cand = {
        examineeId: 'Z' + String(2025001 + i),
        name: n[0], kana: n[1],
        birthdate: `200${3 + (i % 5)}-0${1 + (i % 9)}-1${i % 9}`,
        gender: i % 2 ? '女性' : '男性',
        email: `applicant${i + 1}@example.com`, phone: `090-${1000 + i}-${1000 + i}`,
        university: universities[i % universities.length],
        faculty: faculties[i % faculties.length],
        grade: '2年',
        gpa: (2.0 + Math.random() * 2).toFixed(2),
        qualifications: i % 3 === 0 ? 'TOEIC 750' : '',
        motivation: 'データ分析を通じて社会課題を解決したいと考えています。',
        selfPr: 'チームでの企画運営経験があり、議論をまとめるのが得意です。',
        researchTopic: '消費者行動と購買データの関係',
        logic: clamp(p.logic + jitter()),
        english: clamp(p.english + jitter()),
        specialty: clamp(p.specialty + jitter()),
        statistics: clamp(p.statistics + jitter()),
        writing: clamp(p.writing + jitter()),
        presentation: clamp(p.presentation + jitter()),
        freeAchievement: '学園祭実行委員として広報を担当しました。',
        freeAspiration: '実データを用いたゼミ研究プロジェクトに挑戦したい。'
      };
      SURVEY_ITEMS.forEach((it, k) => { cand[it.key] = clampSv(p.sv[k] + (Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0)); });
      Storage.add(cand);
    });
    alert('デモデータ20件を投入しました。');
    renderDashboard();
  }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function clampSv(v) { return Math.max(1, Math.min(5, v)); }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ---------- Init ----------
  function init() {
    buildSurveyItems();
    loadCfgUi();
    showView('dashboard');

    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
    document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => {
      const target = Number(btn.dataset.go);
      const current = Number(document.querySelector('.exam-step.active').dataset.step);
      if (target > current && !validateStep(current)) return;
      goExamStep(target);
    }));
    document.getElementById('exam-form').addEventListener('submit', handleSubmit);
    document.getElementById('search-cand').addEventListener('input', renderCandidates);
    document.getElementById('sort-cand').addEventListener('change', renderCandidates);
    document.getElementById('export-json').addEventListener('click', exportJson);
    document.getElementById('import-json').addEventListener('change', e => {
      if (e.target.files[0]) importJson(e.target.files[0]);
    });
    document.getElementById('profile-select').addEventListener('change', e => renderProfile(e.target.value));
    document.getElementById('print-profile').addEventListener('click', () => window.print());
    document.getElementById('rank-n').addEventListener('change', renderRanking);
    document.getElementById('rank-metric').addEventListener('change', renderRanking);
    document.getElementById('run-cluster').addEventListener('click', runCluster);
    document.getElementById('save-weights').addEventListener('click', () => { saveWeights(); renderDashboard(); });
    document.getElementById('seed-demo').addEventListener('click', seedDemo);
    document.getElementById('clear-all').addEventListener('click', () => {
      if (confirm('本当に全データを削除しますか？この操作は取り消せません。')) {
        Storage.clearAll();
        renderDashboard();
        alert('削除しました。');
      }
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
