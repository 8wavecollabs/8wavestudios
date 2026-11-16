// Small helpers shared by the storefront and the back office.
const UI = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  money: (n) => '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  compact: (n) => Intl.NumberFormat(undefined, { notation: 'compact' }).format(n),
  // Deterministic gradient "cover art" per title
  cover(title) {
    let h = 0;
    for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `background: linear-gradient(135deg, hsl(${h} 70% 35%), hsl(${(h + 60) % 360} 80% 18%));`;
  },
  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  },
  copy(text) { navigator.clipboard.writeText(text).then(() => UI.toast('Copied to clipboard')); },
  csv(rows) {
    return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  },
  download(name, text, type = 'text/csv') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};
