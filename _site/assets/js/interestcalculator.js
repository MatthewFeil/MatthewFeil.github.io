(() => {
  const app = document.querySelector('[data-interest-calculator]');

  if (!app) {
    return;
  }

  const form = document.getElementById('interest-form');
  const apiUrl = app.dataset.apiUrl;
  const principalInput = document.getElementById('interest-principal');
  const dateInput = document.getElementById('interest-date');
  const endDateInput = document.getElementById('interest-end-date');
  const rateInput = document.getElementById('interest-rate');
  const methodInput = document.getElementById('interest-method');
  const submitButton = document.getElementById('interest-submit');
  const detailsToggle = document.getElementById('interest-details-toggle');
  const detailsPanel = document.getElementById('interest-details');
  const status = document.getElementById('interest-status');
  const results = document.getElementById('interest-results');

  const output = {
    title: document.getElementById('interest-result-title'),
    range: document.getElementById('interest-result-range'),
    currentValue: document.getElementById('interest-current-value'),
    totalGain: document.getElementById('interest-total-gain'),
    gainPercent: document.getElementById('interest-gain-percent'),
    inflationPercent: document.getElementById('interest-inflation-percent'),
    realValue: document.getElementById('interest-real-value'),
    realGain: document.getElementById('interest-real-gain'),
    realPercent: document.getElementById('interest-real-percent'),
    principal: document.getElementById('interest-detail-principal'),
    startDate: document.getElementById('interest-detail-start-date'),
    endDate: document.getElementById('interest-detail-end-date'),
    years: document.getElementById('interest-detail-years'),
    rate: document.getElementById('interest-detail-rate'),
    method: document.getElementById('interest-detail-method'),
    inflatedAmount: document.getElementById('interest-detail-inflated-amount'),
    inflationSource: document.getElementById('interest-detail-inflation-source')
  };

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });

  const percentFormatter = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const yearFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
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
        throw new Error('Inflation data timed out. Try again in a moment.');
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function fetchInflation(startDate, endDate) {
    if (!apiUrl) {
      return null;
    }

    const response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'inflationData',
        start_date: toInputDate(startDate),
        end_date: toInputDate(endDate)
      })
    });
    const data = await response.json();

    if (!data || !Number.isFinite(Number(data.factor))) {
      return null;
    }

    return {
      factor: Number(data.factor),
      start: data.start,
      latest: data.latest,
      source: data.source || 'World Bank CPI'
    };
  }

  function calculateValue(principal, annualRate, years, method) {
    if (method === 'simple') {
      return principal * (1 + annualRate * years);
    }

    return principal * ((1 + annualRate) ** years);
  }

  function renderResults({ principal, startDate, endDate, annualRate, years, method, currentValue, inflation }) {
    const totalGain = currentValue - principal;
    const gainPercent = currentValue / principal - 1;
    const inflationFactor = inflation?.factor || null;
    const inflationPercent = inflationFactor ? inflationFactor - 1 : null;
    const realValue = inflationFactor ? currentValue / inflationFactor : null;
    const realGain = realValue === null ? null : realValue - principal;
    const realPercent = realValue === null ? null : realValue / principal - 1;
    const inflatedAmount = inflationFactor ? principal * inflationFactor : null;
    const methodLabel = method === 'simple' ? 'Simple' : 'Compound';

    output.title.textContent = methodLabel;
    output.range.textContent = `${formatDate(startDate)} to ${formatDate(endDate)}`;
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

    output.principal.textContent = currencyFormatter.format(principal);
    output.startDate.textContent = formatDate(startDate);
    output.endDate.textContent = formatDate(endDate);
    output.years.textContent = yearFormatter.format(years);
    output.rate.textContent = percentFormatter.format(annualRate);
    output.method.textContent = methodLabel;
    output.inflatedAmount.textContent = inflatedAmount === null ? '--' : currencyFormatter.format(inflatedAmount);
    output.inflationSource.textContent = inflation?.source || 'Unavailable';

    results.hidden = false;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const principal = Number(principalInput.value);
    const startDate = parseInputDate(dateInput.value);
    const endDate = parseInputDate(endDateInput.value);
    const annualRate = Number(rateInput.value) / 100;
    const method = methodInput.value;
    const today = new Date();

    if (!Number.isFinite(principal) || principal <= 0 || !startDate || !endDate || !Number.isFinite(annualRate)) {
      setStatus('Enter an amount, dates, and interest rate.', 'error');
      return;
    }

    if (startDate > today || endDate > today) {
      setStatus('Choose dates that have already happened.', 'error');
      return;
    }

    if (endDate < startDate) {
      setStatus('Choose an end date after the investment date.', 'error');
      return;
    }

    setStatus('Calculating...', 'loading');
    setLoading(true);

    try {
      const elapsedMs = endDate.getTime() - startDate.getTime();
      const years = elapsedMs / (365.2425 * 24 * 60 * 60 * 1000);
      const currentValue = calculateValue(principal, annualRate, years, method);

      if (!Number.isFinite(currentValue)) {
        throw new Error('That interest calculation is not available.');
      }

      const inflation = await fetchInflation(startDate, endDate).catch(() => null);

      renderResults({
        principal,
        startDate,
        endDate,
        annualRate,
        years,
        method,
        currentValue,
        inflation
      });

      setStatus(inflation ? '' : 'Inflation unavailable.');
    } catch (error) {
      results.hidden = true;
      setStatus(error instanceof Error ? error.message : 'Interest calculation failed.', 'error');
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
