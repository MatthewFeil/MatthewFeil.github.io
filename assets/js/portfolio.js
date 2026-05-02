(() => {
  const PASSWORD_KEY = 'stockPortfolioPassword';
  const app = document.querySelector('.portfolio-app');
  const apiUrl = app.dataset.apiUrl;
  const state = {
    password: sessionStorage.getItem(PASSWORD_KEY) || '',
    stocks: [],
    logs: [],
    quotes: {}
  };

  const els = {
    lock: document.getElementById('portfolio-lock'),
    workspace: document.getElementById('portfolio-workspace'),
    unlockForm: document.getElementById('portfolio-unlock-form'),
    password: document.getElementById('portfolio-password'),
    lockButton: document.getElementById('portfolio-lock-button'),
    stockForm: document.getElementById('stock-form'),
    logForm: document.getElementById('log-form'),
    logStock: document.getElementById('log-stock'),
    logDate: document.getElementById('log-date'),
    rows: document.getElementById('portfolio-rows'),
    logs: document.getElementById('portfolio-logs'),
    status: document.getElementById('portfolio-status'),
    summaryValue: document.getElementById('summary-value'),
    summaryCost: document.getElementById('summary-cost'),
    summaryGain: document.getElementById('summary-gain'),
    summaryPercent: document.getElementById('summary-percent')
  };

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle('portfolio-negative', isError);
  }

  async function api(action, payload = {}) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-portfolio-password': state.password
      },
      body: JSON.stringify({ action, ...payload })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'The portfolio request failed.');
    }
    return data;
  }

  function sharesForLog(log) {
    return Number(log.total_purchase_amount) / Number(log.purchase_price);
  }

  function metricsForStock(stock) {
    const stockLogs = state.logs.filter((log) => log.stock_id === stock.id);
    const costBasis = stockLogs.reduce((sum, log) => {
      if (log.entry_type === 'reinvested_dividend') return sum;
      return sum + Number(log.total_purchase_amount);
    }, 0);
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

  function renderSummary(allMetrics) {
    const totals = allMetrics.reduce((acc, item) => {
      acc.cost += item.costBasis;
      acc.value += item.totalValue;
      return acc;
    }, { cost: 0, value: 0 });
    const gain = totals.value - totals.cost;
    const percent = totals.cost > 0 ? (gain / totals.cost) * 100 : 0;

    els.summaryValue.textContent = money.format(totals.value);
    els.summaryCost.textContent = money.format(totals.cost);
    els.summaryGain.textContent = money.format(gain);
    els.summaryPercent.textContent = `${percent.toFixed(2)}%`;
    els.summaryGain.className = gainClass(gain);
    els.summaryPercent.className = gainClass(percent);
  }

  function renderStockOptions() {
    els.logStock.innerHTML = state.stocks
      .map((stock) => `<option value="${stock.id}">${stock.symbol}</option>`)
      .join('');
  }

  function renderTable() {
    const allMetrics = state.stocks.map((stock) => ({ stock, ...metricsForStock(stock) }));
    renderSummary(allMetrics);

    if (state.stocks.length === 0) {
      els.rows.innerHTML = '<tr><td colspan="9">No stocks yet.</td></tr>';
      return;
    }

    els.rows.innerHTML = allMetrics.map((item) => `
      <tr>
        <td>
          <span class="portfolio-symbol">${item.stock.symbol}</span>
          <span class="portfolio-name">${item.stock.name || 'No name saved'}</span>
        </td>
        <td>${number.format(item.shares)}</td>
        <td>${money.format(item.avgPrice)}</td>
        <td>${item.currentPrice ? money.format(item.currentPrice) : 'Unavailable'}</td>
        <td>${money.format(item.costBasis)}</td>
        <td>${money.format(item.totalValue)}</td>
        <td class="${gainClass(item.gain)}">${money.format(item.gain)}</td>
        <td class="${gainClass(item.gainPercent)}">${item.gainPercent.toFixed(2)}%</td>
        <td><button class="portfolio-action" type="button" data-delete-stock="${item.stock.id}">Delete</button></td>
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
            <strong>${stock?.symbol || 'Deleted stock'} - ${type}</strong>
            <button class="portfolio-action" type="button" data-delete-log="${log.id}">Delete</button>
          </div>
          <p>${log.logged_at}: ${money.format(Number(log.total_purchase_amount))} at ${money.format(Number(log.purchase_price))} per share, ${number.format(shares)} shares.</p>
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

  async function unlock(password) {
    state.password = password;
    await loadPortfolio();
    sessionStorage.setItem(PASSWORD_KEY, password);
    els.lock.hidden = true;
    els.workspace.hidden = false;
  }

  els.logDate.valueAsDate = new Date();

  els.unlockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await unlock(els.password.value);
    } catch (error) {
      setStatus(error.message, true);
      alert(error.message);
    }
  });

  els.lockButton.addEventListener('click', () => {
    sessionStorage.removeItem(PASSWORD_KEY);
    state.password = '';
    els.password.value = '';
    els.lock.hidden = false;
    els.workspace.hidden = true;
  });

  els.stockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(els.stockForm);
    const symbol = String(form.get('symbol')).trim().toUpperCase();
    const name = String(form.get('name')).trim();
    try {
      await api('addStock', { symbol, name });
      els.stockForm.reset();
      await loadPortfolio();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  els.logForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(els.logForm);
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
      await loadPortfolio();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  document.addEventListener('click', async (event) => {
    const stockId = event.target.dataset?.deleteStock;
    const logId = event.target.dataset?.deleteLog;
    try {
      if (stockId && confirm('Delete this stock and all of its logs?')) {
        await api('deleteStock', { id: stockId });
        await loadPortfolio();
      }
      if (logId && confirm('Delete this log?')) {
        await api('deleteLog', { id: logId });
        await loadPortfolio();
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  if (state.password) {
    unlock(state.password).catch(() => {
      sessionStorage.removeItem(PASSWORD_KEY);
      state.password = '';
    });
  }
})();
