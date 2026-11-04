// Кабинет витрины 2.0 — логика без сети. Карточка = один товар TgShop (одна категория).
(function (root) {
  const W = '1016', M = '1015';
  const nz = s => String(s ?? '').replace(',', '.').trim();
  const num = s => { const v = parseFloat(nz(s).replace(/\s/g, '')); return isFinite(v) ? v : null; };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const today = () => new Date().toISOString().slice(0, 10);
  const sizeCmp = (a, b) => parseFloat(a) - parseFloat(b);
  const catName = c => c === W ? 'Девушкам' : 'Парням';

  // ---------- ссылки и CSV ----------
  function splitLink(h) { const s = String(h || '').trim(); const i = s.indexOf('#'); const m = s.match(/#v(\d+)/); return { link: i >= 0 ? s.slice(0, i) : s, hv: m ? m[1] : '' }; }
  const pidOf = l => { const m = String(l).match(/-a(\d+)/) || String(l).match(/item-(\d+)\.html/); return m ? m[1] : ''; };
  const keyOf = c => c.link + '#v' + c.hv;
  function driveId(u) { const s = String(u || '').trim(); const m = s.match(/[?&]id=([\w-]{10,})/) || s.match(/\/d\/([\w-]{10,})/); return m ? m[1] : ''; }
  function photoUrl(p) { if (p.url) return p.url; const id = driveId(p.src || ''); return id ? 'https://lh3.googleusercontent.com/d/' + id : ''; }
  function parseCSV(t) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function figmaNodeFromUrl(u) { const m = String(u).match(/node-id=([\d]+)[-:]([\d]+)/); return m ? m[1] + ':' + m[2] : ''; }
  function figmaKeyFromUrl(u) { const m = String(u).match(/figma\.com\/(?:design|file)\/([\w]+)/); return m ? m[1] : ''; }

  // ---------- карточки ----------
  function newCard(o) { return { id: uid(), cat: o.cat, group: o.group || '', name: o.name || '', nameManual: false, link: o.link || '', hv: o.hv || '', enabled: o.enabled !== false, sizes: o.sizes || [], photos: o.photos || [], figma: o.figma || null, status: o.status || {}, added: today() }; }
  const liveSizes = c => c.sizes.filter(s => s.stock && s.J && s.enabled !== false);
  const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
  function anomalies(c) { const live = liveSizes(c), med = median(live.map(s => s.J)); return new Set(med ? live.filter(s => s.J * 10 > med * 13).map(s => s.sku) : []); }
  function hasTwin(db, c) { return db.cards.some(x => x !== c && x.cat !== c.cat && x.link === c.link && x.hv === c.hv); }
  function hints(db, c, markup) {
    const h = [], live = liveSizes(c), an = anomalies(c);
    if (!c.enabled) h.push(['off', 'выключена']);
    if (c.status.error) h.push(['bad', c.status.error]);
    if (!c.link) h.push(['bad', 'нет ссылки 4Partners']);
    if (c.status.soldOutSince) h.push(['warn', 'распродана с ' + c.status.soldOutSince.split('-').reverse().join('.')]);
    else if (c.sizes.length && live.length - an.size <= 2) h.push(['warn', 'мало размеров: ' + (live.length - an.size)]);
    if (an.size) h.push(['warn', 'аномальная цена: ' + an.size]);
    if (!c.photos.length) h.push(['bad', 'нет фото']);
    if (c.figma && c.figma.changed) h.push(['warn', 'фото в Figma изменилось']);
    if (c.figma && c.figma.title && c.figma.title.slice(0, 30) !== c.name) h.push(['info', 'название не как в Figma: ' + c.figma.title]);
    if (!c.figma) h.push(['bad', 'нет трафарета — уйдёт при сверке с Figma']);
    if (db._moved && db._moved.has(c.id)) h.push(['info', '↕ не как в Figma: там ' + db._moved.get(c.id) + '-я']);
    if (!c.sizes.length) h.push(['info', 'ждёт обновления цен']);
    return h;
  }
  function priceRange(c, markup) { const an = anomalies(c); const p = liveSizes(c).filter(s => !an.has(s.sku)).map(s => s.J + markup); return p.length ? [Math.min(...p), Math.max(...p)] : null; }

  // ---------- ID ----------
  function idState(db) {
    const used = new Set(); let sku = 30000, grp = 500, art = 17000000;
    for (const c of db.cards) { used.add(c.group); const g = String(c.group).match(/(\d+)$/); if (g && +g[1] < 100000) grp = Math.max(grp, +g[1]); for (const s of c.sizes) { used.add(s.sku); used.add('a' + s.art); const k = String(s.sku).match(/NS(\d+)$/); if (k) sku = Math.max(sku, +k[1]); const a = num(s.art); if (a && a < 1e9) art = Math.max(art, a); } }
    return { used, sku, grp, art };
  }
  function allocSku(ids, cat) { let s, a; do s = `${cat}NS${++ids.sku}`; while (ids.used.has(s)); do a = String(++ids.art); while (ids.used.has('a' + a)); ids.used.add(s); ids.used.add('a' + a); return { sku: s, art: a }; }
  function allocGroup(ids, cat) { let g; do g = `${cat}NS${String(++ids.grp).padStart(3, '0')}`; while (ids.used.has(g)); ids.used.add(g); return g; }

  // ---------- перенос текущей витрины: строки «Матрицы» + товары TgShop ----------
  function matrixLines(rows) {
    const lines = []; let cur = null;
    rows.forEach((r, i) => {
      const K = (r[10] || '').trim();
      if (K === '34-47') { const { link, hv } = splitLink(r[7]); cur = { cat: String(r[0]).trim(), group: String(r[1]).trim(), name: String(r[4]).trim(), link, hv, photos: String(r[12] || '').split(',').map(x => x.trim()).filter(Boolean), pos: num(r[20]), sizes: [] }; lines.push(cur); }
      else if (cur && K.includes('|') && r[2]) { const J = num(r[9]); cur.sizes.push({ sz: nz(K.split('|')[1]), sku: String(r[2]).trim(), art: String(r[3]).trim(), vid: String(r[5] || '').replace(/^V/, ''), J, stock: nz(r[11]) === '5' && J ? 5 : 0, enabled: true }); }
    });
    return { lines, markup: num(rows[1] && rows[1][15]) };
  }
  function migrate(rows, tgCards) {
    const { lines, markup } = matrixLines(rows);
    const byGroup = new Map(lines.map(l => [l.group, l]));
    const cards = [], notes = [], seen = new Set();
    const tg = tgCards.map(c => ({ group: c.externalId, prio: Math.max(...c.skus.map(s => s.priority || 0)), name: (c.skus[0] || {}).name || '', skus: c.skus, catId: (c.skus[0] || {}).categoryId }));
    const catMap = {}; for (const t of tg) { const l = byGroup.get(t.group); if (l && t.catId) catMap[t.catId] = l.cat; }
    for (const t of tg) {
      const l = byGroup.get(t.group);
      if (!l) { const cat = catMap[t.catId] || W; notes.push(`На витрине товар ${t.group} «${t.name}», которого нет в каталоге: вставьте ссылку 4Partners или выключите карточку, иначе выгрузка не пройдёт`); cards.push({ ...newCard({ cat, group: t.group, name: t.name }), prio: t.prio }); continue; }
      seen.add(l.group);
      const live = new Set(t.skus.map(s => s.externalId));
      const sizes = l.sizes.map(s => ({ ...s })); for (const s of sizes) s.onShowcase = live.has(s.sku);
      cards.push({ ...newCard({ cat: l.cat, group: l.group, name: t.name || l.name, link: l.link, hv: l.hv, sizes: sizes.sort((a, b) => sizeCmp(a.sz, b.sz)), photos: l.photos.map(p => ({ src: p, url: photoUrl({ src: p }), from: 'drive' })) }), prio: t.prio, mpos: l.pos });
    }
    for (const l of lines) if (!seen.has(l.group)) { cards.push({ ...newCard({ cat: l.cat, group: l.group, name: l.name, link: l.link, hv: l.hv, enabled: false, sizes: l.sizes, photos: l.photos.map(p => ({ src: p, url: photoUrl({ src: p }), from: 'drive' })) }), prio: -1, mpos: l.pos }); notes.push(`«${l.name}» (${l.group}) есть в каталоге, но не на витрине — добавлена выключенной в конец`); }
    const order = { [W]: [], [M]: [] };
    for (const cat of [W, M]) order[cat] = cards.filter(c => c.cat === cat).sort((a, b) => (b.prio - a.prio) || ((a.mpos || 999) - (b.mpos || 999))).map(c => c.id);
    for (const c of cards) { delete c.prio; delete c.mpos; if (!liveSizes(c).length && c.sizes.length) c.status.soldOutSince = today(); }
    const showcase = tgCards.flatMap(c => c.skus.map(s => s.externalId));
    return { cards: cards.filter(c => c.cat === W || c.cat === M), order, showcase, markup, notes };
  }

  // ---------- поставщик ----------
  const isSizeP = x => x.aspect_name === 'Размер' || x.name === 'Размер';
  function sizeOf(v) { const s = (v.p || []).find(isSizeP); if (s) return (nz(s.value).match(/\d+(\.\d+)?/) || [])[0]; return ((v.p || []).map(x => x.value).join(' ').match(/(\d{2}(\.\d)?)\s*$/) || [])[1]; }
  function colOf(v) { return (v.p || []).filter(x => !isSizeP(x)).map(x => String(x.value).replace(/\s*\d{2}(\.\d)?\s*$/, '').trim()).join('|'); }
  const inSale = v => !!(v.price && v.q > 0);
  // Обновляет одну карточку по вариантам поставщика. twin — есть ли вторая половина (унисекс).
  function updateCard(c, vs, twin, ids, dry = false) {
    const res = { changes: [], added: [], notes: [], error: null };
    if (!vs) return { ...res, error: 'нет ответа поставщика' };
    if (!vs.length) return { ...res, error: 'у товара нет вариантов (снят?)' };
    let hv = vs.find(v => String(v.id) === String(c.hv));
    if (!hv) { const cols = [...new Set(vs.map(colOf))]; if (cols.length !== 1) return { ...res, error: `цвет #v${c.hv} пропал у поставщика` }; hv = vs.find(inSale) || vs[0]; res.notes.push(`вариант #v${c.hv} пропал, цвет один — привязал к #v${hv.id}`); if (!dry) c.hv = String(hv.id); }
    const col = colOf(hv), same = vs.filter(v => colOf(v) === col);
    const ok = n => !twin || (c.cat === W ? n <= 40 : n >= 40);
    for (const s of c.sizes) {
      const cand = same.filter(v => sizeOf(v) === s.sz), sale = ok(+s.sz) ? cand.find(inSale) : null, v = sale || cand.find(x => String(x.id) === s.vid) || cand[0];
      const nJ = sale ? sale.price : s.J, nSt = sale ? 5 : 0;
      if ((sale && s.J !== nJ) || s.stock !== nSt) res.changes.push({ card: c.id, name: c.name, cat: c.cat, sz: s.sz, sku: s.sku, oJ: s.J, nJ, oSt: s.stock, nSt });
      if (!dry) { s.J = nJ; s.stock = nSt; if (v) s.vid = String(v.id); }
    }
    const have = new Set(c.sizes.map(s => s.sz));
    for (const v of same) {
      const sz = sizeOf(v);
      if (sz && inSale(v) && !have.has(sz) && ok(+sz)) {
        have.add(sz); const id = dry ? { sku: '', art: '' } : allocSku(ids, c.cat);
        res.added.push({ card: c.id, name: c.name, cat: c.cat, sz, sku: id.sku, nJ: v.price });
        if (!dry) c.sizes.push({ sz, sku: id.sku, art: id.art, vid: String(v.id), J: v.price, stock: 5, enabled: true });
      }
    }
    if (!dry) {
      c.sizes.sort((a, b) => sizeCmp(a.sz, b.sz));
      const any = c.sizes.some(s => s.stock);
      if (!any) { if (!c.status.soldOutSince) { c.status.soldOutSince = today(); res.soldOut = true; } c.status.soldRuns = (c.status.soldRuns || 0) + 1; }
      else if (c.status.soldOutSince) { delete c.status.soldOutSince; delete c.status.soldRuns; res.back = true; }
      delete c.status.error; c.status.checked = new Date().toISOString();
    }
    return res;
  }
  // Первичное заполнение размеров новой карточки (пол — по доступным размерам)
  function genderOf(vs, hvId) {
    const hv = vs.find(v => String(v.id) === String(hvId)); if (!hv) return null;
    const col = colOf(hv), sz = vs.filter(v => colOf(v) === col).map(sizeOf).filter(Boolean).map(Number);
    const lo = sz.some(n => n < 40), hi = sz.some(n => n > 40);
    return lo && hi ? 'both' : hi ? M : W;
  }

  // ---------- выгрузка ----------
  const HEADER = ['ID категории', 'ID группы', 'ID товара', 'Название товара', 'Цена продажи', 'Изображения', 'Артикул', 'Старая цена', 'Полное описание', 'Краткое описание', 'Остаток', 'Варианты товара', 'Характеристики', 'Приоритет', 'Габариты (Ш/Г/В) (см) ', 'Вес (кг)', 'Размерная сетка'];
  const markupOf = st => (st.markupLines || []).reduce((a, l) => a + (+l.amount || 0), 0);
  function buildRows(db) {
    const st = db.settings, P = markupOf(st);
    const rows = [], info = { anomalies: [], sold: [], off: [], offSizes: 0, noPhoto: [], noLink: [] };
    for (const cat of [W, M]) {
      db.order[cat].forEach((id, i) => {
        const c = db.cards.find(x => x.id === id); if (!c) return;
        if (!c.enabled) { info.off.push(c.name); return; }
        if (!c.link) { info.noLink.push(c.name); return; }
        const photos = c.photos.map(photoUrl).filter(Boolean).slice(0, 10).join(',');
        if (!photos) info.noPhoto.push(c.name);
        const pr = 1000 - (i + 1), an = anomalies(c);
        const mk = (s, K) => [c.cat, c.group, s.sku, c.name, s.J + P, photos, s.art, '', st.fullDesc, st.shortDesc, K, `${c.cat === W ? 'Женский' : 'Мужской'} размер обуви EUR|${s.sz}`, st.attrs, pr, '', '', st.sizeGrid];
        let put = 0; const used = new Set();
        info.offSizes += c.sizes.filter(s => s.enabled === false).length;
        for (const s of liveSizes(c)) { if (an.has(s.sku)) { info.anomalies.push(`${c.name} ${s.sz} — ${s.J + P} ₽`); continue; } rows.push(mk(s, 5)); used.add(s.sku); put++; }
        // распродана: остаётся на витрине с остатком 0 по всем размерам, у которых известна последняя цена
        if (!put) { const z = c.sizes.filter(s => s.J && s.enabled !== false && !an.has(s.sku)); z.forEach(s => rows.push(mk(s, 0))); if (z.length) info.sold.push(c.name); }
      });
    }
    return { rows, info, groups: new Set(rows.map(r => r[1])).size };
  }
  function validate(rows) {
    const e = [], C = new Set(), gN = {};
    for (const r of rows) {
      if (C.has(r[2])) e.push('дубль ID ' + r[2]); C.add(r[2]);
      [0, 1, 2, 3, 4, 5, 6, 11].forEach(i => { if (r[i] === '' || r[i] == null) e.push(`пусто «${HEADER[i]}» у ${r[3] || r[2]}`); });
      if (String(r[3]).length > 30) e.push('название длиннее 30: ' + r[3]);
      if (String(r[5]).split(',').length > 10) e.push('больше 10 фото: ' + r[3]);
      if (/drive\.google/.test(r[5])) e.push('ссылка drive: ' + r[3]);
      if (gN[r[1]] !== undefined && gN[r[1]] !== r[13]) e.push('разный приоритет в ' + r[1]); gN[r[1]] = r[13];
      if (!(r[4] > 0)) e.push('цена ' + r[2]);
    }
    return [...new Set(e)];
  }
  function hashKeys(keys) { keys.sort(); let h = 0; for (const s of keys) for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  const rowKey = r => [r[2], r[1], +r[4], +r[10], +r[13], String(r[5]).split(',').filter(Boolean).length].join('|');
  // Что изменится на витрине: строки файла против товаров TgShop
  function diffShowcase(rows, tgCards) {
    const cur = new Map(); for (const c of tgCards) for (const s of c.skus) cur.set(s.externalId, { ...s, group: c.externalId });
    const file = new Map(rows.map(r => [r[2], r]));
    const d = { addGroups: new Set(), delGroups: new Set(), addSku: 0, delSku: 0, price: [], stock0: 0, stock5: 0, prio: 0, photos: 0 };
    const curGroups = new Set([...cur.values()].map(s => s.group)), fileGroups = new Set(rows.map(r => r[1]));
    for (const g of fileGroups) if (!curGroups.has(g)) d.addGroups.add(g);
    for (const g of curGroups) if (!fileGroups.has(g)) d.delGroups.add(g);
    for (const [k, r] of file) { const s = cur.get(k); if (!s) { d.addSku++; continue; } if (s.price !== r[4]) d.price.push({ name: r[3], sz: r[11].split('|')[1], from: s.price, to: r[4] }); if (s.amount !== r[10]) r[10] ? d.stock5++ : d.stock0++; if (s.priority !== r[13]) d.prio++; if ((s.images || []).length !== String(r[5]).split(',').filter(Boolean).length) d.photos++; }
    for (const k of cur.keys()) if (!file.has(k)) d.delSku++;
    return d;
  }

  // ---------- Figma: трафареты ----------
  function stripGeo(n) { if (Array.isArray(n)) return n.map(stripGeo); if (n && typeof n === 'object') { const o = {}; for (const k of Object.keys(n)) if (!/^absolute|^relativeTransform$|^size$|^x$|^y$/.test(k)) o[k] = stripGeo(n[k]); return o; } return n; }
  function strHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function walk(n, f) { f(n); (n.children || []).forEach(c => walk(c, f)); }
  // root = узел «Трафареты — коллекции» (разделы → «Товар N»)
  function parseTrafarets(root) {
    const out = [];
    for (const sec of root.children || []) {
      const cat = /1016|девушк/i.test(sec.name) ? W : /1015|парн/i.test(sec.name) ? M : 'both';
      (sec.children || []).filter(t => /^Товар/i.test(t.name)).forEach((t, i) => {
        const s = JSON.stringify(t);
        const m = s.match(/https:\/\/store\.4partners\.io\/[^"\s\\]+/);
        const { link, hv } = splitLink(m ? m[0] : '');
        let title = ''; walk(t, n => { if (!title && n.type === 'FRAME' && /·/.test(n.name)) title = n.name.split('·').slice(1).join('·').trim(); });
        const photos = []; walk(t, n => { if (n.type === 'FRAME' && n.absoluteBoundingBox && Math.round(n.absoluteBoundingBox.width) === 379 && Math.round(n.absoluteBoundingBox.height) === 481) photos.push({ id: n.id, x: n.absoluteBoundingBox.x, h: strHash(JSON.stringify(stripGeo(n))) }); });
        photos.sort((a, b) => a.x - b.x);
        out.push({ node: t.id, section: sec.name, cat, index: i, title, link, hv, photos: photos.map(p => p.id), hash: strHash(photos.map(p => p.h).join('|')) });
      });
    }
    return out;
  }
  // Связывает трафареты с карточками по ссылке+цвету (и разделу)
  function matchTrafarets(db, trs) {
    const linked = [], fresh = [], got = new Set(), loose = [];
    for (const t of trs) {
      const cats = t.cat === 'both' ? [W, M] : [t.cat];
      const hit = db.cards.filter(c => cats.includes(c.cat) && c.link === t.link && c.hv === t.hv);
      if (hit.length) hit.forEach(c => { linked.push({ card: c, tr: t }); got.add(c.id); }); else loose.push(t);
    }
    // второй проход: та же ссылка, другой #v (поставщик сменил вариант) — если кандидат однозначен
    for (const t of loose) {
      const cats = t.cat === 'both' ? [W, M] : [t.cat]; let any = false;
      for (const cat of cats) {
        const norm = x => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 30);
        const cand = db.cards.filter(c => c.cat === cat && !got.has(c.id) && c.link && c.link === t.link && norm(c.name) === norm(t.title));
        if (cand.length === 1) { linked.push({ card: cand[0], tr: t, hvDiff: true }); got.add(cand[0].id); any = true; }
      }
      if (!any) fresh.push(t);
    }
    return { linked, fresh, without: db.cards.filter(c => !got.has(c.id)) };
  }

  // ---------- порядок как в Figma ----------
  // Место карточки в Figma = её номер среди трафаретов своего раздела (сверху вниз).
  // «Не как в Figma» — минимальный набор переставленных карточек (вне наибольшей возрастающей подпоследовательности).
  function figmaRank(db, cat) { const r = new Map(); (db.figmaOrder && db.figmaOrder[cat] || []).forEach((n, i) => r.set(n, i)); return r; }
  function movedCards(db, cat) {
    const rank = figmaRank(db, cat), seq = db.order[cat].map(id => db.cards.find(c => c.id === id)).filter(c => c && c.figma && rank.has(c.figma.node));
    const a = seq.map(c => rank.get(c.figma.node)), n = a.length, len = new Array(n).fill(1), prev = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) if (a[j] < a[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
    let best = -1; for (let i = 0; i < n; i++) if (best < 0 || len[i] > len[best]) best = i;
    const keep = new Set(); for (let i = best; i >= 0; i = prev[i]) keep.add(i);
    const out = new Map(); seq.forEach((c, i) => { if (!keep.has(i)) out.set(c.id, rank.get(c.figma.node) + 1); });
    return out;
  }
  // Вернуть одну карточку на место: перед первой карточкой, которая в Figma стоит ниже неё
  function placeLikeFigma(db, c) {
    const rank = figmaRank(db, c.cat), my = c.figma && rank.get(c.figma.node); if (my == null) return false;
    const o = db.order[c.cat]; o.splice(o.indexOf(c.id), 1);
    const moved = movedCards(db, c.cat);
    let at = o.findIndex(id => { const x = db.cards.find(k => k.id === id); return x && x.figma && rank.has(x.figma.node) && !moved.has(x.id) && rank.get(x.figma.node) > my; });
    if (at < 0) { at = o.length; for (let i = o.length - 1; i >= 0; i--) { const x = db.cards.find(k => k.id === o[i]); if (x && x.figma && rank.has(x.figma.node)) { at = i + 1; break; } } }
    o.splice(at, 0, c.id); return true;
  }
  function sortLikeFigma(db, cat) {
    const rank = figmaRank(db, cat), o = db.order[cat], get = id => db.cards.find(k => k.id === id);
    const inF = o.filter(id => { const x = get(id); return x && x.figma && rank.has(x.figma.node); }).sort((p, q) => rank.get(get(p).figma.node) - rank.get(get(q).figma.node));
    db.order[cat] = [...inF, ...o.filter(id => !inF.includes(id))];
  }

  // ---------- задание сотруднику ----------
  function staffTask(db) {
    const P = markupOf(db.settings), sold = db.cards.filter(c => c.enabled && c.status.soldOutSince);
    if (!sold.length) return 'Закончившихся моделей нет.';
    const L = ['Задание: найти замену закончившимся моделям', ''];
    sold.forEach((c, i) => {
      const p = c.sizes.filter(s => s.J).map(s => s.J + P), pr = p.length ? `${Math.min(...p)}–${Math.max(...p)} ₽` : '—';
      const pos = db.order[c.cat].indexOf(c.id) + 1;
      L.push(`${i + 1}. ${c.name} — ${catName(c.cat)}, место ${pos}, цена была ${pr}`, `   Ссылка: ${keyOf(c)}`, `   Нет в наличии с ${c.status.soldOutSince.split('-').reverse().join('.')}`, `   Искать: ${catName(c.cat).toLowerCase()}, похожий цвет и силуэт, цена ${pr}; замену поставить рядом в трафаретах Figma.`, '');
    });
    return L.join('\n');
  }

  const api = { W, M, catName, HEADER, parseCSV, splitLink, pidOf, keyOf, driveId, photoUrl, figmaNodeFromUrl, figmaKeyFromUrl, newCard, liveSizes, anomalies, hasTwin, hints, priceRange, idState, allocSku, allocGroup, matrixLines, migrate, sizeOf, colOf, updateCard, genderOf, markupOf, buildRows, validate, hashKeys, rowKey, diffShowcase, parseTrafarets, matchTrafarets, staffTask, movedCards, placeLikeFigma, sortLikeFigma, figmaRank, strHash, uid, today, num };
  root.Core = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
