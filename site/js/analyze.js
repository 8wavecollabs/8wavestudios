// In-browser audio analysis: BPM, musical key, energy and a mood guess.
// Runs on decoded audio only — nothing leaves the machine.
const Analyzer = (() => {
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  // Krumhansl-Schmuckler key profiles
  const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  async function decode(file) {
    const buf = await file.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    try { return await ctx.decodeAudioData(buf); } finally { ctx.close(); }
  }

  // Analyse a mono 11 kHz rendition of up to 60s from the middle of the track.
  async function mono(audio, rate = 11025, seconds = 60) {
    const start = Math.max(0, audio.duration / 2 - seconds / 2);
    const len = Math.min(seconds, audio.duration);
    const off = new OfflineAudioContext(1, Math.ceil(len * rate), rate);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start(0, start, len);
    return (await off.startRendering()).getChannelData(0);
  }

  function detectBpm(x, rate) {
    // Onset envelope: positive energy flux over 512-sample hops
    const hop = 256, win = 512, env = [];
    let prev = 0;
    for (let i = 0; i + win < x.length; i += hop) {
      let e = 0;
      for (let j = 0; j < win; j++) e += x[i + j] * x[i + j];
      e = Math.log(1 + 1000 * e);
      env.push(Math.max(0, e - prev));
      prev = e;
    }
    const fps = rate / hop;
    let best = 0, bestLag = 0;
    const scores = {};
    for (let bpm = 60; bpm <= 190; bpm += 0.5) {
      const lag = (60 / bpm) * fps;
      let s = 0;
      for (let i = Math.ceil(lag * 2); i < env.length; i++) {
        // fractional lag via linear interpolation, plus 2x lag reinforcement
        const a = i - lag, f = a - Math.floor(a);
        const v = env[Math.floor(a)] * (1 - f) + env[Math.ceil(a)] * f;
        const b = i - 2 * lag, g = b - Math.floor(b);
        const w = env[Math.floor(b)] * (1 - g) + env[Math.ceil(b)] * g;
        s += env[i] * (v + 0.5 * w);
      }
      scores[bpm] = s;
      if (s > best) { best = s; bestLag = bpm; }
    }
    let bpm = bestLag;
    // Half-time trap ambiguity: prefer the double if it scores close.
    if (bpm < 90 && scores[bpm * 2] && scores[bpm * 2] > best * 0.85) bpm *= 2;
    return Math.round(bpm);
  }

  function goertzel(x, start, n, freq, rate) {
    const k = 2 * Math.cos((2 * Math.PI * freq) / rate);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const s0 = x[start + i] + k * s1 - s2; s2 = s1; s1 = s0; }
    return s1 * s1 + s2 * s2 - k * s1 * s2;
  }

  function detectKey(x, rate) {
    const chroma = new Array(12).fill(0);
    const n = 4096, frames = Math.min(40, Math.floor(x.length / n));
    const stride = Math.floor(x.length / frames);
    for (let f = 0; f < frames; f++) {
      for (let midi = 40; midi < 84; midi++) {            // E2..B5
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        chroma[midi % 12] += Math.sqrt(goertzel(x, f * stride, n, freq, rate));
      }
    }
    const corr = (p, r) => {
      const rot = chroma.map((_, i) => chroma[(i + r) % 12]);
      const ma = rot.reduce((a, b) => a + b) / 12, mb = p.reduce((a, b) => a + b) / 12;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < 12; i++) { num += (rot[i] - ma) * (p[i] - mb); da += (rot[i] - ma) ** 2; db += (p[i] - mb) ** 2; }
      return num / Math.sqrt(da * db || 1);
    };
    let best = { score: -2 };
    for (let r = 0; r < 12; r++) {
      const maj = corr(MAJOR, r), min = corr(MINOR, r);
      if (maj > best.score) best = { score: maj, key: `${NOTES[r]} major` };
      if (min > best.score) best = { score: min, key: `${NOTES[r]} minor` };
    }
    return best.key;
  }

  function energyOf(x) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    const rms = Math.sqrt(s / x.length);
    return Math.max(0, Math.min(1, (20 * Math.log10(rms + 1e-9) + 30) / 24)); // -30dB..-6dB -> 0..1
  }

  function moodFor({ bpm, key, energy }) {
    const minor = /minor/.test(key);
    if (minor && energy > 0.7 && bpm >= 130) return 'dark';
    if (minor && energy > 0.7) return 'aggressive';
    if (minor && energy < 0.5) return 'sad';
    if (minor) return 'emotional';
    if (energy > 0.75) return 'hype';
    return bpm < 100 ? 'smooth' : 'bouncy';
  }

  async function analyze(file) {
    const audio = await decode(file);
    const rate = 11025;
    const x = await mono(audio, rate);
    const bpm = detectBpm(x, rate);
    const key = detectKey(x, rate);
    const energy = +energyOf(x).toFixed(2);
    return { bpm, key, energy, mood: moodFor({ bpm, key, energy }), duration: Math.round(audio.duration) };
  }

  // Guess BPM/key from a filename like "Imperator 144bpm F#min.wav" — used as a hint and fallback.
  function fromFilename(name) {
    const out = {};
    const b = name.match(/(\d{2,3})\s*bpm/i) || name.match(/bpm\s*(\d{2,3})/i);
    if (b) out.bpm = +b[1];
    const k = name.match(/\b([A-G][#b♯♭]?)\s*(maj(?:or)?|min(?:or)?|m)\b/i);
    if (k) out.key = `${k[1].replace('♯', '#').toUpperCase()} ${/^maj/i.test(k[2]) ? 'major' : 'minor'}`;
    out.title = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
      .replace(/\d{2,3}\s*bpm|bpm\s*\d{2,3}/i, '').replace(k ? k[0] : /$^/, '').replace(/\s{2,}/g, ' ').trim();
    return out;
  }

  return { analyze, fromFilename, moodFor, NOTES };
})();

// Synthesised preview for demo tracks that have no audio file yet: kick/hat/808 pattern at the track's BPM.
const DemoSynth = (() => {
  let ctx, timer, stopAt;
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function rootHz(key) {
    const i = NOTES.indexOf(key.split(' ')[0]);
    return 440 * Math.pow(2, ((i < 0 ? 0 : i) + 36 - 69 + 12) / 12); // octave 2
  }
  function hit(t, f0, f1, dur, gain, type = 'sine') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
  }
  function hat(t) {
    const b = ctx.createBuffer(1, 2205, 44100), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 7000; g.gain.value = 0.15;
    s.buffer = b; s.connect(f).connect(g).connect(ctx.destination); s.start(t);
  }
  function play(track, seconds = 15, onEnd) {
    stop();
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const step = 60 / track.bpm / 4, root = rootHz(track.key || 'C minor');
    const minor = /minor/.test(track.key || '');
    const bass = [0, 0, minor ? 3 : 4, 0, 7, 0, minor ? 8 : 9, 5];
    let n = 0, t = ctx.currentTime + 0.05;
    stopAt = t + seconds;
    const tick = () => {
      while (t < ctx.currentTime + 0.2 && t < stopAt) {
        const s = n % 16;
        if (s === 0 || s === 10) hit(t, 150, 40, 0.35, 0.9);
        if (s === 0 || s === 6 || s === 10) hit(t, root * Math.pow(2, bass[(n >> 4) % 8] / 12), root * 0.98, step * 5, 0.5, 'triangle');
        if (s === 4 || s === 12) hit(t, 220, 120, 0.15, 0.4, 'square');
        if (track.bpm > 120 ? true : s % 2 === 0) hat(t);
        t += step; n++;
      }
      if (t >= stopAt) { clearInterval(timer); setTimeout(() => { stop(); onEnd && onEnd(); }, 400); }
    };
    timer = setInterval(tick, 50); tick();
  }
  function stop() { clearInterval(timer); if (ctx) { ctx.close(); ctx = null; } }
  return { play, stop };
})();
