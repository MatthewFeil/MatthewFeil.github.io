(() => {
  const app = document.querySelector('.portfolio-app');
  const apiUrl = app.dataset.apiUrl;
  const personalUrl = app.dataset.personalUrl || '/personal/';
  const state = {
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
    tablePercentHeading: document.getElementById('table-percent-heading'),
    graph: document.getElementById('portfolio-graph')
  };

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
  const logDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const graphDate = new Intl.DateTimeFormat('en-US', { month: '2-digit', year: '2-digit', timeZone: 'UTC' });
  const graphReadoutDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const REQUEST_TIMEOUT_MS = 20000;
  let portfolioGraph = null;

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
    button.classList.toggle('is-loading', isLoading);
    button.setAttribute('aria-busy', String(isLoading));
    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
    button.disabled = isLoading || (button.form ? !formIsComplete(button.form) : false);
  }

  function formIsComplete(form) {
    const requiredTextFields = form.querySelectorAll('input[required][type="text"], input[required][type="search"], textarea[required]');
    return form.checkValidity() && [...requiredTextFields].every((field) => field.value.trim());
  }

  function syncSubmitButton(form) {
    const button = form.querySelector('button[type="submit"]');
    if (!button || button.classList.contains('is-loading')) return;
    button.disabled = !formIsComplete(form);
  }

  function watchFormCompletion(form) {
    form.addEventListener('input', () => syncSubmitButton(form));
    form.addEventListener('change', () => syncSubmitButton(form));
    form.addEventListener('reset', () => setTimeout(() => syncSubmitButton(form), 0));
    syncSubmitButton(form);
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

  async function hasSession() {
    return Boolean(await window.PersonalAuth.session());
  }

  function redirectToPersonal() {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `${personalUrl}?next=${next}`;
  }

  function lockMotionDelay() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await window.PersonalAuth.authorizedFetch(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('The request timed out. Check your connection and try again.');
      if (error instanceof TypeError) throw new Error('Unable to reach the portfolio service. Check your connection and try again.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }

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

  function logsThrough(key, stockId = null) {
    return state.logs.filter((log) => (
      (!stockId || log.stock_id === stockId) && String(log.logged_at) <= key
    ));
  }

  function portfolioMetricsAt(key) {
    const stocks = state.stocks.map((stock) => {
      const stockLogs = logsThrough(key, stock.id);
      const shares = stockLogs.reduce((sum, log) => sum + sharesForLog(log), 0);
      const costBasis = costBasisForLogs(stockLogs);
      const price = historicalCloseAtOrBefore(stock.symbol, key);
      const avgPurchase = shares > 0 ? stockLogs.reduce((sum, log) => sum + Number(log.total_purchase_amount), 0) / shares : 0;
      const value = price === null ? null : shares * price;
      return {
        stock,
        shares,
        price,
        avgPurchase,
        costBasis,
        value,
        gain: value === null ? null : value - costBasis
      };
    }).filter((item) => item.shares > 0);

    const available = stocks.length > 0 && stocks.every((item) => item.value !== null);
    const value = available ? stocks.reduce((sum, item) => sum + item.value, 0) : null;
    const costBasis = stocks.reduce((sum, item) => sum + item.costBasis, 0);
    return { key, stocks, value, costBasis, gain: value === null ? null : value - costBasis };
  }

  function graphDates() {
    const firstLog = state.logs.reduce((first, log) => (
      !first || String(log.logged_at) < first ? String(log.logged_at) : first
    ), null);
    if (!firstLog) return [];
    return [...new Set(state.stocks.flatMap((stock) => (
      (state.quotes[stock.symbol]?.history || []).map((point) => point.date)
    )))].filter((key) => key >= firstLog).sort();
  }

  function graphStartDate() {
    const period = periods[state.performancePeriod] || periods.all;
    return period.startDate ? dateKey(period.startDate()) : null;
  }

  function graphData() {
    const startDate = graphStartDate();
    const data = graphDates().filter((key) => !startDate || key >= startDate).map((key) => {
      const metrics = portfolioMetricsAt(key);
      return {
        x: key,
        y: metrics.value,
        metrics,
        events: []
      };
    }).filter((point) => Number.isFinite(point.y));
    state.logs.forEach((log) => {
      const point = data.find((item) => item.x >= String(log.logged_at));
      if (point) point.events.push(log);
    });
    return data;
  }

  function eventPoints(data, entryType) {
    const start = data[0]?.x;
    return state.logs.filter((log) => log.entry_type === entryType && (!start || String(log.logged_at) >= start)).map((log) => {
      const date = data.find((point) => point.x >= String(log.logged_at));
      return date ? { ...date, event: log } : null;
    }).filter(Boolean);
  }

  function graphEventCopy(event) {
    return event.entry_type === 'reinvested_dividend' ? 'Reinvested dividend' : 'Additional investment';
  }

  function renderGraphDetail(point) {
    const readout = els.graph.querySelector('.site-graph-readout');
    if (!readout || !point?.metrics) return;
    const { metrics, events } = point;
    const detail = document.createElement('div');
    detail.className = 'portfolio-graph-detail';
    detail.innerHTML = `
      <div class="portfolio-graph-detail-summary">
        <p><span>Total value</span><strong>${money.format(metrics.value)}</strong></p>
        <p><span>Cost basis</span><strong>${money.format(metrics.costBasis)}</strong></p>
        <p><span>Total gain/loss</span><strong class="${gainClass(metrics.gain)}">${money.format(metrics.gain)}</strong></p>
      </div>
    `;

    if (events.length) {
      const section = document.createElement('section');
      section.className = 'portfolio-graph-detail-section';
      section.innerHTML = '<h4>Activity on this date</h4>';
      const list = document.createElement('ul');
      list.className = 'portfolio-graph-event-list';
      list.innerHTML = events.map((event) => {
        const stock = state.stocks.find((item) => item.id === event.stock_id);
        const investment = event.entry_type === 'additional_investment';
        return `<li><span class="portfolio-graph-event-type ${investment ? 'is-investment' : ''}">${graphEventCopy(event)}</span> <strong>${escapeHtml(stock?.symbol || 'Deleted stock')}</strong> — ${money.format(Number(event.total_purchase_amount))} at ${money.format(Number(event.purchase_price))} on ${graphReadoutDate.format(new Date(`${escapeHtml(event.logged_at)}T00:00:00Z`))}</li>`;
      }).join('');
      section.append(list);
      detail.append(section);
    }

    if (metrics.stocks.length) {
      const section = document.createElement('section');
      section.className = 'portfolio-graph-detail-section';
      section.innerHTML = '<h4>Holdings at this point</h4>';
      const list = document.createElement('ul');
      list.className = 'portfolio-graph-stock-list';
      list.innerHTML = metrics.stocks.map((item) => `<li><strong>${escapeHtml(item.stock.symbol)}</strong><span>Price ${money.format(item.price)}</span><span>Avg purchase ${money.format(item.avgPurchase)}</span><span class="${gainClass(item.gain)}">Gain/loss ${money.format(item.gain)}</span></li>`).join('');
      section.append(list);
      detail.append(section);
    }
    readout.append(detail);
  }

  function renderGraph() {
    if (!window.SiteGraph || !els.graph) return;
    const data = graphData();
    els.graph.setAttribute('aria-busy', 'false');
    const series = [{
      id: 'portfolio-value',
      label: 'Portfolio value',
      color: 'var(--site-text)',
      area: true,
      areaOpacity: 0.08,
      strokeWidth: 2.5,
      data,
      formatValue: (value) => money.format(value)
    }, {
      id: 'additional-investment',
      label: 'Additional investment',
      color: 'var(--site-accent)',
      line: false,
      points: 'all',
      pointSize: 4.5,
      className: 'portfolio-graph-investment',
      interactive: false,
      legendMarker: 'point',
      data: eventPoints(data, 'additional_investment'),
      formatValue: (value) => money.format(value)
    }, {
      id: 'reinvested-dividend',
      label: 'Reinvested dividend',
      color: 'var(--site-text)',
      line: false,
      points: 'all',
      pointSize: 4.5,
      className: 'portfolio-graph-dividend',
      interactive: false,
      legendMarker: 'point',
      legendFill: 'var(--site-text)',
      legendBorder: 'var(--site-text)',
      data: eventPoints(data, 'reinvested_dividend'),
      formatValue: (value) => money.format(value)
    }];
    const config = {
      title: 'Portfolio value',
      description: '',
      ariaLabel: 'Portfolio value over time. Use left and right arrow keys to inspect dates.',
      height: 340,
      className: 'portfolio-value-graph',
      margins: { top: 10, right: 18, bottom: 45, left: 80 },
      legend: { show: true, position: 'top' },
      interaction: { enabled: true, selectLast: true },
      xAxis: {
        type: 'time',
        ticks: 6,
        formatTick: (value) => graphDate.format(new Date(value)),
        formatValue: (value) => graphReadoutDate.format(new Date(value))
      },
      yAxis: {
        ticks: 5,
        formatTick: (value) => money.format(value),
        formatValue: (value) => money.format(value)
      },
      emptyMessage: state.logs.length ? 'Historic prices are unavailable for this portfolio.' : 'Add an investment log to see your portfolio value over time.',
      series
    };
    if (portfolioGraph) portfolioGraph.update(config);
    else {
      portfolioGraph = new window.SiteGraph(els.graph, config);
      els.graph.addEventListener('sitegraphchange', (event) => {
        const graphPoint = event.detail.points.find((item) => item.series === 'portfolio-value')?.point;
        renderGraphDetail(graphPoint);
      });
      renderGraphDetail(data[data.length - 1]);
    }
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
    syncSubmitButton(els.logForm);
  }

  function renderTable() {
    const allMetrics = state.stocks
      .map((stock) => ({ stock, ...metricsForStock(stock) }))
      .map((item) => ({ ...item, performance: performanceForStock(item) }));
    renderPeriodLabels();
    renderSummary(allMetrics);

    if (state.stocks.length === 0) {
      els.rows.innerHTML = '<tr class="portfolio-empty-row"><td colspan="9">No stocks yet. Add a stock to begin tracking purchases and performance.</td></tr>';
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
          <p>${logDate.format(new Date(`${escapeHtml(log.logged_at)}T00:00:00Z`))}: ${money.format(Number(log.total_purchase_amount))} at ${money.format(Number(log.purchase_price))} per share, ${number.format(shares)} shares.</p>
        </article>
      `;
    }).join('');
  }

  function render() {
    renderStockOptions();
    renderTable();
    renderGraph();
    renderLogs();
  }

  async function loadPortfolio(successMessage = '') {
    setStatus('Loading portfolio...');
    const data = await api('list');
    state.stocks = data.stocks || [];
    state.logs = data.logs || [];
    state.quotes = data.quotes || {};
    render();
    setStatus(successMessage || `Updated ${new Date().toLocaleTimeString()}.`);
  }

  els.logDate.valueAsDate = new Date();
  els.logDate.max = dateKey(new Date());
  els.performancePeriod.value = state.performancePeriod;
  [els.stockForm, els.logForm].forEach(watchFormCompletion);

  els.performancePeriod.addEventListener('change', () => {
    state.performancePeriod = periods[els.performancePeriod.value] ? els.performancePeriod.value : 'all';
    renderTable();
    renderGraph();
    setStatus(`Showing ${periods[state.performancePeriod].label.toLowerCase()} performance.`);
  });

  els.lockButton.addEventListener('click', async () => {
    if (els.lockButton.disabled) return;
    els.lockButton.disabled = true;
    els.lockButton.classList.add('is-locking');
    els.lockButton.setAttribute('aria-busy', 'true');
    app.classList.add('is-locking');
    await Promise.all([
      window.PersonalAuth.signOut().catch(() => {}),
      new Promise((resolve) => window.setTimeout(resolve, lockMotionDelay()))
    ]);
    closeDialog(els.stockDialog);
    closeDialog(els.logDialog);
    els.workspace.hidden = true;
    redirectToPersonal();
  });

  els.openStockDialog.addEventListener('click', () => {
    syncSubmitButton(els.stockForm);
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
    syncSubmitButton(els.logForm);
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
    if (!formIsComplete(els.stockForm)) {
      syncSubmitButton(els.stockForm);
      return;
    }
    const form = new FormData(els.stockForm);
    const submitButton = els.stockForm.querySelector('button[type="submit"]');
    const symbol = String(form.get('symbol')).trim().toUpperCase();
    const name = String(form.get('name')).trim();
    setButtonLoading(submitButton, true, 'Adding...');
    setStatus('');
    try {
      await api('addStock', { symbol, name });
      els.stockForm.reset();
      closeDialog(els.stockDialog);
      await loadPortfolio('Stock added.');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  els.logForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!formIsComplete(els.logForm)) {
      syncSubmitButton(els.logForm);
      return;
    }
    const form = new FormData(els.logForm);
    const submitButton = els.logForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Adding...');
    setStatus('');
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
      await loadPortfolio('Investment log added.');
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
        setStatus('');
        await api('deleteStock', { id: stockId });
        await loadPortfolio('Stock and its logs deleted.');
      }
      if (logId && confirm('Delete this log?')) {
        setButtonLoading(logButton, true, 'Deleting...');
        setStatus('');
        await api('deleteLog', { id: logId });
        await loadPortfolio('Investment log deleted.');
      }
    } catch (error) {
      setStatus(error.message, true);
      setButtonLoading(stockButton, false);
      setButtonLoading(logButton, false);
    }
  });

  async function boot() {
    try {
      if (!await hasSession()) {
        redirectToPersonal();
        return;
      }

      els.workspace.hidden = false;
      await loadPortfolio();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        await window.PersonalAuth.signOut().catch(() => {});
        redirectToPersonal();
        return;
      }
      setStatus(error instanceof Error ? error.message : 'The portfolio request failed.', true);
    }
  }

  boot();
})();
