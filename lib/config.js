/* TAHA VPN 5G — دریافت و آماده‌سازی لیست سرورها
 * قانون سخت: سروری که پینگ ندارد هرگز نمایش داده نمی‌شود.
 * لیست زنده‌ی HF از قبل توسط ناشر کامل پینگ‌تست شده است (raw_ping)؛
 * برای منابع گیت‌هاب، افزونه نمی‌تواند TCP خام باز کند، پس به‌جای آن
 * یک آزمون دسترسی مبتنی بر fetch انجام می‌دهد: اتصال سریع یعنی
 * سرور در دسترس است، تایم‌اوت یعنی حذف می‌شود. این یک پینگ واقعی
 * TCP نیست و در راهنما هم همین‌طور گفته شده است. */
(function (global) {
  'use strict';

  const U = global.Vpn5gUtil;
  const C = global.VPN5G;

  /** پارس یک URI کانفیگ — خروجی null یعنی خط نامعتبر و حذف می‌شود. */
  function parseUri(uri) {
    if (!uri || typeof uri !== 'string') return null;
    const text = uri.trim();
    const protoMatch = text.match(/^(vmess|vless|trojan|ss|socks5|socks|http|https):\/\//i);
    if (!protoMatch) return null;
    const protocol = protoMatch[1].toLowerCase();
    try {
      if (protocol === 'vmess') {
        const body = text.slice('vmess://'.length).split('#')[0];
        const json = JSON.parse(U.b64decode(body));
        const host = String(json.add || json.host || '');
        const port = parseInt(json.port, 10);
        if (!host || !Number.isFinite(port)) return null;
        return { protocol, host, port, name: json.ps || host };
      }
      // vless / trojan / ss / socks5 / http(s)
      const withoutScheme = text.slice(text.indexOf('://') + 3);
      const hashIdx = withoutScheme.indexOf('#');
      const name = hashIdx >= 0 ? decodeURIComponent(withoutScheme.slice(hashIdx + 1)) : '';
      const main = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme;
      const atIdx = main.lastIndexOf('@');
      const hostPort = atIdx >= 0 ? main.slice(atIdx + 1) : main;
      const hostPortClean = hostPort.split(/[/?]/)[0];
      const colonIdx = hostPortClean.lastIndexOf(':');
      if (colonIdx < 0) return null;
      const host = hostPortClean.slice(0, colonIdx).replace(/^\[|\]$/g, '');
      const port = parseInt(hostPortClean.slice(colonIdx + 1), 10);
      if (!host || !Number.isFinite(port)) return null;
      // ss ممکن است userinfo به‌صورت base64 باشد؛ host/port همان‌طور که هست درست است.
      return { protocol, host, port, name: name || host };
    } catch (e) {
      return null;
    }
  }

  /** برش یکنواخت از خطوط یک فایل بزرگ (نه فقط ابتدای فایل). */
  function spreadLines(lines, maxLines) {
    if (lines.length <= maxLines) return lines;
    const out = [];
    const step = lines.length / maxLines;
    for (let i = 0; i < maxLines; i++) out.push(lines[Math.floor(i * step)]);
    return out;
  }

  /** تبدیل بدنه‌ی یک منبع اشتراک به خطوط URI (با پشتیبانی base64 کلی). */
  function decodeSubscriptionBody(body) {
    if (!body) return [];
    let text = String(body);
    if (U.isProbablyBase64(text)) {
      const decoded = U.b64decode(text);
      if (decoded && decoded.includes('://')) text = decoded;
    }
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }

  async function fetchText(url, timeoutMs) {
    const res = await U.fetchWithTimeout(url, { method: 'GET' }, timeoutMs || C.FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  }

  /** لیست زنده‌ی HF — آرایه‌ی JSON با ping از قبل تست‌شده. */
  async function fetchLiveList() {
    const res = await U.fetchWithTimeout(C.LIVE_CONFIGS_URL, {}, C.FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const e of arr) {
      if (!e || !e.uri) continue;
      const p = parseUri(e.uri);
      if (!p) continue;
      const ping = Number(e.raw_ping);
      if (!Number.isFinite(ping) || ping <= 0) continue; // بدون پینگ = حذف
      out.push({
        id: U.serverId(e.uri),
        uri: e.uri,
        protocol: p.protocol,
        name: e.name || p.name,
        country: U.countryKey(e.country),
        host: p.host,
        port: p.port,
        ping: ping,
        pingSource: 'publisher'
      });
    }
    return out;
  }

  /** sub.txt — خطوط URI با پوشش base64. */
  async function fetchSubTxt() {
    const body = await fetchText(C.SUB_TXT_URL);
    const out = [];
    for (const line of decodeSubscriptionBody(body)) {
      const p = parseUri(line);
      if (!p) continue;
      out.push({
        id: U.serverId(line), uri: line, protocol: p.protocol,
        name: p.name, country: '🌐 بین‌الملل',
        host: p.host, port: p.port, ping: null, pingSource: 'probe'
      });
    }
    return out;
  }

  /** منابع گیت‌هاب — حداکثر ۳۰۰ خط به‌صورت یکنواخت از هر فایل. */
  async function fetchGithubSources(extraSources) {
    const urls = (extraSources || []).concat(C.BUILTIN_SOURCES);
    const out = [];
    for (const url of urls) {
      try {
        const body = await fetchText(url);
        const lines = spreadLines(decodeSubscriptionBody(body), C.MAX_LINES_PER_SOURCE);
        for (const line of lines) {
          const p = parseUri(line);
          if (!p) continue;
          out.push({
            id: U.serverId(line), uri: line, protocol: p.protocol,
            name: p.name, country: '🌐 بین‌الملل',
            host: p.host, port: p.port, ping: null, pingSource: 'probe'
          });
        }
      } catch (e) {
        // منبع خراب رد می‌شود؛ همگام‌سازی با بقیه ادامه دارد.
      }
    }
    return out;
  }

  /** آزمون دسترسی: اتصال سریع = در دسترس، تایم‌اوت = حذف.
   * این پینگ TCP واقعی نیست؛ فقط برای منابعی استفاده می‌شود که
   * ناشر برایشان پینگ آماده ندارد. */
  async function probeCandidate(c) {
    const started = performance.now();
    try {
      await U.fetchWithTimeout(
        'https://' + c.host + ':' + c.port + '/',
 { method: 'GET', mode: 'no-cors', credentials: 'omit' },
        C.PROBE_TIMEOUT_MS
      );
    } catch (e) {
      // خطای سریع (رد TLS و ...) یعنی TCP وصل شد؛ فقط تایم‌اوت حذف می‌کند.
      if (e && e.name === 'AbortError') return null;
    }
    const elapsed = performance.now() - started;
    if (elapsed >= C.PROBE_TIMEOUT_MS) return null;
    return Math.max(1, Math.round(elapsed));
  }

  async function probeCandidates(candidates) {
    const todo = candidates.slice(0, C.PROBE_CANDIDATE_CAP);
    const out = [];
    for (let i = 0; i < todo.length; i += C.PROBE_CONCURRENCY) {
      const batch = todo.slice(i, i + C.PROBE_CONCURRENCY);
      const results = await Promise.all(batch.map((c) => probeCandidate(c)));
      batch.forEach((c, idx) => {
        if (results[idx] !== null) out.push(Object.assign({}, c, { ping: results[idx], pingSource: 'probe' }));
      });
    }
    return out;
  }

  /** همگام‌سازی کامل: پیکربندی راه دور + همه‌ی منابع، بدون تکرار. */
  async function syncAll() {
    const [remoteConfig, live, sub, gh] = await Promise.allSettled([
      fetchRemoteConfig(),
      fetchLiveList(),
      fetchSubTxt(),
      fetchGithubSources([])
    ]);
    const config = remoteConfig.status === 'fulfilled' ? remoteConfig.value : null;
    const extraSources = (config && Array.isArray(config.config_sources)) ? config.config_sources : [];
    let github = gh.status === 'fulfilled' ? gh.value : [];
    if (extraSources.length > 0) {
      try { github = github.concat(await fetchGithubSources(extraSources)); } catch (e) { /* رد می‌شود */ }
    }
    const liveList = live.status === 'fulfilled' ? live.value : [];
    const subList = sub.status === 'fulfilled' ? sub.value : [];

    const byUri = new Map();
    for (const s of liveList.concat(subList, github)) {
      if (!byUri.has(s.uri)) byUri.set(s.uri, s);
    }
    const all = Array.from(byUri.values());
    const withPing = all.filter((s) => Number.isFinite(s.ping));
    const needProbe = all.filter((s) => !Number.isFinite(s.ping));
    const probed = await probeCandidates(needProbe);
    const merged = withPing.concat(probed);
    merged.sort((a, b) => a.ping - b.ping);
    return { servers: merged, remoteConfig: config, syncedAt: U.nowMs() };
  }

  async function fetchRemoteConfig() {
    try {
      const res = await U.fetchWithTimeout(C.APP_CONFIG_URL, {}, C.FETCH_TIMEOUT_MS);
      if (!res.ok) return null;
      const json = await res.json();
      return json && typeof json === 'object' ? json : null;
    } catch (e) {
      return null;
    }
  }

  /** برش سطح دسترسی: رایگان ۲۰ تای اول، هدیه ۵۰ تای اول، مشترک همه. */
  function serversForTier(servers, tier) {
    if (tier === 'subscriber') return servers.slice();
    if (tier === 'gift') return servers.slice(0, C.GIFT_SERVER_COUNT);
    return servers.slice(0, C.FREE_SERVER_COUNT);
  }

  /** گروه‌بندی بر اساس کشور (برای منوهای کشویی). */
  function groupByCountry(servers) {
    const groups = new Map();
    for (const s of servers) {
      const key = U.countryKey(s.country);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const out = Array.from(groups.entries()).map(([country, list]) => ({
      country, servers: list.slice().sort((a, b) => a.ping - b.ping)
    }));
    out.sort((a, b) => a.servers[0].ping - b.servers[0].ping);
    return out;
  }

  const Config = {
    parseUri, syncAll, fetchRemoteConfig, serversForTier, groupByCountry,
    decodeSubscriptionBody
  };

  global.Vpn5gConfig = Config;
})(typeof self !== 'undefined' ? self : this);
