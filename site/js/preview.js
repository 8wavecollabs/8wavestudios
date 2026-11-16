// Makes a short MP3 streaming preview from a full beat (keeps cloud storage small and full files private).
// Needs lamejs loaded on the page.
const Preview = (() => {
  async function make(blob, seconds = 75, kbps = 96) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let audio;
    try { audio = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close(); }
    const rate = 44100, len = Math.min(seconds, audio.duration);
    const off = new OfflineAudioContext(1, Math.ceil(len * rate), rate);
    const src = off.createBufferSource(), gain = off.createGain();
    src.buffer = audio;
    gain.gain.setValueAtTime(1, Math.max(0, len - 3));
    gain.gain.linearRampToValueAtTime(0, len); // fade out at the cut
    src.connect(gain).connect(off.destination);
    src.start(0, 0, len);
    const pcm = (await off.startRendering()).getChannelData(0);

    const enc = new lamejs.Mp3Encoder(1, rate, kbps), out = [], block = 1152;
    const i16 = new Int16Array(block);
    for (let i = 0; i < pcm.length; i += block) {
      const n = Math.min(block, pcm.length - i);
      for (let j = 0; j < n; j++) i16[j] = Math.max(-1, Math.min(1, pcm[i + j])) * 32767;
      const buf = enc.encodeBuffer(n === block ? i16 : i16.subarray(0, n));
      if (buf.length) out.push(new Uint8Array(buf));
      if (i % (block * 200) === 0) await new Promise((r) => setTimeout(r)); // keep the page responsive
    }
    const end = enc.flush();
    if (end.length) out.push(new Uint8Array(end));
    return { blob: new Blob(out, { type: 'audio/mpeg' }), duration: Math.round(audio.duration) };
  }
  return { make };
})();
