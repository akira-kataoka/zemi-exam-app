// K-means + simple PCA(2D) without external deps
const Cluster = (() => {

  function distance(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  function meanVec(vecs) {
    if (vecs.length === 0) return [];
    const dim = vecs[0].length;
    const out = new Array(dim).fill(0);
    for (const v of vecs) for (let i = 0; i < dim; i++) out[i] += v[i];
    for (let i = 0; i < dim; i++) out[i] /= vecs.length;
    return out;
  }

  function kmeans(data, k, maxIter = 100) {
    if (data.length === 0 || k < 1) return { assignments: [], centroids: [] };
    k = Math.min(k, data.length);
    // k-means++ init
    const centroids = [];
    centroids.push(data[Math.floor(Math.random() * data.length)].slice());
    while (centroids.length < k) {
      const dists = data.map(p => Math.min(...centroids.map(c => distance(p, c) ** 2)));
      const sum = dists.reduce((a, b) => a + b, 0);
      let r = Math.random() * sum;
      let idx = 0;
      for (let i = 0; i < dists.length; i++) { r -= dists[i]; if (r <= 0) { idx = i; break; } }
      centroids.push(data[idx].slice());
    }

    let assignments = new Array(data.length).fill(0);
    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;
      for (let i = 0; i < data.length; i++) {
        let best = 0, bestD = Infinity;
        for (let c = 0; c < k; c++) {
          const d = distance(data[i], centroids[c]);
          if (d < bestD) { bestD = d; best = c; }
        }
        if (assignments[i] !== best) { assignments[i] = best; changed = true; }
      }
      for (let c = 0; c < k; c++) {
        const members = data.filter((_, i) => assignments[i] === c);
        if (members.length > 0) centroids[c] = meanVec(members);
      }
      if (!changed) break;
    }
    return { assignments, centroids };
  }

  // Simple PCA to 2D using power iteration for top-2 eigenvectors of covariance
  function pca2(data) {
    if (data.length === 0) return { points: [], variance: [0, 0] };
    const n = data.length;
    const dim = data[0].length;
    const mean = meanVec(data);
    const X = data.map(v => v.map((x, i) => x - mean[i]));

    // Covariance matrix dim x dim
    const cov = Array.from({ length: dim }, () => new Array(dim).fill(0));
    for (const v of X) {
      for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) cov[i][j] += v[i] * v[j];
    }
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) cov[i][j] /= Math.max(n - 1, 1);

    function multiply(m, v) {
      const out = new Array(v.length).fill(0);
      for (let i = 0; i < v.length; i++) for (let j = 0; j < v.length; j++) out[i] += m[i][j] * v[j];
      return out;
    }
    function norm(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }
    function powerIter(m, iters = 100) {
      let v = new Array(m.length).fill(0).map(() => Math.random());
      let l = norm(v); v = v.map(x => x / (l || 1));
      for (let i = 0; i < iters; i++) {
        v = multiply(m, v);
        l = norm(v); v = v.map(x => x / (l || 1));
      }
      // eigenvalue approx (Rayleigh quotient)
      const Av = multiply(m, v);
      const eig = v.reduce((s, x, i) => s + x * Av[i], 0);
      return { vec: v, val: eig };
    }
    const pc1 = powerIter(cov);
    // Deflate
    const cov2 = cov.map((row, i) => row.map((val, j) => val - pc1.val * pc1.vec[i] * pc1.vec[j]));
    const pc2 = powerIter(cov2);

    const points = X.map(v => [
      v.reduce((s, x, i) => s + x * pc1.vec[i], 0),
      v.reduce((s, x, i) => s + x * pc2.vec[i], 0)
    ]);
    return { points, variance: [pc1.val, pc2.val] };
  }

  return { kmeans, pca2, meanVec };
})();
