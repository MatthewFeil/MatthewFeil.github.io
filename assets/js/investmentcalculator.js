(() => {
  const app = document.querySelector('[data-investment-calculator]');

  if (!app) {
    return;
  }

  const form = document.getElementById('investment-form');
  const apiUrl = app.dataset.apiUrl;
  const amountInput = document.getElementById('investment-amount');
  const dateInput = document.getElementById('investment-date');
  const endDateInput = document.getElementById('investment-end-date');
  const symbolInput = document.getElementById('investment-symbol');
  const submitButton = document.getElementById('investment-submit');
  const detailsToggle = document.getElementById('investment-details-toggle');
  const detailsPanel = document.getElementById('investment-details');
  const status = document.getElementById('investment-status');
  const results = document.getElementById('investment-results');

  const output = {
    title: document.getElementById('investment-result-title'),
    range: document.getElementById('investment-result-range'),
    currentValue: document.getElementById('result-current-value'),
    totalGain: document.getElementById('result-total-gain'),
    gainPercent: document.getElementById('result-gain-percent'),
    inflationPercent: document.getElementById('result-inflation-percent'),
    realValue: document.getElementById('result-real-value'),
    realGain: document.getElementById('result-real-gain'),
    realPercent: document.getElementById('result-real-percent'),
    shares: document.getElementById('result-shares'),
    amount: document.getElementById('detail-amount'),
    purchaseDate: document.getElementById('detail-purchase-date'),
    purchasePrice: document.getElementById('detail-purchase-price'),
    currentDate: document.getElementById('detail-current-date'),
    currentPrice: document.getElementById('detail-current-price'),
    inflatedAmount: document.getElementById('detail-inflated-amount'),
    priceSource: document.getElementById('detail-price-source'),
    inflationSource: document.getElementById('detail-inflation-source')
  };

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });

  const priceFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });

  const percentFormatter = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const shareFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6
  });

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });

  function toInputDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function toLocalInputDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseInputDate(value) {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function updateDateDisplay(input) {
    const display = document.querySelector(`[data-date-display="${input.id}"]`);

    if (!display) {
      return;
    }

    display.textContent = input.value || 'YYYY-MM-DD';
  }

  function openDatePicker(input) {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }

    if (typeof input.showPicker !== 'function') {
      return;
    }

    try {
      input.showPicker();
    } catch {
      // Some browsers only allow the native picker from the input's own default tap.
    }
  }

  function formatDate(date) {
    return dateFormatter.format(date);
  }

  function setStatus(message, tone) {
    status.classList.remove('is-revealing');
    status.textContent = message;
    status.dataset.tone = tone || '';

    if (message) {
      window.requestAnimationFrame(() => status.classList.add('is-revealing'));
    }
  }

  function setFieldInvalid(input, isInvalid) {
    if (isInvalid) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
    input.closest('.investment-field')?.classList.toggle('is-invalid', isInvalid);
  }

  function clearFieldErrors() {
    [amountInput, dateInput, endDateInput, symbolInput].forEach((input) => {
      setFieldInvalid(input, false);
    });
  }

  function showValidationError(message, inputs) {
    inputs.forEach((input) => setFieldInvalid(input, true));
    setStatus(message, 'error');
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.classList.toggle('is-loading', isLoading);
    submitButton.setAttribute('aria-busy', String(isLoading));
    submitButton.textContent = isLoading ? 'Calculating...' : 'Calculate';
    results.setAttribute('aria-busy', String(isLoading));

    if (isLoading) {
      setDetailsOpen(false);
      results.hidden = false;
      results.dataset.state = 'loading';
      app.dataset.calculationState = 'loading';
      setStatus('Getting price and inflation data…', 'loading');
    }
  }

  function normalizeSymbol(value) {
    const symbol = value.trim().toUpperCase().replace(/\s+/g, '');

    if (['SP500', 'S&P500', 'S&P', 'SPX'].includes(symbol)) {
      return 'SPY';
    }

    return symbol;
  }

  async function fetchWithTimeout(url, init = {}, timeout = 20000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          ...(init.headers || {})
        }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${response.status}`);
      }

      return response;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Price data timed out. Try again in a moment.');
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function fetchPriceHistory(symbol, startDate, endDate) {
    if (!apiUrl) {
      throw new Error('Price data is not configured.');
    }

    const response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'investmentHistory',
        symbol,
        start_date: toInputDate(startDate),
        end_date: toInputDate(endDate)
      })
    });
    const data = await response.json();

    return {
      symbol: data.symbol || symbol,
      name: data.name || symbol,
      source: data.source || 'Yahoo Finance',
      purchase: {
        date: parseInputDate(data.purchase?.date),
        price: Number(data.purchase?.price)
      },
      current: {
        date: parseInputDate(data.current?.date),
        price: Number(data.current?.price)
      },
      inflation: data.inflation && Number.isFinite(Number(data.inflation.factor))
        ? {
          factor: Number(data.inflation.factor),
          start: data.inflation.start,
          latest: data.inflation.latest,
          source: data.inflation.source || 'World Bank CPI'
        }
        : null
    };
  }

  function setSigned(element, value, formatter) {
    element.textContent = formatter.format(value);
    element.classList.toggle('investment-positive', value > 0);
    element.classList.toggle('investment-negative', value < 0);
  }

  function setSignedPercent(element, value) {
    element.textContent = `(${percentFormatter.format(value)})`;
    element.classList.toggle('investment-positive', value > 0);
    element.classList.toggle('investment-negative', value < 0);
  }

  function setDetailsOpen(isOpen) {
    detailsPanel.hidden = !isOpen;
    detailsToggle.setAttribute('aria-expanded', String(isOpen));
    detailsToggle.textContent = isOpen ? 'Hide details' : 'Details';
  }

  function renderResults({ amount, symbol, prices, inflation }) {
    const shares = amount / prices.purchase.price;
    const currentValue = shares * prices.current.price;
    const totalGain = currentValue - amount;
    const gainPercent = currentValue / amount - 1;
    const inflationFactor = inflation?.factor || null;
    const inflationPercent = inflationFactor ? inflationFactor - 1 : null;
    const realValue = inflationFactor ? currentValue / inflationFactor : null;
    const realGain = realValue === null ? null : realValue - amount;
    const realPercent = realValue === null ? null : realValue / amount - 1;
    const inflatedAmount = inflationFactor ? amount * inflationFactor : null;

    output.title.textContent = `${symbol} return`;
    output.range.textContent = `${formatDate(prices.purchase.date)} to ${formatDate(prices.current.date)}`;
    output.currentValue.textContent = currencyFormatter.format(currentValue);
    setSigned(output.totalGain, totalGain, currencyFormatter);
    setSignedPercent(output.gainPercent, gainPercent);
    output.inflationPercent.textContent = inflationPercent === null ? '--' : percentFormatter.format(inflationPercent);
    output.realValue.textContent = realValue === null ? '--' : currencyFormatter.format(realValue);

    if (realGain === null || realPercent === null) {
      output.realGain.textContent = '--';
      output.realPercent.textContent = '(--)';
      output.realGain.classList.remove('investment-positive', 'investment-negative');
      output.realPercent.classList.remove('investment-positive', 'investment-negative');
    } else {
      setSigned(output.realGain, realGain, currencyFormatter);
      setSignedPercent(output.realPercent, realPercent);
    }

    output.shares.textContent = shareFormatter.format(shares);
    output.amount.textContent = currencyFormatter.format(amount);
    output.purchaseDate.textContent = formatDate(prices.purchase.date);
    output.purchasePrice.textContent = priceFormatter.format(prices.purchase.price);
    output.currentDate.textContent = formatDate(prices.current.date);
    output.currentPrice.textContent = priceFormatter.format(prices.current.price);
    output.inflatedAmount.textContent = inflatedAmount === null ? '--' : currencyFormatter.format(inflatedAmount);
    output.priceSource.textContent = prices.source;
    output.inflationSource.textContent = inflation?.source || 'Unavailable';

    results.hidden = false;
    results.dataset.state = 'results';
    results.classList.remove('is-revealing');
    void results.offsetWidth;
    results.classList.add('is-revealing');
    app.dataset.calculationState = 'results';
  }

  async function handleSubmit(event) {
    event.preventDefault();

    clearFieldErrors();

    const amount = Number(amountInput.value);
    const startDate = parseInputDate(dateInput.value);
    const endDate = parseInputDate(endDateInput.value);
    const today = new Date();
    const symbol = normalizeSymbol(symbolInput.value);

    if (!Number.isFinite(amount) || amount <= 0 || !startDate || !endDate || !symbol) {
      const invalidInputs = [
        !Number.isFinite(amount) || amount <= 0 ? amountInput : null,
        !startDate ? dateInput : null,
        !endDate ? endDateInput : null,
        !symbol ? symbolInput : null
      ].filter(Boolean);
      showValidationError('Enter an amount, dates, and ticker.', invalidInputs);
      return;
    }

    if (startDate > today || endDate > today) {
      showValidationError('Choose dates that have already happened.', [
        ...(startDate > today ? [dateInput] : []),
        ...(endDate > today ? [endDateInput] : [])
      ]);
      return;
    }

    if (endDate < startDate) {
      showValidationError('Choose an end date after the start date.', [endDateInput]);
      return;
    }

    symbolInput.value = symbol;
    setLoading(true);

    try {
      const prices = await fetchPriceHistory(symbol, startDate, endDate);

      if (
        !prices.purchase.date ||
        !prices.current.date ||
        !Number.isFinite(prices.purchase.price) ||
        !Number.isFinite(prices.current.price)
      ) {
        throw new Error('Price data is unavailable.');
      }

      renderResults({
        amount,
        symbol,
        prices,
        inflation: prices.inflation
      });

      setStatus(prices.inflation ? 'Return calculated.' : 'Return calculated. Inflation data is unavailable.', prices.inflation ? 'success' : 'warning');
    } catch (error) {
      results.hidden = true;
      delete results.dataset.state;
      delete app.dataset.calculationState;
      setStatus(error instanceof Error ? error.message : 'Price data is unavailable.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function initDefaults() {
    const today = new Date();
    const defaultDate = new Date(today);
    defaultDate.setFullYear(defaultDate.getFullYear() - 10);

    dateInput.max = toLocalInputDate(today);
    endDateInput.max = toLocalInputDate(today);
    dateInput.value = toLocalInputDate(defaultDate);
    endDateInput.value = toLocalInputDate(today);
    updateDateDisplay(dateInput);
    updateDateDisplay(endDateInput);
  }

  initDefaults();
  setDetailsOpen(false);
  detailsToggle.addEventListener('click', () => {
    setDetailsOpen(detailsPanel.hidden);
  });
  [dateInput, endDateInput].forEach((input) => {
    input.addEventListener('input', () => {
      updateDateDisplay(input);
      setFieldInvalid(input, false);
    });
    input.addEventListener('change', () => {
      updateDateDisplay(input);
      setFieldInvalid(input, false);
    });
    input.closest('.investment-date-control')?.addEventListener('click', () => {
      openDatePicker(input);
    });
  });
  [amountInput, symbolInput].forEach((input) => {
    input.addEventListener('input', () => setFieldInvalid(input, false));
  });
  form.addEventListener('submit', handleSubmit);
})();
