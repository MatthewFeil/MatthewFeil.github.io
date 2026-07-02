(() => {
  const TOKEN_KEY = 'personalSpaceToken';
  const TOKEN_EXPIRY_KEY = 'personalSpaceTokenExpiresAt';
  const app = document.querySelector('.portfolio-app');
  const apiUrl = app.dataset.apiUrl;
  const personalUrl = app.dataset.personalUrl || '/personal/';
  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || '',
    stocks: [],
    logs: [],
    quotes: {},
    performancePeriod: 'all'
  };

  const periods = {
    all: {
      label: 'All time',
      gainLabel: 'Total gain/loss',
      percentLabel: 'Total gain/loss %',
      tableGainLabel: 'Gain/loss',
      tablePercentLabel: 'Gain/loss %'
    },
    year: {
      label: 'Last year',
      gainLabel: 'Last year gain/loss',
      percentLabel: 'Last year gain/loss %',
      tableGainLabel: 'Last year gain/loss',
      tablePercentLabel: 'Last year %',
      startDate: () => shiftedDate({ years: -1 })
    },
    quarter: {
      label: 'Last quarter',
      gainLabel: 'Last quarter gain/loss',
      percentLabel: 'Last quarter gain/loss %',
      tableGainLabel: 'Last quarter gain/loss',
      tablePercentLabel: 'Last quarter %',
      startDate: () => shiftedDate({ months: -3 })
    },
    month: {
      label: 'Last month',
      gainLabel: 'Last month gain/loss',
      percentLabel: 'Last month gain/loss %',
      tableGainLabel: 'Last month gain/loss',
      tablePercentLabel: 'Last month %',
      startDate: () => shiftedDate({ months: -1 })
    },
    week: {
      label: 'Last week',
      gainLabel: 'Last week gain/loss',
      percentLabel: 'Last week gain/loss %',
      tableGainLabel: 'Last week gain/loss',
      tablePercentLabel: 'Last week %',
      startDate: () => shiftedDate({ days: -7 })
    },
    day: {
      label: 'Last day',
      gainLabel: 'Last day gain/loss',
      percentLabel: 'Last day gain/loss %',
      tableGainLabel: 'Last day gain/loss',
      tablePercentLabel: 'Last day %',
      startDate: () => shiftedDate({ days: -1 })
    }
  };

  const els = {
    workspace: document.getElementById('portfolio-workspace'),
    lockButton: document.getElementById('portfolio-lock-button'),
    openStockDialog: document.getElementById('open-stock-dialog'),
    openLogDialog: document.getElementById('open-log-dialog'),
    stockDialog: document.getElementById('stock-dialog'),
    logDialog: document.getElementById('log-dialog'),
    stockForm: document.getElementById('stock-form'),
    logForm: document.getElementById('log-form'),
    logStock: document.getElementById('log-stock'),
    logDate: document.getElementById('log-date'),
    rows: document.getElementById('portfolio-rows'),
    logs: document.getElementById('portfolio-logs'),
    status: document.getElementById('portfolio-status'),
    performancePeriod: document.getElementById('performance-period'),
    summaryValue: document.getElementById('summary-value'),
    summaryCost: document.getElementById('summary-cost'),
    summaryGainLabel: document.getElementById('summary-gain-label'),
    summaryPercentLabel: document.getElementById('summary-percent-label'),
    summaryGain: document.getElementById('summary-gain'),
    summaryPercent: document.getElementById('summary-percent'),
    tableGainHeading: document.getElementById('table-gain-heading'),
    tablePercentHeading: document.getElementById('table-percent-heading')
  };

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle('portfolio-negative', isError);
    els.status.classList.toggle('is-loading', !isError && message.endsWith('...'));
    els.status.setAttribute('aria-busy', String(!isError && message.endsWith('...')));
  }

  function setButtonLoading(button, isLoading, loadingText = 'Working...') {
    if (!button) return;
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent;
    }
    button.disabled = isLoading;
    button.classList.toggle('is-loading', isLoading);
    button.setAttribute('aria-busy', String(isLoading));
    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function sessionIsFresh() {
    const expiresAt = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY));
    return Boolean(state.token && Number.isFinite(expiresAt) && expiresAt > Date.now());
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    state.token = '';
  }

  function redirectToPersonal() {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `${personalUrl}?next=${next}`;
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      return;
    }
    dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      if (!dialog.open) return;
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
  }

  async function api(action, payload = {}) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-personal-token': state.token
      },
      body: JSON.stringify({ action, ...payload })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'The portfolio request failed.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function sharesForLog(log) {
    return Number(log.total_purchase_amount) / Number(log.purchase_price);
  }

  function shiftedDate({ years = 0, months = 0, days = 0 }) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    if (years) date.setFullYear(date.getFullYear() + years);
    if (months) date.setMonth(date.getMonth() + months);
    if (days) date.setDate(date.getDate() + days);
    return date;
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function logIsBefore(log, key) {
    return String(log.logged_at) < key;
  }

  function logIsOnOrAfter(log, key) {
    return String(log.logged_at) >= key;
  }

  function historicalCloseAtOrBefore(symbol, key) {
    const history = state.quotes[symbol]?.history || [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].date <= key && Number.isFinite(Number(history[index].close))) {
        return Number(history[index].close);
      }
    }
    return null;
  }

  function costBasisForLogs(logs) {
    return logs.reduce((sum, log) => {
      if (log.entry_type === 'reinvested_dividend') return sum;
      return sum + Number(log.total_purchase_amount);
    }, 0);
  }

  function startingPriceForPeriod(item, startKey, startingShares) {
    const historicalClose = historicalCloseAtOrBefore(item.stock.symbol, startKey);
    if (historicalClose !== null) return historicalClose;
    if (startingShares <= 0) return 0;

    const earlierLogs = item.stockLogs.filter((log) => logIsBefore(log, startKey));
    const earlierCostBasis = costBasisForLogs(earlierLogs);
    return earlierCostBasis > 0 ? earlierCostBasis / startingShares : item.avgPrice;
  }

  function metricsForStock(stock) {
    const stockLogs = state.logs.filter((log) => log.stock_id === stock.id);
    const costBasis = costBasisForLogs(stockLogs);
    const shares = stockLogs.reduce((sum, log) => sum + sharesForLog(log), 0);
    const avgPrice = shares > 0 ? costBasis / shares : 0;
    const currentPrice = Number(state.quotes[stock.symbol]?.price || 0);
    const totalValue = shares * currentPrice;
    const gain = totalValue - costBasis;
    const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    return { stockLogs, costBasis, shares, avgPrice, currentPrice, totalValue, gain, gainPercent };
  }

  function gainClass(value) {
    if (value > 0) return 'portfolio-positive';
    if (value < 0) return 'portfolio-negative';
    return '';
  }

  function performanceForStock(item) {
    const period = periods[state.performancePeriod] || periods.all;
    if (state.performancePeriod === 'all') {
      return {
        gain: item.gain,
        gainPercent: item.gainPercent,
        basis: item.costBasis,
        available: true
      };
    }

    const startKey = dateKey(period.startDate());
    const startingShares = item.stockLogs
      .filter((log) => logIsBefore(log, startKey))
      .reduce((sum, log) => sum + sharesForLog(log), 0);
    const newExternalInvestment = item.stockLogs
      .filter((log) => logIsOnOrAfter(log, startKey) && log.entry_type !== 'reinvested_dividend')
      .reduce((sum, log) => sum + Number(log.total_purchase_amount), 0);
    const startPrice = startingPriceForPeriod(item, startKey, startingShares);

    const startingValue = startingShares * startPrice;
    const basis = startingValue + newExternalInvestment;
    const gain = item.totalValue - startingValue - newExternalInvestment;
    const gainPercent = basis > 0 ? (gain / basis) * 100 : 0;

    return {
      gain,
      gainPercent,
      basis,
      available: true
    };
  }

  function formatPerformanceAmount(item) {
    if (!item.performance.available) return 'Unavailable';
    return money.format(item.performance.gain);
  }

  function formatPerformancePercent(item) {
    if (!item.performance.available) return 'Unavailable';
    return `${item.performance.gainPercent.toFixed(2)}%`;
  }

  function renderPeriodLabels() {
    const period = periods[state.performancePeriod] || periods.all;
    els.summaryGainLabel.textContent = period.gainLabel;
    els.summaryPercentLabel.textContent = period.percentLabel;
    els.tableGainHeading.textContent = period.tableGainLabel;
    els.tablePercentHeading.textContent = period.tablePercentLabel;
  }

  function renderSummary(allMetrics) {
    const totals = allMetrics.reduce((acc, item) => {
      acc.cost += item.costBasis;
      acc.value += item.totalValue;
      if (item.performance.available) {
        acc.performanceGain += item.performance.gain;
        acc.performanceBasis += item.performance.basis;
      } else {
        acc.performanceAvailable = false;
      }
      return acc;
    }, { cost: 0, value: 0, performanceGain: 0, performanceBasis: 0, performanceAvailable: true });
    const percent = totals.performanceBasis > 0 ? (totals.performanceGain / totals.performanceBasis) * 100 : 0;

    els.summaryValue.textContent = money.format(totals.value);
    els.summaryCost.textContent = money.format(totals.cost);
    els.summaryGain.textContent = totals.performanceAvailable ? money.format(totals.performanceGain) : 'Unavailable';
    els.summaryPercent.textContent = totals.performanceAvailable ? `${percent.toFixed(2)}%` : 'Unavailable';
    els.summaryGain.className = totals.performanceAvailable ? gainClass(totals.performanceGain) : '';
    els.summaryPercent.className = totals.performanceAvailable ? gainClass(percent) : '';
  }

  function renderStockOptions() {
    els.logStock.innerHTML = state.stocks
      .map((stock) => `<option value="${escapeHtml(stock.id)}">${escapeHtml(stock.symbol)}</option>`)
      .join('');
  }

  function renderTable() {
    const allMetrics = state.stocks
      .map((stock) => ({ stock, ...metricsForStock(stock) }))
      .map((item) => ({ ...item, performance: performanceForStock(item) }));
    renderPeriodLabels();
    renderSummary(allMetrics);

    if (state.stocks.length === 0) {
      els.rows.innerHTML = '<tr><td colspan="9">No stocks yet.</td></tr>';
      return;
    }

    els.rows.innerHTML = allMetrics.map((item) => `
      <tr>
        <td>
          <span class="portfolio-symbol">${escapeHtml(item.stock.symbol)}</span>
          <span class="portfolio-name">${escapeHtml(item.stock.name || 'No name saved')}</span>
        </td>
        <td>${number.format(item.shares)}</td>
        <td>${money.format(item.avgPrice)}</td>
        <td>${item.currentPrice ? money.format(item.currentPrice) : 'Unavailable'}</td>
        <td>${money.format(item.costBasis)}</td>
        <td>${money.format(item.totalValue)}</td>
        <td class="${item.performance.available ? gainClass(item.performance.gain) : ''}">${formatPerformanceAmount(item)}</td>
        <td class="${item.performance.available ? gainClass(item.performance.gainPercent) : ''}">${formatPerformancePercent(item)}</td>
        <td><button class="portfolio-action" type="button" data-delete-stock="${escapeHtml(item.stock.id)}">Delete</button></td>
      </tr>
    `).join('');
  }

  function renderLogs() {
    const byStock = new Map(state.stocks.map((stock) => [stock.id, stock]));
    if (state.logs.length === 0) {
      els.logs.innerHTML = '<p class="portfolio-status">No logs yet.</p>';
      return;
    }

    els.logs.innerHTML = state.logs.map((log) => {
      const stock = byStock.get(log.stock_id);
      const shares = sharesForLog(log);
      const type = log.entry_type === 'reinvested_dividend' ? 'Reinvested dividend' : 'Additional investment';
      return `
        <article class="portfolio-log">
          <div class="portfolio-log-head">
            <strong>${escapeHtml(stock?.symbol || 'Deleted stock')} - ${type}</strong>
            <button class="portfolio-action" type="button" data-delete-log="${escapeHtml(log.id)}">Delete</button>
          </div>
          <p>${escapeHtml(log.logged_at)}: ${money.format(Number(log.total_purchase_amount))} at ${money.format(Number(log.purchase_price))} per share, ${number.format(shares)} shares.</p>
        </article>
      `;
    }).join('');
  }

  function render() {
    renderStockOptions();
    renderTable();
    renderLogs();
  }

  async function loadPortfolio() {
    setStatus('Loading portfolio...');
    const data = await api('list');
    state.stocks = data.stocks || [];
    state.logs = data.logs || [];
    state.quotes = data.quotes || {};
    render();
    setStatus(`Updated ${new Date().toLocaleTimeString()}.`);
  }

  els.logDate.valueAsDate = new Date();
  els.performancePeriod.value = state.performancePeriod;

  els.performancePeriod.addEventListener('change', () => {
    state.performancePeriod = periods[els.performancePeriod.value] ? els.performancePeriod.value : 'all';
    renderTable();
  });

  els.lockButton.addEventListener('click', () => {
    clearSession();
    closeDialog(els.stockDialog);
    closeDialog(els.logDialog);
    els.workspace.hidden = true;
    redirectToPersonal();
  });

  els.openStockDialog.addEventListener('click', () => {
    openDialog(els.stockDialog);
    document.getElementById('stock-symbol').focus();
  });

  els.openLogDialog.addEventListener('click', () => {
    if (state.stocks.length === 0) {
      setStatus('Add a stock before adding a log.', true);
      openDialog(els.stockDialog);
      document.getElementById('stock-symbol').focus();
      return;
    }
    openDialog(els.logDialog);
    els.logStock.focus();
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      closeDialog(button.closest('dialog'));
    });
  });

  [els.stockDialog, els.logDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });
  });

  els.stockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(els.stockForm);
    const submitButton = els.stockForm.querySelector('button[type="submit"]');
    const symbol = String(form.get('symbol')).trim().toUpperCase();
    const name = String(form.get('name')).trim();
    setButtonLoading(submitButton, true, 'Adding...');
    setStatus('Adding stock...');
    try {
      await api('addStock', { symbol, name });
      els.stockForm.reset();
      closeDialog(els.stockDialog);
      await loadPortfolio();
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  els.logForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(els.logForm);
    const submitButton = els.logForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Adding...');
    setStatus('Adding log...');
    try {
      await api('addLog', {
        stock_id: form.get('stock_id'),
        logged_at: form.get('logged_at'),
        entry_type: form.get('entry_type'),
        purchase_price: Number(form.get('purchase_price')),
        total_purchase_amount: Number(form.get('total_purchase_amount'))
      });
      els.logForm.reset();
      els.logDate.valueAsDate = new Date();
      closeDialog(els.logDialog);
      await loadPortfolio();
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  document.addEventListener('click', async (event) => {
    const stockButton = event.target.closest('[data-delete-stock]');
    const logButton = event.target.closest('[data-delete-log]');
    const stockId = stockButton?.dataset.deleteStock;
    const logId = logButton?.dataset.deleteLog;
    try {
      if (stockId && confirm('Delete this stock and all of its logs?')) {
        setButtonLoading(stockButton, true, 'Deleting...');
        setStatus('Deleting stock...');
        await api('deleteStock', { id: stockId });
        await loadPortfolio();
      }
      if (logId && confirm('Delete this log?')) {
        setButtonLoading(logButton, true, 'Deleting...');
        setStatus('Deleting log...');
        await api('deleteLog', { id: logId });
        await loadPortfolio();
      }
    } catch (error) {
      setStatus(error.message, true);
      setButtonLoading(stockButton, false);
      setButtonLoading(logButton, false);
    }
  });

  async function boot() {
    if (!sessionIsFresh()) {
      clearSession();
      redirectToPersonal();
      return;
    }

    els.workspace.hidden = false;

    try {
      await loadPortfolio();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        clearSession();
        redirectToPersonal();
        return;
      }
      setStatus(error instanceof Error ? error.message : 'The portfolio request failed.', true);
    }
  }

  boot();
})();
