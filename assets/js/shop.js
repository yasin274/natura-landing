/* ============================================================
   Natura — каталог из базы, корзина и оформление заказа.
   Без зависимостей, все сообщения на русском.

   Почему отдельный файл, а не дописано в main.js: main.js отвечает за
   оформление страницы (меню, слайдеры, появление блоков) и работает
   без сервера. Здесь всё, что без API бессмысленно, — если бэкенд
   недоступен, ломается только этот файл, а сайт остаётся живым.
   ============================================================ */
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* Тост объявлен в main.js. Запасной вариант нужен на случай, если этот
     файл когда-нибудь подключат отдельно — молча терять сообщения хуже. */
  const toast = (text) => (window.naturaToast ? window.naturaToast(text) : console.info(text));

  /* Пустая база — тот же origin: сервер раздаёт лендинг сам. */
  const API = `${(window.NATURA_API_BASE || '').replace(/\/+$/, '')}/api`;

  const money = new Intl.NumberFormat('ru-RU');
  /* Неразрывный пробел перед ₽ — чтобы знак валюты не переносился на строку ниже. */
  const price = (value) => `${money.format(value)} ₽`;

  /* ── Запрос к API ─────────────────────────────────────── */
  /* Единая точка: и формат ответа { success, data | error }, и таймаут
     разбираются здесь, чтобы вызывающий код видел либо данные, либо Error
     с человеческим текстом. */
  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      // Без таймаута зависший запрос оставит покупателя перед вечным спиннером.
      signal: AbortSignal.timeout(12000),
      ...options,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Ответ не JSON — обычно это страница 502 от прокси.
      throw new Error('Сервер ответил неожиданным образом. Попробуйте позже.');
    }

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error?.message || 'Не удалось выполнить запрос.');
    }

    return payload.data;
  }

  /* ══════════════════════════════════════════════════════
     Корзина: состояние в localStorage
     ══════════════════════════════════════════════════════ */
  /* Ключ с версией: если структура записи изменится, старую можно будет
     отличить и не пытаться прочитать её новым кодом. */
  const CART_KEY = 'natura.cart.v1';

  /**
   * В корзине хранятся название, цена и картинка — но только ради показа
   * без лишнего запроса. Сервер при оформлении всё равно берёт цену из базы
   * по productId, поэтому правка localStorage в DevTools ничего не даёт.
   */
  let cart = readCart();

  function readCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      // Чужие или битые записи отбрасываем поштучно, а не роняем всю корзину.
      return raw.filter((item) => item && typeof item.id === 'string' && Number.isFinite(item.qty) && item.qty > 0);
    } catch {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Приватный режим Safari запрещает запись. Терять корзину неприятно,
      // но ронять оформление заказа из-за этого нельзя — она живёт в памяти.
    }
    renderCart();
    renderBadge();
  }

  const cartCount = () => cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = () => cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  function addToCart(product) {
    const existing = cart.find((item) => item.id === product.id);

    // Тот же предел, что и на сервере (max 20): лучше сказать об этом сразу,
    // чем получить отказ уже после заполнения формы.
    if (existing) {
      if (existing.qty >= 20) {
        toast('Больше 20 штук одной позиции — напишите нам, посчитаем отдельно');
        return;
      }
      existing.qty += 1;
    } else {
      cart.push({
        id: product.id,
        title: product.title,
        price: product.price,
        imageUrl: product.imageUrl,
        qty: 1,
      });
    }

    saveCart();
    toast(`«${product.title}» — в корзине`);
  }

  function setQty(id, delta) {
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;

    item.qty += delta;
    if (item.qty < 1) cart = cart.filter((entry) => entry.id !== id);
    if (item.qty > 20) item.qty = 20;

    saveCart();
  }

  function removeFromCart(id) {
    cart = cart.filter((item) => item.id !== id);
    saveCart();
  }

  /* ── Значок в шапке ───────────────────────────────────── */
  const badge = $('[data-cart-count]');
  let badgeShown = -1;

  function renderBadge() {
    if (!badge) return;

    const count = cartCount();
    badge.textContent = String(count);

    // Анимация только на изменение. При первой отрисовке (восстановление
    // корзины из localStorage) значок дёргался бы без причины.
    if (badgeShown >= 0 && count !== badgeShown) {
      badge.classList.add('is-bump');
      setTimeout(() => badge.classList.remove('is-bump'), 220);
    }
    badgeShown = count;
  }

  /* ══════════════════════════════════════════════════════
     Каталог
     ══════════════════════════════════════════════════════ */
  const grid    = $('#shop-grid');
  const state   = $('#shop-state');
  const filters = $('#shop-filters');
  const moreBtn = $('#shop-more');

  const PAGE_SIZE = 8;
  let currentCategory = null;   // null — «все разделы»
  let loaded = 0;
  let total = 0;

  /* Товары держим под рукой: по клику «в корзину» нужны цена и название,
     а лезть за ними в разметку — способ поймать баг на первом же пробеле. */
  const shown = new Map();

  function setState(html) {
    if (!state) return;
    state.innerHTML = html;
    state.hidden = !html;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Заготовка вместо фотографии — та же логика, что у .ph в main.js:
     пока файла нет, показываем аккуратный силуэт, а не битую картинку. */
  const PLACEHOLDER_SVG = `
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="300" fill="#EFE9DE"/>
      <ellipse cx="200" cy="252" rx="150" ry="18" fill="#E3D9C7"/>
      <rect x="86" y="120" width="228" height="70" rx="18" fill="#E5DCCC"/>
      <rect x="72" y="168" width="256" height="66" rx="20" fill="#F2EDE3"/>
      <rect x="72" y="158" width="36" height="76" rx="18" fill="#E1D7C5"/>
      <rect x="292" y="158" width="36" height="76" rx="18" fill="#E1D7C5"/>
      <path d="M92 234v16M308 234v16" stroke="#A8865E" stroke-width="8" stroke-linecap="round"/>
    </svg>`;

  function discountTag(product) {
    if (!product.oldPrice || product.oldPrice <= product.price) return '';
    const percent = Math.round((1 - product.price / product.oldPrice) * 100);
    return `<span class="tag tag--sale">−${percent}%</span>`;
  }

  function cardHtml(product) {
    const old = product.oldPrice && product.oldPrice > product.price
      ? `<s class="price__old">${price(product.oldPrice)}</s>`
      : '';

    /* Кнопка отключена, если товара нет в наличии: карточку оставляем
       видимой (поставка может приехать через неделю), но обещать сроки,
       которых нет, нельзя. */
    const button = product.inStock
      ? `<button class="addbtn" type="button" data-add-product="${product.id}"
                 aria-label="Добавить «${escapeHtml(product.title)}» в корзину">
           <svg class="ic ic--18"><use href="#i-cart"/></svg>
         </button>`
      : `<button class="addbtn" type="button" disabled aria-label="Нет в наличии">
           <svg class="ic ic--18"><use href="#i-cart"/></svg>
         </button>`;

    return `
      <li class="card">
        <div class="card__media">
          ${discountTag(product)}
          <div class="ph" data-photo="${escapeHtml(product.imageUrl)}"
               role="img" aria-label="${escapeHtml(product.title)}">${PLACEHOLDER_SVG}</div>
        </div>
        <div class="card__body">
          <h3 class="card__name">${escapeHtml(product.title)}</h3>
          <p class="card__desc">${escapeHtml(product.description)}</p>
          <p class="price">${price(product.price)} ${old}</p>
          <div class="card__foot card__foot--shop">
            <span class="stock">${product.inStock ? '' : 'Нет в наличии'}</span>
            ${button}
          </div>
        </div>
      </li>`;
  }

  /* Подстановка настоящих фотографий. Пробуем загрузить файл и меняем фон
     только после успеха — иначе на месте отсутствующего снимка была бы
     «сломанная картинка» вместо заготовки. */
  function attachPhotos(root) {
    $$('.ph[data-photo]', root).forEach((ph) => {
      const src = ph.dataset.photo;
      if (!src) return;
      const probe = new Image();
      probe.onload = () => {
        ph.style.backgroundImage = `url("${src}")`;
        ph.classList.add('has-photo');
      };
      probe.src = src;
    });
  }

  async function loadCategories() {
    if (!filters) return;

    try {
      const data = await api('/catalog/categories');
      // Разделы без товаров не показываем: клик по такому фильтру ведёт
      // в пустоту, и посетитель решает, что каталог сломан.
      const categories = data.categories.filter((category) => category.productCount > 0);

      if (categories.length === 0) return;

      filters.innerHTML = [
        `<button class="chip is-on" type="button" data-filter="" aria-pressed="true">Все</button>`,
        ...categories.map(
          (category) => `<button class="chip" type="button" data-filter="${escapeHtml(category.slug)}" aria-pressed="false">
              ${escapeHtml(category.title)}<span class="chip__count">${category.productCount}</span>
            </button>`,
        ),
      ].join('');
    } catch {
      // Фильтры — удобство, а не необходимость: без них каталог покажет всё.
      filters.innerHTML = '';
    }
  }

  function syncFilterButtons() {
    $$('.chip', filters).forEach((chip) => {
      const on = (chip.dataset.filter || '') === (currentCategory || '');
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', String(on));
    });

    // Значки-категории вверху страницы — тот же фильтр другими средствами.
    $$('.cat[data-cat]').forEach((cat) => {
      cat.classList.toggle('is-active', cat.dataset.cat === currentCategory);
    });
  }

  async function loadProducts({ reset = false } = {}) {
    if (!grid) return;

    if (reset) {
      loaded = 0;
      grid.innerHTML = '';
      shown.clear();
      setState('Загружаем каталог…');
    }

    if (moreBtn) moreBtn.hidden = true;

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(loaded) });
    if (currentCategory) params.set('category', currentCategory);

    try {
      const data = await api(`/catalog/products?${params}`);
      total = data.total;

      for (const product of data.items) shown.set(product.id, product);

      grid.insertAdjacentHTML('beforeend', data.items.map(cardHtml).join(''));
      attachPhotos(grid);
      loaded += data.items.length;

      if (loaded === 0) {
        /* Вежливая заглушка вместо пустоты. Формулировка разная для
           «каталог пуст» и «в этом разделе пусто»: во втором случае
           у посетителя есть очевидный следующий шаг. */
        setState(
          currentCategory
            ? '<b>В этом разделе пока пусто</b>Загляните в соседние — или напишите нам, подберём вручную.'
            : '<b>Каталог пока наполняется</b>Мы как раз фотографируем новые модели. Напишите нам — расскажем, что уже готово к отгрузке.',
        );
      } else {
        setState('');
      }

      if (moreBtn) moreBtn.hidden = loaded >= total;
    } catch (error) {
      // Показываем не «Failed to fetch», а понятную причину и способ связи.
      setState(
        `<b>Каталог сейчас недоступен</b>${escapeHtml(error.message)}<br>Позвоните нам: +7 (800) 123-45-67 — расскажем о наличии и ценах.`,
      );
    }
  }

  /* Делегирование вместо обработчика на каждой кнопке: карточки
     перерисовываются при смене фильтра, и навешивать заново пришлось бы всё. */
  grid?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-product]');
    if (!button) return;

    const product = shown.get(button.dataset.addProduct);
    if (product) addToCart(product);
  });

  filters?.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    currentCategory = chip.dataset.filter || null;
    syncFilterButtons();
    void loadProducts({ reset: true });
  });

  $$('.cat[data-cat]').forEach((cat) => {
    cat.addEventListener('click', () => {
      currentCategory = cat.dataset.cat || null;
      syncFilterButtons();
      void loadProducts({ reset: true });
    });
  });

  moreBtn?.addEventListener('click', () => void loadProducts());

  /* ══════════════════════════════════════════════════════
     Панель корзины
     ══════════════════════════════════════════════════════ */
  const panel     = $('#cart');
  const list      = $('#cart-list');
  const emptyMsg  = $('#cart-empty');
  const totalRow  = $('#cart-total-row');
  const totalSum  = $('#cart-total');
  const form      = $('#order-form');
  const formMsg   = $('#order-msg');

  let lastFocused = null;
  /* Момент открытия формы. Сервер считает отправку быстрее двух секунд
     машинной — человек столько не успевает. */
  let openedAt = 0;

  function renderCart() {
    if (!list) return;

    list.innerHTML = cart
      .map(
        (item) => `
        <li class="cart__item">
          <div class="ph cart__thumb" data-photo="${escapeHtml(item.imageUrl || '')}" role="img"
               aria-label="${escapeHtml(item.title)}">${PLACEHOLDER_SVG}</div>
          <div>
            <p class="cart__name">${escapeHtml(item.title)}</p>
            <p class="cart__price">${price(item.price)} × ${item.qty} = ${price(item.price * item.qty)}</p>
            <button class="cart__drop" type="button" data-remove="${item.id}">Убрать</button>
          </div>
          <div class="cart__qty">
            <button class="qbtn" type="button" data-qty="-1" data-id="${item.id}" aria-label="Уменьшить количество">−</button>
            <span class="cart__num">${item.qty}</span>
            <button class="qbtn" type="button" data-qty="1" data-id="${item.id}" aria-label="Увеличить количество">+</button>
          </div>
        </li>`,
      )
      .join('');

    attachPhotos(list);

    const empty = cart.length === 0;
    if (emptyMsg) emptyMsg.hidden = !empty;
    if (totalRow) totalRow.hidden = empty;
    if (form) form.hidden = empty;
    if (totalSum) totalSum.textContent = price(cartTotal());
  }

  list?.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      removeFromCart(remove.dataset.remove);
      return;
    }

    const qty = event.target.closest('[data-qty]');
    if (qty) setQty(qty.dataset.id, Number(qty.dataset.qty));
  });

  function openCart() {
    if (!panel) return;

    lastFocused = document.activeElement;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('is-on'));
    document.body.style.overflow = 'hidden';
    openedAt = Date.now();

    // Фокус уводим внутрь панели, иначе Tab продолжит гулять по странице
    // под затемнением — для клавиатуры и скринридера это тупик.
    $('[data-cart-close]', panel)?.focus();
  }

  function closeCart() {
    if (!panel) return;

    panel.classList.remove('is-on');
    document.body.style.overflow = '';
    setTimeout(() => { panel.hidden = true; }, 240);
    lastFocused?.focus();
  }

  $('[data-cart-open]')?.addEventListener('click', openCart);
  $$('[data-cart-close]').forEach((btn) => btn.addEventListener('click', closeCart));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel && !panel.hidden) closeCart();
  });

  /* ══════════════════════════════════════════════════════
     Оформление заказа
     ══════════════════════════════════════════════════════ */
  function setFormMsg(kind, text) {
    if (!formMsg) return;
    formMsg.classList.remove('is-bad', 'is-ok');
    if (kind) formMsg.classList.add(`is-${kind}`);
    formMsg.textContent = text;
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submit = $('button[type="submit"]', form);
    const name = $('#o-name').value.trim();
    const contact = $('#o-contact').value.trim();
    const comment = $('#o-comment').value.trim();
    const consent = $('#o-consent').checked;

    /* Проверяем на клиенте ровно то же, что и сервер, — но только чтобы
       не гонять заведомо неверный запрос. Настоящая проверка всё равно
       на сервере: до него доходят и запросы мимо этой формы. */
    if (name.length < 2)     return setFormMsg('bad', 'Как к вам обращаться?');
    if (contact.length < 3)  return setFormMsg('bad', 'Нужен способ связи: телефон, почта или ник.');
    if (!consent)            return setFormMsg('bad', 'Без согласия на обработку данных мы не можем принять заказ.');
    if (cart.length === 0)   return setFormMsg('bad', 'Корзина пуста.');

    submit.disabled = true;
    setFormMsg(null, 'Отправляем заказ…');

    try {
      const data = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: name,
          contact,
          comment: comment || undefined,
          consent: true,
          // Наружу уходят только идентификатор и количество: цену и название
          // сервер берёт из базы сам, поэтому подделать сумму невозможно.
          items: cart.map((item) => ({ productId: item.id, quantity: item.qty })),
          honey: $('#o-company').value,
          openedAt,
        }),
      });

      cart = [];
      saveCart();
      form.reset();

      setFormMsg(
        'ok',
        data.order?.id
          ? `Заказ принят. Мы свяжемся с вами в ближайшее время. Номер: ${data.order.id.slice(0, 8)}.`
          : 'Заказ принят. Мы свяжемся с вами в ближайшее время.',
      );
      toast('Спасибо! Заказ принят.');
    } catch (error) {
      setFormMsg('bad', error.message);
    } finally {
      submit.disabled = false;
    }
  });

  /* ── Старт ────────────────────────────────────────────── */
  renderCart();
  renderBadge();
  void loadCategories().then(() => {
    syncFilterButtons();
    return loadProducts({ reset: true });
  });
})();
