/* ============================================================
   Natura — интерактив лендинга
   Без зависимостей. Все сообщения — на русском.
   ============================================================ */
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Тост ─────────────────────────────────────────────── */
  const toastEl = $('[data-toast]');
  let toastTimer;
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
  }

  /* ── Плавающая шапка ──────────────────────────────────── */
  const header = $('#header');
  const onScroll = () => header?.classList.toggle('is-stuck', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── Мобильное меню ───────────────────────────────────── */
  const nav       = $('#nav');
  const openBtn   = $('[data-menu-open]');
  const closeBtn  = $('[data-menu-close]');
  const scrim     = $('[data-scrim]');
  let lastFocused = null;

  function openMenu() {
    lastFocused = document.activeElement;
    nav.classList.add('is-open');
    openBtn.setAttribute('aria-expanded', 'true');
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('is-on'));
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }
  function closeMenu() {
    nav.classList.remove('is-open');
    openBtn.setAttribute('aria-expanded', 'false');
    scrim.classList.remove('is-on');
    setTimeout(() => { scrim.hidden = true; }, reduced ? 0 : 240);
    document.body.style.overflow = '';
    (lastFocused || openBtn).focus();
  }

  openBtn?.addEventListener('click', openMenu);
  closeBtn?.addEventListener('click', closeMenu);
  scrim?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav?.classList.contains('is-open')) closeMenu();
  });

  /* Клик по ссылке в мобильном меню — закрыть и подсветить активный пункт */
  $$('.nav__link').forEach((link) => {
    link.addEventListener('click', () => {
      $$('.nav__link').forEach((l) => l.classList.remove('is-active'));
      link.classList.add('is-active');
      if (nav.classList.contains('is-open')) closeMenu();
    });
  });

  /* ── Реальные фото вместо SVG-заготовок ───────────────── */
  /* Разметка: <div class="ph" data-photo="photos/hero.jpg"> */
  $$('.ph[data-photo]').forEach((ph) => {
    const src = ph.dataset.photo;
    if (!src) return;
    const probe = new Image();
    probe.onload = () => {
      ph.style.backgroundImage = `url("${src}")`;
      ph.classList.add('has-photo');
    };
    probe.src = src; // не загрузилось — остаётся SVG-иллюстрация
  });

  /* ── Горизонтальные слайдеры (товары, отзывы) ─────────── */
  function step(track) {
    const first = track.firstElementChild;
    if (!first) return track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0;
    return first.getBoundingClientRect().width + gap;
  }

  $$('[data-slide]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const track = document.getElementById(btn.dataset.target);
      if (!track) return;
      const dir = btn.dataset.slide === 'next' ? 1 : -1;
      track.scrollBy({ left: dir * step(track), behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  /* Блокируем стрелки на краях трека */
  function syncArrows(track) {
    const max  = track.scrollWidth - track.clientWidth - 2;
    const prev = $(`[data-slide="prev"][data-target="${track.id}"]`);
    const next = $(`[data-slide="next"][data-target="${track.id}"]`);
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = track.scrollLeft >= max;
  }

  /* Точки-индикаторы */
  function buildDots(track) {
    const host = $(`[data-dots="${track.id}"]`);
    if (!host) return null;
    const pages = Math.max(1, Math.ceil(track.scrollWidth / track.clientWidth));
    host.innerHTML = '';
    for (let i = 0; i < pages; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `Страница ${i + 1} из ${pages}`);
      b.addEventListener('click', () => {
        track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
      });
      host.appendChild(b);
    }
    return host;
  }

  function syncDots(track) {
    const host = $(`[data-dots="${track.id}"]`);
    if (!host) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    $$('button', host).forEach((b, n) => {
      b.classList.toggle('is-on', n === i);
      b.setAttribute('aria-selected', n === i ? 'true' : 'false');
    });
  }

  const tracks = $$('.track');
  tracks.forEach((track) => {
    buildDots(track);
    syncArrows(track);
    syncDots(track);

    let raf;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { syncArrows(track); syncDots(track); });
    }, { passive: true });

    /* Перетаскивание мышью — как на тачскрине */
    let down = false, startX = 0, startLeft = 0, moved = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.target.closest('button, a')) return;
      down = true; moved = false;
      startX = e.clientX; startLeft = track.scrollLeft;
      track.style.cursor = 'grabbing';
    });
    track.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      track.scrollLeft = startLeft - dx;
    });
    const release = () => { down = false; track.style.cursor = ''; };
    track.addEventListener('pointerup', release);
    track.addEventListener('pointerleave', release);
    track.addEventListener('click', (e) => { if (moved) e.preventDefault(); }, true);

    /* Клавиатура: ← → */
    track.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      track.scrollBy({ left: dir * step(track), behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  let resizeRaf;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      tracks.forEach((t) => { buildDots(t); syncArrows(t); syncDots(t); });
    });
  });

  /* ── Автопрокрутка отзывов ────────────────────────────── */
  const revs = $('#reviews');
  if (revs && !reduced) {
    let timer = null;
    const tick = () => {
      const max = revs.scrollWidth - revs.clientWidth - 2;
      if (revs.scrollLeft >= max) revs.scrollTo({ left: 0, behavior: 'smooth' });
      else revs.scrollBy({ left: step(revs), behavior: 'smooth' });
    };
    const play  = () => { timer ??= setInterval(tick, 5200); };
    const pause = () => { clearInterval(timer); timer = null; };

    play();
    ['pointerenter', 'focusin', 'pointerdown'].forEach((ev) => revs.addEventListener(ev, pause));
    ['pointerleave', 'focusout'].forEach((ev) => revs.addEventListener(ev, play));
    document.addEventListener('visibilitychange', () => document.hidden ? pause() : play());
  }

  /* ── Название товара ──────────────────────────────────── */
  /* RU: имя в разметке уже в «кавычках-ёлочках». Вкладывать «» в «»
     нельзя, поэтому внутренние кавычки заменяем на „лапки“. */
  function productName(el) {
    const raw = el?.closest('.card')?.querySelector('.card__name')?.textContent.trim() || 'Товар';
    return raw.replace(/«([^»]*)»/g, '„$1“');
  }

  /* ── Избранное ────────────────────────────────────────── */
  $$('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const on = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
      const name = productName(btn);
      btn.setAttribute('aria-label', on ? `Убрать «${name}» из избранного` : `Добавить «${name}» в избранное`);
      toast(on ? `«${name}» — в избранном` : `«${name}» убран из избранного`);
    });
  });

  /* ── Выбор обивки / отделки ───────────────────────────── */
  $$('.swatches').forEach((group) => {
    $$('[data-sw]', group).forEach((sw) => {
      sw.addEventListener('click', () => {
        $$('[data-sw]', group).forEach((s) => {
          s.classList.remove('is-on');
          s.setAttribute('aria-pressed', 'false');
        });
        sw.classList.add('is-on');
        sw.setAttribute('aria-pressed', 'true');
      });
    });
  });

  /* ── Корзина ──────────────────────────────────────────── */
  const counter = $('[data-cart-count]');
  let cart = 0;
  $$('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cart += 1;
      if (counter) {
        counter.textContent = String(cart);
        counter.classList.add('is-bump');
        setTimeout(() => counter.classList.remove('is-bump'), 220);
      }
      toast(`«${productName(btn)}» добавлен в корзину`);
    });
  });

  /* ── Подписка ─────────────────────────────────────────── */
  const form = $('[data-news]');
  if (form) {
    const input = $('#email', form);
    const field = $('.field', form);
    const msg   = $('#email-msg', form);
    const valid = (v) => /^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/.test(v.trim());

    const setState = (kind, text) => {
      field.classList.toggle('is-bad', kind === 'bad');
      msg.classList.remove('is-bad', 'is-ok');
      if (kind) msg.classList.add(`is-${kind}`);
      msg.textContent = text;
      input.setAttribute('aria-invalid', kind === 'bad' ? 'true' : 'false');
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v)            return setState('bad', 'Укажите e-mail — без него не сможем отправить письмо.');
      if (!valid(v))     return setState('bad', 'Проверьте адрес: похоже, в нём опечатка.');
      setState('ok', 'Готово! Проверьте почту — мы отправили письмо для подтверждения.');
      input.value = '';
      toast('Спасибо за подписку!');
    });

    /* Ошибку убираем сразу, как только начали править */
    input.addEventListener('input', () => {
      if (field.classList.contains('is-bad')) setState(null, '');
    });
  }

  /* ── Появление блоков при скролле ─────────────────────── */
  const revealables = $$('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealables.forEach((el) => io.observe(el));
  }

  /* ── Подсветка активного пункта меню при скролле ───────── */
  const sections = ['main', 'catalog', 'collections', 'about', 'ideas', 'contacts']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting)
                         .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!hit) return;
      const link = $(`.nav__link[href="#${hit.target.id}"]`);
      if (!link) return;
      $$('.nav__link').forEach((l) => l.classList.remove('is-active'));
      link.classList.add('is-active');
    }, { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach((s) => spy.observe(s));
  }
})();
