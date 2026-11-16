// Back office: vinyl listings for The Crate (eBay-style list / edit / sold).
// Uses $, S, UI and DB from admin.html.
const CrateAdmin = (() => {
  const FORMATS = ['LP', '2xLP', '12" Single', '7" Single', '10"', 'EP', 'Box Set', 'Picture Disc'];
  const GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'];
  const GRADE_HELP = 'M Mint · NM Near Mint · VG+ light signs of play · VG noticeable wear, still plays well · G+/G heavy wear · F/P damaged';
  const STATUS = { available: 'For sale', pending: 'On hold', sold: 'Sold', hidden: 'Draft / hidden' };
  let records = [];

  async function load() {
    if (!DB.cloud) {
      $('#crRows').innerHTML = '<tr><td colspan="7" class="muted">The Crate needs online mode — sign in on the live site.</td></tr>';
      return;
    }
    try { records = await DB.all('records'); }
    catch (err) {
      $('#crRows').innerHTML = `<tr><td colspan="7" class="muted">Crate isn't set up yet — run supabase/crate.sql in Supabase (${UI.esc(err.message)}).</td></tr>`;
      return;
    }
    render();
  }

  function render() {
    const q = $('#crQ').value.toLowerCase(), st = $('#crStatus').value;
    const list = records.filter((r) => (!st || r.status === st) && (!q || [r.artist, r.title, r.label, r.catno, r.genre].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.listed || 0) - (a.listed || 0));
    const forSale = records.filter((r) => r.status === 'available');
    $('#crCount').textContent = `(${forSale.length} for sale · ${UI.money(forSale.reduce((a, r) => a + Number(r.price), 0))} listed · ${records.filter((r) => r.status === 'sold').length} sold)`;
    $('#crRows').innerHTML = list.map((r) => `<tr>
      <td><img src="${UI.esc(r.photos?.[0] || '')}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:6px;background:var(--panel-2)"></td>
      <td><b>${UI.esc(r.artist)} – ${UI.esc(r.title)}</b>${r.chopped ? ' <span class="chip" style="background:var(--accent-2);color:#fff">✂ Chopped</span>' : ''}
        <div class="muted" style="font-size:12px">${[r.label, r.catno, r.year].filter(Boolean).map(UI.esc).join(' · ')}</div></td>
      <td>${UI.esc(r.format || '')}</td>
      <td class="muted">${r.media ? `Media ${UI.esc(r.media)}` : ''}${r.sleeve ? `<br>Sleeve ${UI.esc(r.sleeve)}` : ''}</td>
      <td><b>${UI.money(r.price)}</b></td>
      <td><span class="chip ${r.status === 'available' ? 'hot' : ''}">${STATUS[r.status] || r.status}</span></td>
      <td style="white-space:nowrap"><button class="btn sm" data-edit="${UI.esc(r.id)}">Edit</button>
        ${r.status === 'sold' ? `<button class="btn ghost sm" data-relist="${UI.esc(r.id)}">Relist</button>` : `<button class="btn ghost sm" data-sold="${UI.esc(r.id)}">Mark sold</button>`}
        <button class="btn ghost sm" data-del="${UI.esc(r.id)}">Delete</button></td></tr>`).join('')
      || `<tr><td colspan="7" class="muted">${records.length ? 'No listings match.' : 'No records listed yet — click “+ List a record”.'}</td></tr>`;
  }

  async function save(r) { await DB.put('records', r); await load(); }

  $('#crQ').addEventListener('input', () => render());
  $('#crStatus').addEventListener('input', () => render());
  $('#crNew').onclick = () => edit(null);
  $('#crRows').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const r = records.find((x) => x.id === (b.dataset.edit || b.dataset.sold || b.dataset.relist || b.dataset.del));
    if (b.dataset.edit) edit(r);
    if (b.dataset.sold && confirm(`Mark “${r.title}” as sold (e.g. sold in person)? It stays visible with a SOLD badge.`)) await save({ ...r, status: 'sold', soldAt: Date.now() });
    if (b.dataset.relist) await save({ ...r, status: 'available', soldAt: null });
    if (b.dataset.del && confirm(`Delete the listing “${r.artist} – ${r.title}” and its photos? This can't be undone.`)) {
      await DB.removeImages(r.photos || []); await DB.del('records', r.id); await load();
    }
  });

  // Phone photos are huge; shrink to 1600px JPEG before upload
  function shrink(file, max = 1600) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read image'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => reject(new Error(`${file.name} isn't a supported image (use JPG, PNG or WebP)`));
      img.src = URL.createObjectURL(file);
    });
  }

  function edit(rec) {
    const isNew = !rec;
    const r = rec ? structuredClone(rec) : { id: DB.uid(), status: 'available', format: 'LP', media: 'VG+', sleeve: 'VG+', photos: [], chops: [], listed: Date.now() };
    // photos: existing URLs plus new {blob, url} items not uploaded yet
    let photos = (r.photos || []).map((url) => ({ url }));
    const removed = [];
    const sel = (name, opts, v) => `<select name="${name}" style="width:100%">${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${UI.esc(o)}</option>`).join('')}</select>`;
    const field = (label, name, attrs = '') => `<label>${label}<br><input class="input" name="${name}" value="${UI.esc(r[name] ?? '')}" style="width:100%" ${attrs}></label>`;

    $('#layer').innerHTML = `<div class="modal-wrap" id="mw"><form class="modal" id="recForm" style="width:min(900px,100%)">
      <div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">${isNew ? 'List a record' : 'Edit listing'}</h2><button type="button" class="btn ghost sm" id="mx">✕</button></div>

      <div class="dropzone" id="phDrop" style="padding:18px">
        <b>Photos</b> <span class="muted">— drag &amp; drop or</span> <label class="btn ghost sm">choose<input type="file" id="phPick" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
        <div class="muted" style="font-size:12px;margin-top:4px">First photo is the cover. Add front, back, labels and any flaws. Up to 12.</div>
        <div class="thumbs" id="phList" style="justify-content:center;margin-top:10px"></div>
      </div>

      <div class="grid2" style="margin-top:16px">
        ${field('Artist *', 'artist', 'required')}${field('Title *', 'title', 'required')}
      </div>
      <div class="grid4" style="margin-top:10px">
        ${field('Label', 'label')}${field('Catalog #', 'catno')}${field('Year', 'year', 'inputmode="numeric"')}${field('Genre', 'genre', 'list="genreList"')}
      </div>
      <datalist id="genreList">${[...new Set(['Soul', 'Funk', 'Jazz', 'R&B', 'Hip Hop', 'Gospel', 'Disco', 'Rock', 'Reggae', 'Latin', 'Library', 'Soundtrack', 'Electronic', ...records.map((x) => x.genre).filter(Boolean)])].map((g) => `<option value="${UI.esc(g)}">`).join('')}</datalist>
      <div class="grid4" style="margin-top:10px">
        <label>Format<br>${sel('format', FORMATS, r.format)}</label>
        <label>Media grade<br>${sel('media', GRADES, r.media)}</label>
        <label>Sleeve grade<br>${sel('sleeve', [...GRADES, 'Generic', 'None'], r.sleeve)}</label>
        <label>Price (USD) *<br><input class="input" name="price" type="number" step="0.01" min="0.5" required value="${UI.esc(r.price ?? '')}" style="width:100%"></label>
      </div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">${GRADE_HELP}</p>
      <label style="display:block;margin-top:10px">Description<br><textarea name="description" rows="4" style="width:100%" placeholder="Pressing details, playback notes, any skips or seam splits…">${UI.esc(r.description || '')}</textarea></label>

      <div class="card" style="margin-top:14px;padding:14px">
        <label><input type="checkbox" name="chopped" ${r.chopped ? 'checked' : ''}> <b>✂ Chopped by 8wave</b> <span class="muted">— show this record in the Chopped section with your chop notes</span></label>
        <div id="chopBox" class="${r.chopped ? '' : 'hidden'}" style="margin-top:10px">
          <table><thead><tr><th>Where (side / time)</th><th>BPM</th><th>Key</th><th>What's there</th><th></th></tr></thead><tbody id="chopRows"></tbody></table>
          <button type="button" class="btn ghost sm" id="chopAdd" style="margin-top:8px">+ Add chop note</button>
        </div>
      </div>

      <div class="row" style="margin-top:18px">
        <label class="grow">Status &nbsp;<select name="status">${Object.entries(STATUS).filter(([k]) => k !== 'pending' || r.status === 'pending').map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <span class="muted" id="saveMsg"></span>
        <button class="btn primary" id="recSave">${isNew ? 'Publish listing' : 'Save changes'}</button>
      </div>
    </form></div>`;

    const f = $('#recForm');
    const drawPhotos = () => {
      $('#phList').innerHTML = photos.map((p, i) => `<div style="position:relative">
        <img src="${UI.esc(p.url)}" alt="" style="width:84px;height:84px" class="${i ? '' : 'on'}" title="${i ? 'Click to make cover' : 'Cover photo'}" data-cover="${i}">
        <button type="button" data-rm="${i}" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:0;background:var(--accent);color:#fff;cursor:pointer">×</button></div>`).join('');
    };
    const addFiles = async (files) => {
      for (const file of [...files].filter((x) => x.type.startsWith('image/'))) {
        if (photos.length >= 12) { UI.toast('12 photos max'); break; }
        try { const blob = await shrink(file); photos.push({ blob, url: URL.createObjectURL(blob) }); }
        catch (err) { UI.toast(err.message); }
      }
      drawPhotos();
    };
    $('#phList').addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]'), cv = e.target.closest('[data-cover]');
      if (rm) { const [p] = photos.splice(+rm.dataset.rm, 1); if (!p.blob) removed.push(p.url); }
      else if (cv) photos.unshift(...photos.splice(+cv.dataset.cover, 1));
      drawPhotos();
    });
    const drop = $('#phDrop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
    $('#phPick').onchange = (e) => addFiles(e.target.files);

    const chopRow = (c = {}) => `<tr><td><input class="input" data-c="at" value="${UI.esc(c.at || '')}" placeholder="A2 0:42" style="width:100%"></td>
      <td><input class="input" data-c="bpm" value="${UI.esc(c.bpm || '')}" style="width:70px"></td>
      <td><input class="input" data-c="key" value="${UI.esc(c.key || '')}" style="width:80px"></td>
      <td><input class="input" data-c="note" value="${UI.esc(c.note || '')}" placeholder="Clean horn stab, no drums" style="width:100%"></td>
      <td><button type="button" class="btn ghost sm" data-chop-rm>✕</button></td></tr>`;
    $('#chopRows').innerHTML = (r.chops || []).map(chopRow).join('');
    $('#chopAdd').onclick = () => $('#chopRows').insertAdjacentHTML('beforeend', chopRow());
    $('#chopRows').addEventListener('click', (e) => e.target.closest('[data-chop-rm]')?.closest('tr').remove());
    f.chopped.onchange = () => { $('#chopBox').classList.toggle('hidden', !f.chopped.checked); if (f.chopped.checked && !$('#chopRows').children.length) $('#chopAdd').click(); };

    $('#mx').onclick = () => ($('#layer').innerHTML = '');
    drawPhotos();

    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!photos.length && f.status.value === 'available' && !confirm('Publish without photos? Listings with photos sell much better.')) return;
      $('#recSave').disabled = true;
      try {
        const urls = [];
        for (const [i, p] of photos.entries()) {
          $('#saveMsg').textContent = p.blob ? `Uploading photo ${i + 1}/${photos.length}…` : '';
          urls.push(p.blob ? await DB.uploadImage(`${r.id}/${Date.now()}-${i}.jpg`, p.blob) : p.url);
        }
        $('#saveMsg').textContent = 'Saving…';
        const chops = [...$('#chopRows').children].map((tr) => Object.fromEntries([...tr.querySelectorAll('[data-c]')].map((i) => [i.dataset.c, i.value.trim()])))
          .filter((c) => c.at || c.note);
        const out = {
          ...r, photos: urls, chops, chopped: f.chopped.checked,
          ...Object.fromEntries(['artist', 'title', 'label', 'catno', 'year', 'genre', 'format', 'media', 'sleeve', 'description'].map((k) => [k, f[k].value.trim()])),
          price: Math.round(Number(f.price.value) * 100) / 100, status: f.status.value,
        };
        await DB.put('records', out);
        if (removed.length) await DB.removeImages(removed);
        $('#layer').innerHTML = '';
        UI.toast(isNew ? 'Listing published' : 'Listing saved');
        await load();
      } catch (err) {
        $('#saveMsg').textContent = '';
        $('#recSave').disabled = false;
        UI.toast(`Couldn't save: ${err.message}`);
      }
    };
  }

  return { load };
})();
if (S.settings) CrateAdmin.load();
