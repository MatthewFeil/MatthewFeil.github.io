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
    const [year, month, day] = value.split('-').map(Number);

    if (!year || !month || !day) {
      return null;
    }

    return new Date(Date.UTC(year, month - 1, day));
  }

  function formatDate(date) {
    return dateFormatter.format(date);
  }

  function setStatus(message, tone) {
    status.textContent = message;
    status.dataset.tone = tone || '';
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.classList.toggle('is-loading', isLoading);
    submitButton.setAttribute('aria-busy', String(isLoading));
    submitButton.textContent = isLoading ? 'Calculating...' : 'Calculate';
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

    output.title.textContent = prices.name === symbol ? symbol : `${symbol} · ${prices.name}`;
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
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const amount = Number(amountInput.value);
    const startDate = parseInputDate(dateInput.value);
    const endDate = parseInputDate(endDateInput.value);
    const today = new Date();
    const symbol = normalizeSymbol(symbolInput.value);

    if (!Number.isFinite(amount) || amount <= 0 || !startDate || !endDate || !symbol) {
      setStatus('Enter an amount, dates, and ticker.', 'error');
      return;
    }

    if (startDate > today || endDate > today) {
      setStatus('Choose dates that have already happened.', 'error');
      return;
    }

    if (endDate < startDate) {
      setStatus('Choose an end date after the start date.', 'error');
      return;
    }

    symbolInput.value = symbol;
    setStatus('Calculating...', 'loading');
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

      setStatus(prices.inflation ? '' : 'Inflation unavailable.');
    } catch (error) {
      results.hidden = true;
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
  }

  initDefaults();
  setDetailsOpen(false);
  detailsToggle.addEventListener('click', () => {
    setDetailsOpen(detailsPanel.hidden);
  });
  form.addEventListener('submit', handleSubmit);
})();
