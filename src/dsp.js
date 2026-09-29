// Speech matching for a small, fixed list of phrases.
// Turns audio into MFCC feature frames, then compares a new utterance against
// recorded examples with dynamic time warping (DTW). Runs fully on-device.
(function (root) {
  'use strict';

  var TARGET_SR = 16000;
  var FRAME_MS = 25, HOP_MS = 10;
  var N_MELS = 26, N_CEPS = 13;

  function resample(samples, fromSr, toSr) {
    if (fromSr === toSr) return Float32Array.from(samples);
    var ratio = fromSr / toSr;
    var n = Math.floor(samples.length / ratio);
    var out = new Float32Array(n);
    // Simple box-filter anti-aliasing followed by linear interpolation.
    var win = Math.max(1, Math.round(ratio));
    for (var i = 0; i < n; i++) {
      var pos = i * ratio, i0 = Math.floor(pos), acc = 0, cnt = 0;
      for (var k = 0; k < win && i0 + k < samples.length; k++) { acc += samples[i0 + k]; cnt++; }
      out[i] = cnt ? acc / cnt : 0;
    }
    return out;
  }

  // Keep the loud part of the recording, with a little padding.
  function trimSilence(x, sr) {
    var hop = Math.round(sr * 0.01), frames = [];
    for (var i = 0; i + hop <= x.length; i += hop) {
      var e = 0;
      for (var j = i; j < i + hop; j++) e += x[j] * x[j];
      frames.push(Math.sqrt(e / hop));
    }
    if (!frames.length) return x;
    var sorted = frames.slice().sort(function (a, b) { return a - b; });
    var noise = sorted[Math.floor(sorted.length * 0.1)];
    var peak = sorted[sorted.length - 1];
    var thr = Math.max(noise * 3, peak * 0.08, 1e-4);
    var first = -1, last = -1;
    for (var f = 0; f < frames.length; f++) if (frames[f] > thr) { if (first < 0) first = f; last = f; }
    if (first < 0) return new Float32Array(0);
    var pad = 10; // 100 ms
    var s = Math.max(0, (first - pad) * hop), e2 = Math.min(x.length, (last + 1 + pad) * hop);
    return x.subarray ? x.subarray(s, e2) : x.slice(s, e2);
  }

  function peakLevel(x) {
    var m = 0;
    for (var i = 0; i < x.length; i++) { var a = Math.abs(x[i]); if (a > m) m = a; }
    return m;
  }

  function fft(re, im) {
    var n = re.length, i, j, k;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var a = i + k, b = a + len / 2;
          var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  var melCache = {};
  function melBank(nfft, sr) {
    var key = nfft + ':' + sr;
    if (melCache[key]) return melCache[key];
    function hz2mel(h) { return 2595 * Math.log10(1 + h / 700); }
    function mel2hz(m) { return 700 * (Math.pow(10, m / 2595) - 1); }
    var lo = hz2mel(60), hi = hz2mel(sr / 2 * 0.95), pts = [];
    for (var i = 0; i < N_MELS + 2; i++) pts.push(Math.floor((nfft + 1) * mel2hz(lo + (hi - lo) * i / (N_MELS + 1)) / sr));
    var bank = [];
    for (var m = 1; m <= N_MELS; m++) {
      var f = new Float32Array(nfft / 2 + 1);
      for (var k = pts[m - 1]; k < pts[m]; k++) f[k] = (k - pts[m - 1]) / Math.max(1, pts[m] - pts[m - 1]);
      for (k = pts[m]; k < pts[m + 1]; k++) f[k] = (pts[m + 1] - k) / Math.max(1, pts[m + 1] - pts[m]);
      bank.push(f);
    }
    return (melCache[key] = bank);
  }

  // Returns an array of feature vectors (MFCC 1..12 plus deltas), mean-normalised.
  function features(samples, sr) {
    var x = resample(samples, sr, TARGET_SR);
    x = trimSilence(x, TARGET_SR);
    var fl = Math.round(TARGET_SR * FRAME_MS / 1000), hop = Math.round(TARGET_SR * HOP_MS / 1000);
    if (x.length < fl * 3) return [];
    var nfft = 1; while (nfft < fl) nfft <<= 1;
    var bank = melBank(nfft, TARGET_SR), ham = new Float32Array(fl);
    for (var i = 0; i < fl; i++) ham[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (fl - 1));
    var ceps = [];
    for (var s = 0; s + fl <= x.length; s += hop) {
      var re = new Float64Array(nfft), im = new Float64Array(nfft);
      for (i = 0; i < fl; i++) {
        var prev = s + i > 0 ? x[s + i - 1] : 0;
        re[i] = (x[s + i] - 0.97 * prev) * ham[i];
      }
      fft(re, im);
      var pow = new Float64Array(nfft / 2 + 1);
      for (i = 0; i <= nfft / 2; i++) pow[i] = re[i] * re[i] + im[i] * im[i];
      var logm = new Float64Array(N_MELS);
      for (var m = 0; m < N_MELS; m++) {
        var e = 0, f = bank[m];
        for (i = 0; i < f.length; i++) if (f[i]) e += f[i] * pow[i];
        logm[m] = Math.log(e + 1e-10);
      }
      var c = new Float32Array(N_CEPS - 1);
      for (var q = 1; q < N_CEPS; q++) {
        var acc = 0;
        for (m = 0; m < N_MELS; m++) acc += logm[m] * Math.cos(Math.PI * q * (m + 0.5) / N_MELS);
        c[q - 1] = acc;
      }
      ceps.push(c);
    }
    var d = N_CEPS - 1, T = ceps.length, mean = new Float32Array(d), sd = new Float32Array(d);
    for (var t = 0; t < T; t++) for (i = 0; i < d; i++) mean[i] += ceps[t][i] / T;
    for (t = 0; t < T; t++) for (i = 0; i < d; i++) { var z = ceps[t][i] - mean[i]; sd[i] += z * z / T; }
    for (i = 0; i < d; i++) sd[i] = Math.sqrt(sd[i]) + 1e-6;
    var out = [];
    for (t = 0; t < T; t++) {
      var v = new Array(d * 2);
      for (i = 0; i < d; i++) {
        v[i] = (ceps[t][i] - mean[i]) / sd[i];
        var a = ceps[Math.min(T - 1, t + 2)][i], b = ceps[Math.max(0, t - 2)][i];
        v[d + i] = 0.5 * (a - b) / sd[i];
      }
      out.push(v);
    }
    // Halve the frame rate to keep DTW fast on older iPads.
    var slim = [];
    for (t = 0; t < out.length; t += 2) slim.push(out[t].map(function (n) { return Math.round(n * 1000) / 1000; }));
    return slim;
  }

  function dist(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) { var z = a[i] - b[i]; s += z * z; }
    return Math.sqrt(s);
  }

  // Length-normalised DTW distance with a slope band.
  function dtw(a, b) {
    var n = a.length, m = b.length;
    if (!n || !m) return Infinity;
    if (n > 2.5 * m || m > 2.5 * n) return Infinity;
    var band = Math.max(Math.abs(n - m) + 5, Math.round(Math.max(n, m) * 0.3));
    var INF = Infinity, prev = new Float64Array(m + 1).fill(INF), cur = new Float64Array(m + 1);
    prev[0] = 0;
    for (var i = 1; i <= n; i++) {
      cur.fill(INF);
      var center = Math.round(i * m / n);
      var lo = Math.max(1, center - band), hi = Math.min(m, center + band);
      for (var j = lo; j <= hi; j++) {
        var c = dist(a[i - 1], b[j - 1]);
        cur[j] = c + Math.min(prev[j], cur[j - 1], prev[j - 1]);
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[m] / (n + m);
  }

  // phrases: [{id, text, samples: [features, ...]}]
  // Returns phrases ranked best-first with a score in [0,1] for the best match.
  function rank(feat, phrases) {
    var scored = [];
    phrases.forEach(function (p) {
      var ds = (p.samples || []).map(function (s) { return dtw(feat, s); }).sort(function (x, y) { return x - y; });
      if (!ds.length) return;
      // Average of the two closest examples is steadier than the single best.
      var d = ds.length > 1 ? (ds[0] * 0.6 + ds[1] * 0.4) : ds[0];
      scored.push({ id: p.id, text: p.text, dist: d });
    });
    scored.sort(function (x, y) { return x.dist - y.dist; });
    if (scored.length) {
      var best = scored[0].dist, second = scored.length > 1 ? scored[1].dist : best * 1.5;
      scored[0].confidence = isFinite(best) ? Math.max(0, Math.min(1, (second - best) / (best * 0.25))) : 0;
    }
    return scored;
  }

  var api = { features: features, dtw: dtw, rank: rank, trimSilence: trimSilence, peakLevel: peakLevel, TARGET_SR: TARGET_SR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpeechMatch = api;
})(this);
