// Default test banks + scoring utilities. Sessions carry their own banks via session.academicTest / session.surveyTest.

const DEFAULT_ACADEMIC_CATEGORIES = ['論理・数理', '英語', '専門知識', '統計・データ', '文章作成', 'プレゼン'];

// 12 sample multiple-choice questions across 6 categories (auto-scoring)
const DEFAULT_ACADEMIC_QUESTIONS = [
  { id: 'q_a1', category: '論理・数理', points: 10,
    text: '次の数列の?に当てはまる数は？  2, 4, 8, 16, ?',
    choices: ['20', '24', '32', '48'], correctIndex: 2 },
  { id: 'q_a2', category: '論理・数理', points: 10,
    text: '「すべてのAはBである」が真のとき、必ず真と言えるのは？',
    choices: ['すべてのBはAである', 'AでないものはBでない', 'BでないものはAでない', 'AはBではない'], correctIndex: 2 },
  { id: 'q_a3', category: '英語', points: 10,
    text: 'Choose the correct word: "She has been working here ___ 2010."',
    choices: ['since', 'for', 'from', 'during'], correctIndex: 0 },
  { id: 'q_a4', category: '英語', points: 10,
    text: '"ubiquitous" の意味として最も近いのは？',
    choices: ['希少な', '遍在する', '一時的な', '巨大な'], correctIndex: 1 },
  { id: 'q_a5', category: '専門知識', points: 10,
    text: '経済学における「機会費用」とは？',
    choices: ['購入時に実際に支払う金額', '選択しなかった選択肢から得られたはずの利益', '生産にかかる総コスト', '需要と供給の差額'], correctIndex: 1 },
  { id: 'q_a6', category: '専門知識', points: 10,
    text: 'マーケティングの4Pに含まれないのは？',
    choices: ['Product', 'Price', 'People', 'Promotion'], correctIndex: 2 },
  { id: 'q_a7', category: '統計・データ', points: 10,
    text: '標本平均と母平均の差を扱う仮説検定で最も基本的なものは？',
    choices: ['t検定', 'カイ二乗検定', '回帰分析', 'クラスター分析'], correctIndex: 0 },
  { id: 'q_a8', category: '統計・データ', points: 10,
    text: '次の値の中央値を求めよ: 3, 7, 8, 12, 15',
    choices: ['7', '8', '9', '12'], correctIndex: 1 },
  { id: 'q_a9', category: '文章作成', points: 10,
    text: '次のうち、論理的な文章として最も適切な接続詞は？「気温が下がった。___厚着をした。」',
    choices: ['しかし', 'そこで', 'ところが', 'なお'], correctIndex: 1 },
  { id: 'q_a10', category: '文章作成', points: 10,
    text: '次の文の誤りを正すと？「彼の主張は事実と違くて、説得力がない。」',
    choices: ['違って', '違いて', '違く', '違うで'], correctIndex: 0 },
  { id: 'q_a11', category: 'プレゼン', points: 10,
    text: 'プレゼン冒頭で最も重要なのは？',
    choices: ['詳細データの提示', '聞き手の関心を引く問題提起', '全資料の配布', 'すべての結論を述べる'], correctIndex: 1 },
  { id: 'q_a12', category: 'プレゼン', points: 10,
    text: '聞き手に行動を促す結びとして適切でないのは？',
    choices: ['具体的な次のアクションを提示する', '結論を1文で再確認する', '質問を受け付ける', '冗長な謝辞を長く述べる'], correctIndex: 3 }
];

const DEFAULT_FACULTY_DEPT = [
  { name: '経済学部', departments: ['経済学科', '国際経済学科'] },
  { name: '商学部',   departments: ['商学科', '会計学科', 'マーケティング学科'] },
  { name: '経営学部', departments: ['経営学科', '経営戦略学科'] },
  { name: '情報学部', departments: ['情報科学科', 'データサイエンス学科'] },
  { name: '社会学部', departments: ['社会学科', 'メディア社会学科'] },
  { name: '法学部',   departments: ['法律学科', '政治学科'] }
];

const DEFAULT_SURVEY_QUESTIONS = [
  { id: 'q_s1',  text: '研究テーマへの強い興味・動機がある' },
  { id: 'q_s2',  text: '知らないことを学ぶのが好き' },
  { id: 'q_s3',  text: '困難な課題にも粘り強く取り組める' },
  { id: 'q_s4',  text: 'チームで議論し協働するのが得意' },
  { id: 'q_s5',  text: 'リーダーシップを発揮した経験がある' },
  { id: 'q_s6',  text: '論理的に考え、整理して伝えるのが得意' },
  { id: 'q_s7',  text: '新しいアイデアを生み出すのが得意' },
  { id: 'q_s8',  text: '数値やデータに基づいて判断するタイプ' },
  { id: 'q_s9',  text: '計画的にスケジュール管理ができる' },
  { id: 'q_s10', text: '人前で話すこと・発表が得意' }
];

const Stats = (() => {

  // Academic auto-scoring
  function scoreAcademic(candidate, academicTest) {
    if (!academicTest || !academicTest.questions || !candidate.academicAnswers) {
      return { total: 0, max: 0, percent: 0, perCategory: {} };
    }
    let total = 0, max = 0;
    const cat = {};
    academicTest.questions.forEach(q => {
      max += q.points;
      const a = candidate.academicAnswers[q.id];
      const correct = (a !== undefined && Number(a) === q.correctIndex);
      const got = correct ? q.points : 0;
      total += got;
      const c = q.category || 'その他';
      if (!cat[c]) cat[c] = { got: 0, max: 0 };
      cat[c].got += got;
      cat[c].max += q.points;
    });
    const percent = max ? (total / max) * 100 : 0;
    const perCategory = {};
    Object.keys(cat).forEach(k => { perCategory[k] = cat[k].max ? (cat[k].got / cat[k].max) * 100 : 0; });
    return { total, max, percent, perCategory };
  }

  function surveyAvg(candidate, surveyTest) {
    if (!surveyTest || !surveyTest.questions || !candidate.surveyAnswers) return 0;
    const vals = surveyTest.questions.map(q => Number(candidate.surveyAnswers[q.id]) || 0).filter(v => v > 0);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  function surveyScore100(c, st) { return (surveyAvg(c, st) / 5) * 100; }

  function totalScore(candidate, session) {
    // アンケートはスコア化しない方針: 総合点 = 学力試験の正答率(%)
    return scoreAcademic(candidate, session?.academicTest).percent;
  }

  function radarData(candidate, session) {
    const { perCategory } = scoreAcademic(candidate, session?.academicTest);
    const cats = session?.academicTest?.questions?.length
      ? [...new Set(session.academicTest.questions.map(q => q.category || 'その他'))]
      : DEFAULT_ACADEMIC_CATEGORIES;
    return { labels: cats, data: cats.map(c => perCategory[c] || 0) };
  }

  function surveyVector(candidate, session) {
    const qs = session?.surveyTest?.questions || [];
    return qs.map(q => Number(candidate.surveyAnswers?.[q.id]) || 0);
  }

  function featureVector(candidate, session) {
    // Cluster feature: academic%(0-1) + survey(0-1) + interview avg per category(0-1)
    const { perCategory } = scoreAcademic(candidate, session?.academicTest);
    const cats = session?.academicTest?.questions?.length
      ? [...new Set(session.academicTest.questions.map(q => q.category || 'その他'))]
      : DEFAULT_ACADEMIC_CATEGORIES;
    const a = cats.map(c => (perCategory[c] || 0) / 100);
    const s = (session?.surveyTest?.questions || []).map(q => (Number(candidate.surveyAnswers?.[q.id]) || 0) / 5);
    // 面接評価の各カテゴリ平均 (0-1)
    const ivRatings = getInterviewRatings(session);
    const ivAvgs = interviewCategoryAvgs(candidate, session);
    const iv = ivRatings.map(r => (ivAvgs[r.key] || 0) / 5);
    return a.concat(s).concat(iv);
  }

  // Per-phase completion
  function hasApplication(c) { return !!(c && c.applicationSubmittedAt); }
  function hasResume(c) { return !!(c && c.resumeSubmittedAt); }
  function hasAcademic(c) { return !!(c && c.academicSubmittedAt); }
  function hasSurvey(c)   { return !!(c && c.surveySubmittedAt); }

  // デフォルトの面接評価項目（試験回ごとにカスタマイズ可）
  const INTERVIEW_RATINGS = [
    { key: 'communication', label: 'コミュニケーション' },
    { key: 'motivation',    label: '志望度・熱意' },
    { key: 'logic',         label: '論理性・思考力' },
    { key: 'knowledge',     label: '専門性・知識' },
    { key: 'fit',           label: '適性・人柄' }
  ];
  // 試験回のカスタム評価項目を取得（未設定ならデフォルトを返す）
  function getInterviewRatings(session) {
    if (session?.interviewRatings && Array.isArray(session.interviewRatings) && session.interviewRatings.length > 0) {
      return session.interviewRatings;
    }
    return INTERVIEW_RATINGS;
  }

  // Get interview records as array (backward-compat for legacy single-record format)
  function interviewRecords(c) {
    if (!c || !c.interview) return [];
    if (Array.isArray(c.interview.records)) return c.interview.records;
    if (c.interview.heldAt) {
      // legacy single-record migration
      return [{
        id: 'legacy_' + (c.id || ''),
        heldAt: c.interview.heldAt,
        interviewer: c.interview.interviewer || '',
        ratings: c.interview.ratings || {},
        notes: c.interview.notes || ''
      }];
    }
    return [];
  }
  function hasInterview(c){ return interviewRecords(c).length > 0; }
  function interviewCount(c) { return interviewRecords(c).length; }
  function interviewScheduledAt(c) { return c?.interview?.scheduledAt || null; }

  // Average rating across all interviewers and all categories
  function interviewAvg(c, session) {
    const recs = interviewRecords(c);
    if (recs.length === 0) return 0;
    const ratings = getInterviewRatings(session);
    const vals = [];
    recs.forEach(r => ratings.forEach(k => {
      const v = Number(r.ratings?.[k.key]) || 0;
      if (v > 0) vals.push(v);
    }));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  // Per-category average across interviewers
  function interviewCategoryAvgs(c, session) {
    const recs = interviewRecords(c);
    const ratings = getInterviewRatings(session);
    const out = {};
    ratings.forEach(k => {
      const vals = recs.map(r => Number(r.ratings?.[k.key]) || 0).filter(v => v > 0);
      out[k.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    return out;
  }

  // Inter-rater variance (standard deviation of overall avg per record) — higher = more disagreement
  function interviewDisagreement(c, session) {
    const recs = interviewRecords(c);
    if (recs.length < 2) return 0;
    const ratings = getInterviewRatings(session);
    const perRecAvg = recs.map(r => {
      const vals = ratings.map(k => Number(r.ratings?.[k.key]) || 0).filter(v => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    const m = perRecAvg.reduce((a, b) => a + b, 0) / perRecAvg.length;
    const v = perRecAvg.reduce((s, x) => s + (x - m) ** 2, 0) / perRecAvg.length;
    return Math.sqrt(v);
  }

  return {
    scoreAcademic, surveyAvg, surveyScore100, totalScore,
    radarData, surveyVector, featureVector,
    hasApplication, hasResume, hasAcademic, hasSurvey, hasInterview, interviewAvg, interviewRecords, interviewCount, interviewScheduledAt, interviewCategoryAvgs, interviewDisagreement, getInterviewRatings,
    DEFAULT_ACADEMIC_CATEGORIES, DEFAULT_ACADEMIC_QUESTIONS, DEFAULT_SURVEY_QUESTIONS, DEFAULT_FACULTY_DEPT, INTERVIEW_RATINGS
  };
})();
