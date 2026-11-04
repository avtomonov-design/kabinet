// Сеть кабинета через расширение-мост (страница сама не ходит в 4Partners/TgShop — это делает мост в вашем Chrome).
(function (root) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let seq = 0; const wait = new Map(); let ready = null;
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data) return;
    if (e.data.__kab === 'ready') ready = e.data.v;
    if (e.data.__kab === 'res' && wait.has(e.data.id)) { const w = wait.get(e.data.id); wait.delete(e.data.id); const r = e.data.res || {}; r.error ? w.no(new Error(r.error)) : w.ok(r.result); }
  });
  function bridge(op, args = {}, ms = 600000) {
    return new Promise((ok, no) => {
      const id = ++seq; wait.set(id, { ok, no });
      window.postMessage({ __kab: 'req', id, op, args }, location.origin);
      setTimeout(() => { if (wait.has(id)) { wait.delete(id); no(new Error('Мост не ответил (' + op + ')')); } }, ms);
    });
  }
  async function hasBridge() { for (let i = 0; i < 10; i++) { try { const r = await bridge('ping', {}, 800); return r.version; } catch (e) { await sleep(300); } } return null; }

  const b64e = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const xfetch = (url, o = {}) => bridge('fetch', { url, ...o });

  // ---------- база ----------
  const dbGet = key => bridge('dbGet', { key });
  const dbSet = (key, value) => bridge('dbSet', { key, value });

  // ---------- 4Partners ----------
  async function fetch4P(links, onProgress) {
    const out = {}; const CH = 24;
    for (let i = 0; i < links.length; i += CH) { Object.assign(out, await bridge('fetch4P', { links: links.slice(i, i + CH) })); onProgress && onProgress(Math.min(i + CH, links.length), links.length); }
    return out;
  }
  const sheetCSV = async (id, gid) => ({ text: await bridge('sheetCSV', { id, gid }) });

  // ---------- TgShop ----------
  const TG = 'https://backend.admin.tgshop.io/api/v1/';
  async function tg(path, opts = {}, retry = true) {
    const h = await bridge('tgHeaders', { force: false });
    const r = await xfetch(new URL(path, TG).href, { ...opts, headers: { ...(opts.headers || {}), Authorization: h.auth, 'Device-Id': h.dev } });
    if (r.status === 401 && retry) { await bridge('tgHeaders', { force: true }); return tg(path, opts, false); }
    if (!r.ok) throw new Error(`TgShop ${r.status}: ${String(typeof r.data === 'string' ? r.data : JSON.stringify(r.data)).slice(0, 200)}`);
    return r.data;
  }
  async function tgUpload(shop, bytes, fileName, missingSku, missingProduct = 'DO_NOTHING') {
    const cfg = { name: true, fullDescription: true, shortDescription: true, priority: true, category: true, photo: true, stock: true, price: true, attributes: true, missingSkuBehavior: missingSku, missingProductBehavior: missingProduct, skipNewProducts: false };
    return tg(`shop/${shop}/imports`, { method: 'POST', body: { form: [{ name: 'file', b64: b64e(bytes), filename: fileName, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { name: 'fileType', value: 'FEED_FILE' }, { name: 'updateConfig', value: JSON.stringify(cfg) }] } });
  }
  async function tgWaitImport(shop, fileName, onTick) {
    const t0 = Date.now();
    while (Date.now() - t0 < 15 * 60 * 1000) {
      const l = await tg(`shop/${shop}/imports?size=5&page=0`);
      const it = (l.content || []).find(x => x.fileName === fileName);
      if (it && !it.isRunning && it.jobState !== 'IN_PROGRESS' && it.jobState !== 'CREATED') return tg(`shop/${shop}/imports/${it.id}`);
      onTick && onTick(Math.round((Date.now() - t0) / 1000), it); await sleep(4000);
    }
    throw new Error('Импорт идёт дольше 15 минут — проверьте «Историю импорта» в TgShop');
  }
  async function tgShowcase(shop, onProgress) {
    let items = [], p = 0;
    while (true) { const l = await tg(`shops/${shop}/products?size=50&page=${p}`); items = items.concat(l.content); if (l.last || !l.content.length) break; p++; }
    const cards = [];
    for (let i = 0; i < items.length; i += 12) { cards.push(...await Promise.all(items.slice(i, i + 12).map(it => tg(`../v2/shops/${shop}/products/${it.productId}`)))); onProgress && onProgress(Math.min(i + 12, items.length), items.length); }
    return { items, cards };
  }

  // ---------- Figma ----------
  async function figmaGet(token, path) {
    for (let a = 0; a < 5; a++) {
      const r = await xfetch('https://api.figma.com/v1/' + path, { headers: { 'X-Figma-Token': token } });
      if (r.ok) return r.data;
      if (r.status === 403) throw new Error('Figma: токен не подходит или нет доступа к файлу');
      if (r.status === 404) throw new Error('Figma: не найден файл или узел');
      await sleep([3000, 8000, 20000, 45000, 60000][a]);   // 429/5xx — Figma перегружена, ждём и повторяем
    }
    throw new Error('Figma не отвечает — попробуйте через несколько минут');
  }
  // Читает узел «Трафареты — коллекции» по разделам параллельно (одно огромное дерево Figma отдаёт очень долго)
  async function figmaNode(token, key, node, onProgress) {
    const top = await figmaGet(token, `files/${key}/nodes?ids=${encodeURIComponent(node)}&depth=1`);
    const doc = top.nodes[node] && top.nodes[node].document; if (!doc) throw new Error('В Figma не найден узел ' + node);
    const secs = (doc.children || []).filter(c => c.type !== 'TEXT'); let done = 0;
    if (!secs.length) return (await figmaGet(token, `files/${key}/nodes?ids=${encodeURIComponent(node)}`)).nodes[node].document;
    const full = await Promise.all(secs.map(async s => { const j = await figmaGet(token, `files/${key}/nodes?ids=${encodeURIComponent(s.id)}`); onProgress && onProgress(++done, secs.length); return j.nodes[s.id].document; }));
    return { ...doc, children: full };
  }
  // Рендер фото пачками с паузами; onProgress(готово, всего)
  async function figmaRender(token, key, ids, onProgress, scale = 2) {
    const out = {};
    for (let i = 0; i < ids.length; i += 50) {
      const part = ids.slice(i, i + 50);
      const j = await figmaGet(token, `images/${key}?ids=${encodeURIComponent(part.join(','))}&format=jpg&scale=${scale}`);
      Object.assign(out, j.images || {}); onProgress && onProgress(Math.min(i + 50, ids.length), ids.length);
      if (i + 50 < ids.length) await sleep(1500);
    }
    return out;
  }
  async function getBytes(url) { for (let a = 0; a < 3; a++) { const r = await xfetch(url, { as: 'b64' }); if (r.ok) return b64d(r.data); await sleep(2000 * (a + 1)); } throw new Error('не скачалось фото'); }
  async function sha1(bytes) { const d = await crypto.subtle.digest('SHA-1', bytes); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

  // ---------- GitHub ----------
  async function gh(token, path, opts = {}) {
    for (let a = 0; a < 4; a++) {
      const r = await xfetch('https://api.github.com/' + path, { method: opts.method || 'GET', body: opts.body ? { text: opts.body } : undefined, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (r.status === 404 && opts.allow404) return null;
      if ((r.status === 403 || r.status === 429) && /rate limit/i.test(JSON.stringify(r.data))) { await sleep(30000 * (a + 1)); continue; }
      if (!r.ok) throw new Error(`GitHub ${r.status}: ${(r.data && r.data.message) || ''}`);
      return r.data;
    }
    throw new Error('GitHub ограничил частоту запросов — продолжите позже');
  }
  async function ghCheck(token, repo) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error(`«${String(repo).slice(0, 30)}…» — это не название репозитория. Нужно вида владелец/имя, например avtomonov-design/context-store-photos`);
    const r = await gh(token, `repos/${repo}`, { allow404: true });
    if (!r) throw new Error(`Репозиторий ${repo} не найден или токену не дан к нему доступ`);
    if (r.permissions && !r.permissions.push) throw new Error(`У токена нет права записи в ${repo} (нужно Contents: Read and write)`);
    return r;
  }
  async function ghList(token, repo, branch, dir) { const t = await gh(token, `repos/${repo}/git/trees/${branch}?recursive=1`, { allow404: true }); return new Set((t && t.tree || []).filter(x => x.type === 'blob' && x.path.startsWith(dir + '/')).map(x => x.path)); }
  async function ghPut(token, repo, branch, path, bytes, message, isNew) {
    const p = path.split('/').map(encodeURIComponent).join('/');
    const cur = isNew ? null : await gh(token, `repos/${repo}/contents/${p}?ref=${branch}`, { allow404: true });
    return gh(token, `repos/${repo}/contents/${p}`, { method: 'PUT', body: JSON.stringify({ message, content: b64e(bytes), branch, ...(cur && cur.sha ? { sha: cur.sha } : {}) }) });
  }
  const rawUrl = (repo, branch, path) => `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  async function ghRead(token, repo, branch, path) { const f = await gh(token, `repos/${repo}/contents/${path}?ref=${branch}`); return b64d(f.content.replace(/\n/g, '')); }

  // ---------- Telegram, фото ----------
  async function telegram(token, chat, text) { if (!token || !chat) return; await xfetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { text: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000) }) } }); }
  async function checkImages(urls, onProgress) { let ok = 0; const bad = []; for (let i = 0; i < urls.length; i += 100) { const r = await bridge('checkImages', { urls: urls.slice(i, i + 100) }); ok += r.ok; bad.push(...r.bad); onProgress && onProgress(Math.min(i + 100, urls.length), urls.length); } return { ok, bad }; }

  root.Net = { bridge, hasBridge, dbGet, dbSet, fetch4P, sheetCSV, tg, tgUpload, tgWaitImport, tgShowcase, figmaNode, figmaRender, getBytes, sha1, gh, ghCheck, ghList, ghPut, ghRead, rawUrl, telegram, checkImages, sleep };
})(window);
