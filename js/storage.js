// localStorage wrapper for candidates + settings
const Storage = (() => {
  const KEY_CAND = 'zemiSA.candidates.v1';
  const KEY_CFG  = 'zemiSA.config.v1';

  const defaultCfg = { weightAcademic: 70, weightSurvey: 30 };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY_CAND)) || []; }
    catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(KEY_CAND, JSON.stringify(list)); }
  function loadCfg() {
    try { return Object.assign({}, defaultCfg, JSON.parse(localStorage.getItem(KEY_CFG)) || {}); }
    catch (e) { return Object.assign({}, defaultCfg); }
  }
  function saveCfg(cfg) { localStorage.setItem(KEY_CFG, JSON.stringify(cfg)); }

  function add(candidate) {
    const list = load();
    candidate.id = candidate.id || ('c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
    candidate.submittedAt = candidate.submittedAt || new Date().toISOString();
    list.push(candidate);
    save(list);
    return candidate;
  }
  function remove(id) {
    save(load().filter(c => c.id !== id));
  }
  function clearAll() { localStorage.removeItem(KEY_CAND); }

  return { load, save, add, remove, clearAll, loadCfg, saveCfg };
})();
