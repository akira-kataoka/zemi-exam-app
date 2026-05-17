// Subject / survey definitions and score computations
const ACADEMIC_KEYS = [
  { key: 'logic',        label: '論理・数理' },
  { key: 'english',      label: '英語' },
  { key: 'specialty',    label: '専門知識' },
  { key: 'statistics',   label: '統計・データ' },
  { key: 'writing',      label: '文章作成' },
  { key: 'presentation', label: 'プレゼン' }
];

const SURVEY_ITEMS = [
  { key: 'sv_motivation',    label: '研究テーマへの強い興味・動機がある' },
  { key: 'sv_curiosity',     label: '知らないことを学ぶのが好き' },
  { key: 'sv_persistence',   label: '困難な課題にも粘り強く取り組める' },
  { key: 'sv_collab',        label: 'チームで議論し協働するのが得意' },
  { key: 'sv_leadership',    label: 'リーダーシップを発揮した経験がある' },
  { key: 'sv_logic',         label: '論理的に考え、整理して伝えるのが得意' },
  { key: 'sv_creativity',    label: '新しいアイデアを生み出すのが得意' },
  { key: 'sv_data',          label: '数値やデータに基づいて判断するタイプ' },
  { key: 'sv_planning',      label: '計画的にスケジュール管理ができる' },
  { key: 'sv_communication', label: '人前で話すこと・発表が得意' }
];

const Stats = (() => {
  function academicTotal(c) {
    return ACADEMIC_KEYS.reduce((s, k) => s + (Number(c[k.key]) || 0), 0);
  }
  function academicAvg(c) { return academicTotal(c) / ACADEMIC_KEYS.length; }

  function surveyAvg(c) {
    const vals = SURVEY_ITEMS.map(it => Number(c[it.key]) || 0).filter(v => v > 0);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  // Survey average is 1-5, convert to 0-100 scale for total score
  function surveyScore100(c) { return (surveyAvg(c) / 5) * 100; }

  function totalScore(c, cfg) {
    const wA = (cfg?.weightAcademic ?? 70) / 100;
    const wS = (cfg?.weightSurvey ?? 30) / 100;
    return academicAvg(c) * wA + surveyScore100(c) * wS;
  }

  function radarData(c) {
    return ACADEMIC_KEYS.map(k => Number(c[k.key]) || 0);
  }
  function surveyVector(c) {
    return SURVEY_ITEMS.map(it => Number(c[it.key]) || 0);
  }
  function featureVector(c) {
    // For clustering: academic (normalized 0-1) + survey (normalized 0-1)
    const a = ACADEMIC_KEYS.map(k => (Number(c[k.key]) || 0) / 100);
    const s = SURVEY_ITEMS.map(it => (Number(c[it.key]) || 0) / 5);
    return a.concat(s);
  }

  return {
    academicTotal, academicAvg, surveyAvg, surveyScore100,
    totalScore, radarData, surveyVector, featureVector,
    ACADEMIC_KEYS, SURVEY_ITEMS
  };
})();
