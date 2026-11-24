/* TAHA VPN 5G — منطق پاپ‌آپ
 * همه‌ی متن‌های نمایشی فارسی‌اند. سرعت زنده فقط از آمار کمک‌کننده‌ی
 * محلی خوانده می‌شود؛ اگر کمک‌کننده نباشد «—» نشان داده می‌شود،
 * هرگز عدد جعلی ساخته نمی‌شود. */
(function () {
  'use strict';

  const U = window.Vpn5gUtil;
  const C = window.VPN5G;
  const P = window.Vpn5gProxy;

  let currentState = null;
  let speedTimer = null;
  let selectedPlanId = null;

  const $ = (id) => document.getElementById(id);

  function send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (res) => resolve(res || { ok: false, error: 'پاسخی دریافت نشد.' }));
    });
  }

  function showNotice(text, kind) {
    const el = $('notice');
    el.textContent = text;
    el.className = 'notice' + (kind ? ' ' + kind : '');
    el.classList.remove('hidden');
    clearTimeout(showNotice._t);
    showNotice._t = setTimeout(() => el.classList.add('hidden'), 8000);
  }

  function tierFa(tier) {
    if (tier === 'subscriber') return 'مشترک ویژه';
    if (tier === 'gift') return 'هدیه فعال';
    return 'کاربر رایگان';
  }

  function flagOf(country) {
    const m = String(country || '').match(/^(\p{RI}\p{RI}|🌐|🏳️)/u);
    return m ? m[1] : '🌐';
  }

  function countryName(country) {
    return String(country || '🌐 بین‌الملل').replace(/^(\p{RI}\p{RI}|🌐|🏳️)\s*/u, '').trim() || 'بین‌الملل';
  }

  function serverRow(s, state) {
    const row = document.createElement('div');
    const locked = !state.allowedServers.some((a) => a.id === s.id);
    row.className = 'server-row' + (state.selectedServerId === s.id ? ' selected' : '') + (locked ? ' locked' : '');
    const flag = document.createElement('span');
    flag.className = 'server-flag';
    flag.textContent = flagOf(s.country);
    const info = document.createElement('div');
    info.className = 'server-info';
    const name = document.createElement('div');
    name.className = 'server-name';
    name.textContent = countryName(s.country) + ' — ' + (s.protocol || '').toUpperCase();
    const meta = document.createElement('div');
    meta.className = 'server-meta';
    meta.textContent = s.host + ':' + s.port;
    info.appendChild(name);
    info.appendChild(meta);
    const ping = document.createElement('span');
    ping.className = 'server-ping';
    ping.textContent = U.formatPing(s.ping);
    row.appendChild(flag);
    row.appendChild(info);
    if (locked) {
      const lock = document.createElement('span');
      lock.className = 'lock-badge';
      lock.textContent = '🔒';
      row.appendChild(lock);
    }
    row.appendChild(ping);
    row.addEventListener('click', async () => {
      if (locked) {
        switchTab('premium');
        showNotice('این سرور مخصوص مشترکین است؛ از بخش ویژه اشتراک تهیه کنید.', '');
        return;
      }
      await send({ type: 'selectServer', serverId: s.id });
      await loadState();
    });
    return row;
  }

  function renderGroups(state) {
    const box = $('groupsList');
    box.innerHTML = '';
    const groups = state.groups || [];
    if (groups.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'سروری پیدا نشد؛ دکمه‌ی به‌روزرسانی را بزنید.';
      box.appendChild(e);
      return;
    }
    for (const g of groups) {
      const det = document.createElement('details');
      det.className = 'country-group';
      det.open = false; // همه‌ی منوها پیش‌فرض بسته‌اند
      const sum = document.createElement('summary');
      const left = document.createElement('span');
      left.textContent = flagOf(g.country) + ' ' + countryName(g.country);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = U.faNum(g.servers.length) + ' سرور';
      sum.appendChild(left);
      sum.appendChild(count);
      const body = document.createElement('div');
      body.className = 'group-body';
      for (const s of g.servers) body.appendChild(serverRow(s, state));
      det.appendChild(sum);
      det.appendChild(body);
      box.appendChild(det);
    }
  }

  function renderPlans(state) {
    const box = $('plansList');
    box.innerHTML = '';
    const config = state.remoteConfig;
    const plans = (config && Array.isArray(config.plans)) ? config.plans : [];
    if (plans.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'طرحی منتشر نشده است؛ از ربات خرید کنید.';
      box.appendChild(e);
      return;
    }
    const valid = plans.filter((p) => p && p.id && (p.days || String(p.id).startsWith('sub_')) && p.price_toman);
    if (valid.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'طرحی منتشر نشده است؛ از ربات خرید کنید.';
      box.appendChild(e);
      return;
    }
    valid.sort((a, b) => (a.days || 0) - (b.days || 0));
    if (!selectedPlanId) selectedPlanId = valid[valid.length - 1].id;
    for (const p of valid) {
      const card = document.createElement('div');
      card.className = 'plan-card' + (selectedPlanId === p.id ? ' selected' : '');
      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'plan-name';
      name.textContent = p.name_fa || p.id;
      const days = document.createElement('div');
      days.className = 'plan-days';
      days.textContent = U.faNum(p.days || '') + ' روز';
      info.appendChild(name);
      info.appendChild(days);
      const price = document.createElement('div');
      price.className = 'plan-price';
      price.textContent = U.faNum(p.price_toman) + ' تومان';
      card.appendChild(info);
      card.appendChild(price);
      card.addEventListener('click', () => { selectedPlanId = p.id; renderPlans(state); });
      box.appendChild(card);
    }
  }

  function render(state) {
    currentState = state;
    $('tierBadge').textContent = tierFa(state.tier) + (state.session ? ' — ' + state.session.email : '');

    // اطلاعیه
    const ann = state.announcement;
    const annEl = $('announcement');
    if (ann && state.dismissedAnnouncementId !== ann.id) {
      annEl.classList.remove('hidden');
      $('announceText').textContent = ann.text;
      const link = $('announceLink');
      if (ann.link_url) {
        link.classList.remove('hidden');
        link.href = ann.link_url;
        link.textContent = ann.button_title || 'مشاهده';
        link.onclick = () => { send({ type: 'recordAdClick', adId: ann.id }); };
      } else {
        link.classList.add('hidden');
      }
    } else {
      annEl.classList.add('hidden');
    }

    // اتصال
    const btn = $('connectBtn');
    btn.textContent = state.connected ? 'قطع اتصال' : 'اتصال';
    btn.classList.toggle('connected', !!state.connected);
    $('connStatus').textContent = state.connected ? 'متصل' : 'قطع';
    const srv = state.connected
      ? (state.servers || []).find((s) => s.id === state.connectedServerId)
      : (state.servers || []).find((s) => s.id === state.selectedServerId);
    $('serverLine').textContent = srv
      ? countryName(srv.country) + ' — ' + srv.host + ':' + srv.port + ' (' + U.formatPing(srv.ping) + ')'
      : 'سروری انتخاب نشده است';
    const vLine = $('verifyLine');
    if (state.connected) {
      vLine.classList.remove('hidden');
      if (state.verified) { vLine.textContent = 'تونل تأیید شد ✓'; vLine.classList.remove('warn'); }
      else { vLine.textContent = 'متصل — تأیید آی‌پی ممکن نشد'; vLine.classList.add('warn'); }
    } else {
      vLine.classList.add('hidden');
    }

    // توصیه‌شده: ۵ تای اولِ مجاز
    const rec = $('recommendedList');
    rec.innerHTML = '';
    const allowed = state.allowedServers || [];
    if (allowed.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'سروری در دسترس نیست؛ دکمه‌ی به‌روزرسانی را بزنید.';
      rec.appendChild(e);
    } else {
      for (const s of allowed.slice(0, 5)) rec.appendChild(serverRow(s, state));
    }
    renderGroups(state);
    renderPlans(state);

    // وضعیت اشتراک
    const sub = state.subscription;
    const gift = state.gift;
    let subText = 'اشتراکی فعال نیست.';
    if (sub && sub.active && sub.expires_at > Date.now()) {
      subText = 'اشتراک ویژه فعال است — ' + U.faNum(sub.remaining_days || 0) + ' روز باقی مانده است.';
    } else if (gift && gift.expires_at > Date.now()) {
      const hoursLeft = Math.max(1, Math.ceil((gift.expires_at - Date.now()) / 3600000));
      subText = 'هدیه فعال است — ' + U.faNum(hoursLeft) + ' ساعت باقی مانده است.';
    }
    $('subStatus').textContent = subText;

    // حساب
    if (state.session) {
      $('authBox').classList.add('hidden');
      $('userBox').classList.remove('hidden');
      $('userEmail').textContent = state.session.email;
      $('userTier').textContent = tierFa(state.tier);
    } else {
      $('authBox').classList.remove('hidden');
      $('userBox').classList.add('hidden');
    }

    startSpeedPolling();
  }

  async function loadState() {
    const res = await send({ type: 'getState' });
    if (res && res.ok) render(res.state);
    else showNotice('دریافت وضعیت ناموفق بود.', 'err');
  }

  function startSpeedPolling() {
    if (speedTimer) clearInterval(speedTimer);
    const tick = async () => {
      if (!currentState || !currentState.connected) {
        $('speedDown').textContent = '۰';
        $('speedUp').textContent = '۰';
        return;
      }
      const st = await P.fetchHelperStats();
      if (st && st.download_bps !== null) {
        $('speedDown').textContent = U.formatSpeed(st.download_bps);
        $('speedUp').textContent = U.formatSpeed(st.upload_bps);
      } else {
        $('speedDown').textContent = '—';
        $('speedUp').textContent = '—';
      }
    };
    tick();
    speedTimer = setInterval(tick, 1000);
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  }

  function bind() {
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => switchTab(t.dataset.tab));
    });
    $('refreshBtn').addEventListener('click', async () => {
      $('refreshBtn').disabled = true;
      const r = await send({ type: 'refresh' });
      $('refreshBtn').disabled = false;
      if (r && r.ok) { showNotice('لیست سرورها به‌روز شد (' + U.faNum(r.count) + ' سرور).', 'ok'); await loadState(); }
      else showNotice((r && r.error) || 'به‌روزرسانی ناموفق بود.', 'err');
    });
    $('connectBtn').addEventListener('click', async () => {
      const btn = $('connectBtn');
      btn.disabled = true;
      if (currentState && currentState.connected) {
        await send({ type: 'disconnect' });
      } else {
        const r = await send({ type: 'connect' });
        if (!r.ok) {
          showNotice(r.error || 'اتصال ناموفق بود.', 'err');
          if (r.needHelper) {
            const go = confirm('اپ دسکتاپ TAHA VPN 5G در حال اجرا نیست. راهنمای نصب باز شود؟');
            if (go) chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html') });
          }
        } else if (r.pendingAd) {
          showNotice('پیش از اتصال، تبلیغ نمایش داده می‌شود؛ پس از پایان آن اتصال شروع می‌شود.', '');
        } else {
          showNotice(r.message || 'متصل شدید.', 'ok');
        }
      }
      btn.disabled = false;
      await loadState();
    });
    $('announceClose').addEventListener('click', async () => {
      if (currentState && currentState.announcement) {
        await send({ type: 'dismissAnnouncement', id: currentState.announcement.id });
        await loadState();
      }
    });
    $('giftBtn').addEventListener('click', () => $('giftBox').classList.toggle('hidden'));
    $('giftSubmit').addEventListener('click', async () => {
      const code = $('giftCode').value.trim();
      const msg = $('giftMsg');
      msg.textContent = 'در حال بررسی…';
      msg.className = 'msg';
      const r = await send({ type: 'redeem', code: code, kind: 'gift' });
      if (r.ok) { msg.textContent = r.message || 'کد هدیه فعال شد.'; msg.className = 'msg ok'; await loadState(); }
      else { msg.textContent = r.error || 'کد معتبر نیست.'; msg.className = 'msg err'; }
    });
    $('redeemBtn').addEventListener('click', () => $('redeemBox').classList.toggle('hidden'));
    $('redeemSubmit').addEventListener('click', async () => {
      const code = $('redeemCode').value.trim();
      const msg = $('redeemMsg');
      msg.textContent = 'در حال بررسی…';
      msg.className = 'msg';
      const r = await send({ type: 'redeem', code: code, kind: 'subscription' });
      if (r.ok) { msg.textContent = r.message || 'اشتراک فعال شد.'; msg.className = 'msg ok'; await loadState(); }
      else { msg.textContent = r.error || 'کد معتبر نیست.'; msg.className = 'msg err'; }
    });
    $('buyBtn').addEventListener('click', () => {
      const plan = selectedPlanId ? 'buy_' + selectedPlanId : 'buy';
      chrome.tabs.create({ url: C.BOT_URL + '?start=' + plan });
    });
    $('loginBtn').addEventListener('click', () => doAuth('login'));
    $('signupBtn').addEventListener('click', () => doAuth('signup'));
    $('recoverBtn').addEventListener('click', async () => {
      const email = $('emailInput').value.trim();
      const msg = $('authMsg');
      if (!email) { msg.textContent = 'ایمیل را وارد کنید.'; msg.className = 'msg err'; return; }
      msg.textContent = 'در حال ارسال…';
      msg.className = 'msg';
      const r = await send({ type: 'recover', email: email });
      if (r.ok) { msg.textContent = 'لینک بازیابی ارسال شد؛ صندوق ورودی و پوشه‌ی اسپم را بررسی کنید.'; msg.className = 'msg ok'; }
      else { msg.textContent = r.error || 'ارسال ناموفق بود.'; msg.className = 'msg err'; }
    });
    $('logoutBtn').addEventListener('click', async () => { await send({ type: 'logout' }); await loadState(); });
    $('supportBtn').addEventListener('click', () => chrome.tabs.create({ url: C.BOT_SUPPORT_URL }));
    $('optionsBtn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html') }));
  }

  async function doAuth(kind) {
    const email = $('emailInput').value.trim();
    const password = $('passwordInput').value;
    const msg = $('authMsg');
    if (!email || !password) { msg.textContent = 'ایمیل و رمز عبور را وارد کنید.'; msg.className = 'msg err'; return; }
    if (password.length < 6) { msg.textContent = 'رمز عبور باید حداقل ۶ کاراکتر باشد.'; msg.className = 'msg err'; return; }
    msg.textContent = 'در حال بررسی…';
    msg.className = 'msg';
    const r = await send({ type: kind, email: email, password: password });
    if (r.ok) { msg.textContent = kind === 'signup' ? 'ثبت‌نام انجام شد؛ خوش آمدید.' : 'وارد شدید.'; msg.className = 'msg ok'; await loadState(); }
    else { msg.textContent = r.error || 'خطایی رخ داد.'; msg.className = 'msg err'; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    loadState();
  });
})();
