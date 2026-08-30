(() => {
  'use strict';

  /*
   * Shared native-SVG line graph.
   *
   * const graph = new SiteGraph('#graph', {
   *   title: 'Portfolio value',
   *   xAxis: { type: 'time', label: 'Date' },
   *   yAxis: { label: 'Value', formatValue: (value) => `$${value.toFixed(2)}` },
   *   series: [{
   *     id: 'value',
   *     label: 'Value',
   *     lineStyle: 'solid',
   *     curve: 'linear',
   *     points: 'labeled',
   *     data: [{ x: '2026-01-01', y: 1000, label: 'Started' }]
   *   }]
   * });
   *
   * Axis options support `type` (time or linear), label, ticks, domain,
   * grid, formatTick, and formatValue. The y axis also supports includeZero
   * and nice. Time-format callbacks receive millisecond timestamps.
   *
   * Series options support solid/dashed/dotted `lineStyle`, linear/
   * step-before/step-after `curve`, optional area fill, strokeWidth,
   * endLabel, and circle/square/diamond points shown as none/all/ends/labeled.
   * Data points use { x, y, label?, labelPosition?, labelDx?, labelDy? }.
   *
   * Public methods: update(config), setSeries(series), destroy().
   * The container emits `sitegraphchange` with the selected x value and points.
   */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_PALETTE = [
    'var(--site-accent)',
    'var(--site-text)',
    'var(--site-good)',
    'var(--site-warn)',
    '#5378a8',
    '#8c63a8'
  ];

  const defaults = {
    title: '',
    description: '',
    ariaLabel: 'Line chart',
    height: 300,
    emptyMessage: 'No graph data available.',
    className: '',
    margins: { top: 18, right: 18, bottom: 48, left: 64 },
    legend: { show: true, position: 'top' },
    interaction: { enabled: true, selectLast: true },
    xAxis: {
      type: 'time',
      label: '',
      ticks: 5,
      domain: null,
      grid: false,
      formatTick: null,
      formatValue: null
    },
    yAxis: {
      label: '',
      ticks: 5,
      domain: null,
      includeZero: false,
      nice: true,
      grid: true,
      formatTick: null,
      formatValue: null
    },
    series: []
  };

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        element.setAttribute(key, String(value));
      }
    });
    return element;
  }

  function htmlElement(name, className = '', text = '') {
    const element = document.createElement(name);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function mergeConfig(config = {}) {
    return {
      ...defaults,
      ...config,
      margins: { ...defaults.margins, ...(config.margins || {}) },
      legend: { ...defaults.legend, ...(config.legend || {}) },
      interaction: { ...defaults.interaction, ...(config.interaction || {}) },
      xAxis: { ...defaults.xAxis, ...(config.xAxis || {}) },
      yAxis: { ...defaults.yAxis, ...(config.yAxis || {}) },
      series: Array.isArray(config.series) ? config.series : []
    };
  }

  function normalizeClassNames(value) {
    return String(value || '')
      .split(/\s+/)
      .filter((name) => /^[a-zA-Z][\w-]*$/.test(name));
  }

  function parseX(value, type) {
    if (type === 'linear') return Number(value);
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    return Date.parse(String(value));
  }

  function normalizeSeries(series, xType, index) {
    const points = Array.isArray(series.data) ? series.data : [];
    const normalized = points.map((point, pointIndex) => {
      const source = Array.isArray(point) ? { x: point[0], y: point[1] } : (point || {});
      const x = parseX(source.x, xType);
      const y = source.y === null || source.y === '' ? null : Number(source.y);
      return {
        ...source,
        x,
        y,
        sourceX: source.x,
        sourceY: source.y,
        pointIndex,
        validX: Number.isFinite(x),
        validY: Number.isFinite(y)
      };
    }).filter((point) => point.validX)
      .sort((left, right) => left.x - right.x || left.pointIndex - right.pointIndex);

    return {
      id: String(series.id || `series-${index + 1}`),
      label: String(series.label || series.id || `Series ${index + 1}`),
      color: series.color || DEFAULT_PALETTE[index % DEFAULT_PALETTE.length],
      line: series.line === false ? false : true,
      lineStyle: ['solid', 'dashed', 'dotted'].includes(series.lineStyle) ? series.lineStyle : 'solid',
      curve: ['linear', 'step-before', 'step-after'].includes(series.curve) ? series.curve : 'linear',
      strokeWidth: Number.isFinite(Number(series.strokeWidth)) ? Number(series.strokeWidth) : 2.5,
      area: Boolean(series.area),
      areaOpacity: Number.isFinite(Number(series.areaOpacity)) ? Number(series.areaOpacity) : 0.1,
      points: ['none', 'all', 'ends', 'labeled'].includes(series.points) ? series.points : 'none',
      pointShape: ['circle', 'square', 'diamond'].includes(series.pointShape) ? series.pointShape : 'circle',
      pointSize: Number.isFinite(Number(series.pointSize)) ? Number(series.pointSize) : 3.5,
      endLabel: Boolean(series.endLabel),
      formatValue: typeof series.formatValue === 'function' ? series.formatValue : null,
      className: series.className || '',
      hidden: Boolean(series.hidden),
      data: normalized
    };
  }

  function extent(values, configuredDomain, includeZero = false, paddingRatio = 0.06) {
    if (Array.isArray(configuredDomain) && configuredDomain.length === 2) {
      const min = Number(configuredDomain[0]);
      const max = Number(configuredDomain[1]);
      if (Number.isFinite(min) && Number.isFinite(max) && min !== max) {
        return [Math.min(min, max), Math.max(min, max)];
      }
    }

    let min = Math.min(...values);
    let max = Math.max(...values);
    if (includeZero) {
      min = Math.min(0, min);
      max = Math.max(0, max);
    }
    if (min === max) {
      const change = Math.abs(min || 1) * 0.1;
      return [min - change, max + change];
    }
    const padding = (max - min) * paddingRatio;
    return [min - padding, max + padding];
  }

  function niceNumericScale(domain, count) {
    const roughStep = Math.abs(domain[1] - domain[0]) / Math.max(1, Number(count) - 1);
    const magnitude = 10 ** Math.floor(Math.log10(roughStep || 1));
    const residual = roughStep / magnitude;
    const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
    const step = factor * magnitude;
    const min = Math.floor(domain[0] / step) * step;
    const max = Math.ceil(domain[1] / step) * step;
    const values = [];
    for (let value = min; value <= max + step / 2; value += step) {
      values.push(Number(value.toPrecision(12)));
    }
    return { domain: [min, max], ticks: values };
  }

  function scale(domainMin, domainMax, rangeMin, rangeMax) {
    const domainSize = domainMax - domainMin || 1;
    return (value) => rangeMin + ((value - domainMin) / domainSize) * (rangeMax - rangeMin);
  }

  function ticks(domain, count) {
    const total = Math.max(2, Math.round(Number(count) || 5));
    return Array.from({ length: total }, (_, index) => (
      domain[0] + ((domain[1] - domain[0]) * index) / (total - 1)
    ));
  }

  function defaultDateFormat(value, domain, context) {
    if (context === 'value') {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(new Date(value));
    }
    const span = domain[1] - domain[0];
    const day = 24 * 60 * 60 * 1000;
    const options = span > day * 365 * 5
      ? { year: 'numeric', timeZone: 'UTC' }
      : span > day * 300
        ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
      : span > day * 60
        ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
        : { month: 'short', day: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat('en-US', options).format(new Date(value));
  }

  function defaultNumberFormat(value) {
    const absolute = Math.abs(value);
    return new Intl.NumberFormat('en-US', {
      notation: absolute >= 1000000 ? 'compact' : 'standard',
      maximumFractionDigits: absolute < 10 ? 2 : absolute < 1000 ? 1 : 0
    }).format(value);
  }

  function formatAxisValue(axis, value, domain, context) {
    const formatter = context === 'tick' ? axis.formatTick : axis.formatValue;
    if (typeof formatter === 'function') return String(formatter(value));
    if (axis.type === 'time') return defaultDateFormat(value, domain, context);
    return defaultNumberFormat(value);
  }

  function lineDash(style) {
    if (style === 'dashed') return '9 6';
    if (style === 'dotted') return '2 6';
    return null;
  }

  function buildLinePath(points, xScale, yScale, curve) {
    let path = '';
    let previous = null;
    points.forEach((point) => {
      if (!point.validY) {
        previous = null;
        return;
      }
      const x = xScale(point.x);
      const y = yScale(point.y);
      if (!previous) {
        path += `M${x},${y}`;
      } else if (curve === 'step-before') {
        path += `L${previous.x},${y}L${x},${y}`;
      } else if (curve === 'step-after') {
        path += `L${x},${previous.y}L${x},${y}`;
      } else {
        path += `L${x},${y}`;
      }
      previous = { x, y };
    });
    return path;
  }

  function contiguousSegments(points) {
    const segments = [];
    let segment = [];
    points.forEach((point) => {
      if (!point.validY) {
        if (segment.length) segments.push(segment);
        segment = [];
        return;
      }
      segment.push(point);
    });
    if (segment.length) segments.push(segment);
    return segments;
  }

  function buildAreaPath(points, xScale, yScale, baseline, curve) {
    return contiguousSegments(points).map((segment) => {
      const line = buildLinePath(segment, xScale, yScale, curve);
      const firstX = xScale(segment[0].x);
      const lastX = xScale(segment[segment.length - 1].x);
      return `${line}L${lastX},${baseline}L${firstX},${baseline}Z`;
    }).join('');
  }

  function pointShouldRender(series, point, validPoints) {
    if (series.points === 'all') return true;
    if (series.points === 'labeled') return Boolean(point.label || point.showLabel);
    if (series.points === 'ends') {
      return point === validPoints[0] || point === validPoints[validPoints.length - 1];
    }
    return false;
  }

  function drawPoint(parent, x, y, series, className = '') {
    const size = series.pointSize;
    let point;
    if (series.pointShape === 'square') {
      point = svgElement('rect', { x: x - size, y: y - size, width: size * 2, height: size * 2 });
    } else if (series.pointShape === 'diamond') {
      point = svgElement('path', { d: `M${x},${y - size - 0.5}L${x + size + 0.5},${y}L${x},${y + size + 0.5}L${x - size - 0.5},${y}Z` });
    } else {
      point = svgElement('circle', { cx: x, cy: y, r: size });
    }
    point.setAttribute('class', `site-graph-point ${className}`.trim());
    parent.append(point);
    return point;
  }

  function labelPlacement(point, x, y) {
    const position = point.labelPosition || 'above';
    const placements = {
      above: { x, y: y - 10, anchor: 'middle' },
      below: { x, y: y + 17, anchor: 'middle' },
      left: { x: x - 9, y: y + 4, anchor: 'end' },
      right: { x: x + 9, y: y + 4, anchor: 'start' }
    };
    const placement = placements[position] || placements.above;
    return {
      x: placement.x + (Number(point.labelDx) || 0),
      y: placement.y + (Number(point.labelDy) || 0),
      anchor: point.labelAnchor || placement.anchor
    };
  }

  class SiteGraph {
    constructor(container, config = {}) {
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!(this.container instanceof Element)) {
        throw new Error('SiteGraph requires a valid container element.');
      }
      this.config = mergeConfig(config);
      this.selectedX = null;
      this.resizeObserver = null;
      this.boundWindowResize = () => this.draw();
      this.build();
      this.observe();
      this.draw();
    }

    build() {
      this.container.replaceChildren();
      this.figure = htmlElement('figure', 'site-graph');
      normalizeClassNames(this.config.className).forEach((name) => this.figure.classList.add(name));

      this.header = htmlElement('figcaption', 'site-graph-header');
      this.headingGroup = htmlElement('div', 'site-graph-heading');
      this.title = htmlElement('h3', 'site-graph-title', this.config.title);
      this.description = htmlElement('p', 'site-graph-description', this.config.description);
      this.headingGroup.append(this.title, this.description);
      this.legend = htmlElement('ul', 'site-graph-legend');
      this.legend.setAttribute('aria-label', 'Graph key');
      this.header.append(this.headingGroup, this.legend);

      this.plot = htmlElement('div', 'site-graph-plot');
      this.svg = svgElement('svg', {
        class: 'site-graph-svg',
        role: 'img',
        'aria-label': this.config.ariaLabel,
        preserveAspectRatio: 'none'
      });
      this.plot.append(this.svg);
      this.empty = htmlElement('p', 'site-graph-empty', this.config.emptyMessage);
      this.empty.hidden = true;
      this.readout = htmlElement('div', 'site-graph-readout');
      this.readout.hidden = true;
      this.readout.setAttribute('aria-live', 'polite');
      this.readout.setAttribute('aria-atomic', 'true');

      this.figure.append(this.header, this.plot, this.empty, this.readout);
      this.container.append(this.figure);
      this.syncHeader();
    }

    syncHeader() {
      this.title.textContent = this.config.title;
      this.description.textContent = this.config.description;
      this.title.hidden = !this.config.title;
      this.description.hidden = !this.config.description;
      this.headingGroup.hidden = !this.config.title && !this.config.description;
      this.header.hidden = this.headingGroup.hidden && !this.config.legend.show;
      this.figure.dataset.legendPosition = this.config.legend.position;
      this.svg.setAttribute('aria-label', this.config.ariaLabel);
      this.empty.textContent = this.config.emptyMessage;
    }

    observe() {
      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => this.draw());
        this.resizeObserver.observe(this.container);
      } else {
        window.addEventListener('resize', this.boundWindowResize);
      }
    }

    update(config = {}) {
      this.config = mergeConfig({
        ...this.config,
        ...config,
        margins: { ...this.config.margins, ...(config.margins || {}) },
        legend: { ...this.config.legend, ...(config.legend || {}) },
        interaction: { ...this.config.interaction, ...(config.interaction || {}) },
        xAxis: { ...this.config.xAxis, ...(config.xAxis || {}) },
        yAxis: { ...this.config.yAxis, ...(config.yAxis || {}) }
      });
      this.selectedX = null;
      this.build();
      this.draw();
      return this;
    }

    setSeries(series) {
      return this.update({ series });
    }

    destroy() {
      this.resizeObserver?.disconnect();
      window.removeEventListener('resize', this.boundWindowResize);
      this.container.replaceChildren();
    }

    draw() {
      if (!this.svg?.isConnected) return;
      const config = this.config;
      const series = config.series
        .map((item, index) => normalizeSeries(item, config.xAxis.type, index))
        .filter((item) => !item.hidden);
      const validPoints = series.flatMap((item) => item.data.filter((point) => point.validY));
      this.renderLegend(series);

      if (!validPoints.length) {
        this.plot.hidden = true;
        this.empty.hidden = false;
        this.readout.hidden = true;
        return;
      }

      this.plot.hidden = false;
      this.empty.hidden = true;
      const measuredWidth = Math.round(this.container.getBoundingClientRect().width || 640);
      const width = Math.max(280, measuredWidth);
      const height = Math.max(180, Number(config.height) || 300);
      const margins = { ...config.margins };
      if (width < 480) {
        margins.left = Math.min(margins.left, 52);
        margins.right = Math.min(margins.right, 14);
      }
      const plotWidth = Math.max(1, width - margins.left - margins.right);
      const plotHeight = Math.max(1, height - margins.top - margins.bottom);
      const xValues = validPoints.map((point) => point.x);
      const yValues = validPoints.map((point) => point.y);
      const configuredXDomain = Array.isArray(config.xAxis.domain)
        ? config.xAxis.domain.map((value) => parseX(value, config.xAxis.type))
        : config.xAxis.domain;
      const xDomain = extent(xValues, configuredXDomain, false, 0);
      const rawYDomain = extent(yValues, config.yAxis.domain, config.yAxis.includeZero);
      const yScaleValues = config.yAxis.nice === false
        ? { domain: rawYDomain, ticks: ticks(rawYDomain, config.yAxis.ticks) }
        : niceNumericScale(rawYDomain, config.yAxis.ticks);
      const yDomain = yScaleValues.domain;
      const xScale = scale(xDomain[0], xDomain[1], margins.left, margins.left + plotWidth);
      const yScale = scale(yDomain[0], yDomain[1], margins.top + plotHeight, margins.top);

      this.svg.replaceChildren();
      this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      this.svg.style.height = `${height}px`;
      this.drawAxes({ width, height, margins, plotWidth, plotHeight, xDomain, yDomain, yTicks: yScaleValues.ticks, xScale, yScale });
      this.drawSeries({ series, xScale, yScale, baseline: margins.top + plotHeight });
      this.setupInteraction({ series, width, height, margins, plotWidth, plotHeight, xDomain, yDomain, xScale, yScale });
    }

    renderLegend(series) {
      this.legend.replaceChildren();
      this.legend.hidden = !this.config.legend.show || !series.length;
      if (this.legend.hidden) {
        this.header.hidden = this.headingGroup.hidden;
        return;
      }
      series.forEach((item) => {
        const entry = htmlElement('li', 'site-graph-legend-item');
        const key = htmlElement('span', `site-graph-legend-key is-${item.lineStyle}`);
        key.style.setProperty('--site-graph-series-color', item.color);
        const label = htmlElement('span', '', item.label);
        entry.append(key, label);
        this.legend.append(entry);
      });
      this.header.hidden = false;
    }

    drawAxes({ height, margins, plotWidth, plotHeight, xDomain, yDomain, yTicks, xScale, yScale }) {
      const axes = svgElement('g', { class: 'site-graph-axes', 'aria-hidden': 'true' });
      const xTicks = ticks(xDomain, this.config.xAxis.ticks);

      yTicks.forEach((value) => {
        const y = yScale(value);
        if (this.config.yAxis.grid) {
          axes.append(svgElement('line', {
            class: 'site-graph-grid-line',
            x1: margins.left,
            x2: margins.left + plotWidth,
            y1: y,
            y2: y
          }));
        }
        const label = svgElement('text', {
          class: 'site-graph-tick-label site-graph-y-tick',
          x: margins.left - 9,
          y: y + 4,
          'text-anchor': 'end'
        });
        label.textContent = formatAxisValue(this.config.yAxis, value, yDomain, 'tick');
        axes.append(label);
      });

      xTicks.forEach((value, index) => {
        const x = xScale(value);
        if (this.config.xAxis.grid && index > 0 && index < xTicks.length - 1) {
          axes.append(svgElement('line', {
            class: 'site-graph-grid-line',
            x1: x,
            x2: x,
            y1: margins.top,
            y2: margins.top + plotHeight
          }));
        }
        const label = svgElement('text', {
          class: 'site-graph-tick-label site-graph-x-tick',
          x,
          y: margins.top + plotHeight + 21,
          'text-anchor': index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'
        });
        label.textContent = formatAxisValue(this.config.xAxis, value, xDomain, 'tick');
        axes.append(label);
      });

      axes.append(svgElement('line', {
        class: 'site-graph-axis-line',
        x1: margins.left,
        x2: margins.left + plotWidth,
        y1: margins.top + plotHeight,
        y2: margins.top + plotHeight
      }));

      if (this.config.xAxis.label) {
        const label = svgElement('text', {
          class: 'site-graph-axis-title',
          x: margins.left + plotWidth / 2,
          y: height - 5,
          'text-anchor': 'middle'
        });
        label.textContent = this.config.xAxis.label;
        axes.append(label);
      }

      if (this.config.yAxis.label) {
        const center = margins.top + plotHeight / 2;
        const label = svgElement('text', {
          class: 'site-graph-axis-title',
          x: 13,
          y: center,
          'text-anchor': 'middle',
          transform: `rotate(-90 13 ${center})`
        });
        label.textContent = this.config.yAxis.label;
        axes.append(label);
      }
      this.svg.append(axes);
    }

    drawSeries({ series, xScale, yScale, baseline }) {
      const root = svgElement('g', { class: 'site-graph-series-root', 'aria-hidden': 'true' });
      series.forEach((item) => {
        const group = svgElement('g', { class: 'site-graph-series' });
        normalizeClassNames(item.className).forEach((name) => group.classList.add(name));
        group.style.setProperty('--site-graph-series-color', item.color);
        const validPoints = item.data.filter((point) => point.validY);

        if (item.area && validPoints.length) {
          const area = svgElement('path', {
            class: 'site-graph-area',
            d: buildAreaPath(item.data, xScale, yScale, baseline, item.curve)
          });
          area.style.setProperty('--site-graph-area-opacity', item.areaOpacity);
          group.append(area);
        }

        if (item.line) {
          group.append(svgElement('path', {
            class: 'site-graph-line',
            d: buildLinePath(item.data, xScale, yScale, item.curve),
            'stroke-width': item.strokeWidth,
            'stroke-dasharray': lineDash(item.lineStyle)
          }));
        }

        item.data.forEach((point) => {
          if (!point.validY) return;
          const x = xScale(point.x);
          const y = yScale(point.y);
          if (pointShouldRender(item, point, validPoints)) drawPoint(group, x, y, item);
          if (point.label || point.showLabel) {
            const placement = labelPlacement(point, x, y);
            const label = svgElement('text', {
              class: 'site-graph-point-label',
              x: placement.x,
              y: placement.y,
              'text-anchor': placement.anchor
            });
            label.textContent = String(point.label || item.formatValue?.(point.y, point) || point.y);
            group.append(label);
          }
        });

        if (item.endLabel && validPoints.length) {
          const last = validPoints[validPoints.length - 1];
          const label = svgElement('text', {
            class: 'site-graph-end-label',
            x: xScale(last.x) - 4,
            y: yScale(last.y) - 9,
            'text-anchor': 'end'
          });
          label.textContent = item.label;
          group.append(label);
        }
        root.append(group);
      });
      this.svg.append(root);
    }

    setupInteraction(context) {
      if (!this.config.interaction.enabled) {
        this.readout.hidden = true;
        return;
      }
      const { series, width, margins, plotWidth, plotHeight, xScale } = context;
      const xValues = [...new Set(series.flatMap((item) => (
        item.data.filter((point) => point.validY).map((point) => point.x)
      )))].sort((left, right) => left - right);
      if (!xValues.length) return;

      const interaction = svgElement('g', { class: 'site-graph-interaction' });
      const guide = svgElement('line', {
        class: 'site-graph-hover-guide',
        y1: margins.top,
        y2: margins.top + plotHeight
      });
      guide.hidden = true;
      const marks = svgElement('g', { class: 'site-graph-hover-marks' });
      const hitArea = svgElement('rect', {
        class: 'site-graph-hit-area',
        x: margins.left,
        y: margins.top,
        width: plotWidth,
        height: plotHeight,
        tabindex: 0,
        role: 'slider',
        'aria-label': `${this.config.ariaLabel}. Use left and right arrow keys to inspect values.`,
        'aria-valuemin': 0,
        'aria-valuemax': xValues.length - 1
      });
      interaction.append(guide, marks, hitArea);
      this.svg.append(interaction);

      const choose = (index, announce = false) => {
        const safeIndex = Math.max(0, Math.min(xValues.length - 1, index));
        const selectedX = xValues[safeIndex];
        this.selectedX = selectedX;
        guide.hidden = false;
        guide.setAttribute('x1', xScale(selectedX));
        guide.setAttribute('x2', xScale(selectedX));
        marks.replaceChildren();
        const selections = series.map((item) => {
          const points = item.data.filter((point) => point.validY);
          const point = points.reduce((closest, candidate) => (
            !closest || Math.abs(candidate.x - selectedX) < Math.abs(closest.x - selectedX) ? candidate : closest
          ), null);
          if (!point) return null;
          const markerSeries = { ...item, pointSize: Math.max(4.5, item.pointSize + 1) };
          const marker = drawPoint(marks, xScale(point.x), context.yScale(point.y), markerSeries, 'site-graph-hover-point');
          marker.style.setProperty('--site-graph-series-color', item.color);
          return { series: item, point };
        }).filter(Boolean);
        hitArea.setAttribute('aria-valuenow', safeIndex);
        const spoken = this.renderReadout(selectedX, selections, context.xDomain);
        hitArea.setAttribute('aria-valuetext', spoken);
        if (announce) this.readout.setAttribute('aria-live', 'polite');
        this.container.dispatchEvent(new CustomEvent('sitegraphchange', {
          detail: { x: selectedX, points: selections.map(({ series: item, point }) => ({ series: item.id, point })) }
        }));
      };

      const nearestIndex = (value) => xValues.reduce((bestIndex, item, index) => (
        Math.abs(item - value) < Math.abs(xValues[bestIndex] - value) ? index : bestIndex
      ), 0);
      const indexFromPointer = (event) => {
        const bounds = this.svg.getBoundingClientRect();
        const viewX = ((event.clientX - bounds.left) / bounds.width) * width;
        const domainRatio = Math.max(0, Math.min(1, (viewX - margins.left) / plotWidth));
        const domainValue = context.xDomain[0] + domainRatio * (context.xDomain[1] - context.xDomain[0]);
        return nearestIndex(domainValue);
      };

      hitArea.addEventListener('pointermove', (event) => choose(indexFromPointer(event)));
      hitArea.addEventListener('pointerdown', (event) => choose(indexFromPointer(event), true));
      hitArea.addEventListener('focus', () => {
        const selected = this.selectedX === null ? xValues.length - 1 : nearestIndex(this.selectedX);
        choose(selected, true);
      });
      hitArea.addEventListener('keydown', (event) => {
        let index = this.selectedX === null ? xValues.length - 1 : nearestIndex(this.selectedX);
        if (event.key === 'ArrowLeft') index -= 1;
        else if (event.key === 'ArrowRight') index += 1;
        else if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = xValues.length - 1;
        else return;
        event.preventDefault();
        choose(index, true);
      });

      if (this.config.interaction.selectLast) {
        choose(this.selectedX === null ? xValues.length - 1 : nearestIndex(this.selectedX));
      }
    }

    renderReadout(x, selections, xDomain) {
      this.readout.replaceChildren();
      const xLabel = formatAxisValue(this.config.xAxis, x, xDomain, 'value');
      const date = htmlElement('strong', 'site-graph-readout-x', xLabel);
      const list = htmlElement('ul', 'site-graph-readout-values');
      const spokenValues = [];
      selections.forEach(({ series, point }) => {
        const item = htmlElement('li', 'site-graph-readout-value');
        const key = htmlElement('span', 'site-graph-readout-key');
        key.style.setProperty('--site-graph-series-color', series.color);
        const label = htmlElement('span', 'site-graph-readout-label', series.label);
        const formatter = series.formatValue || this.config.yAxis.formatValue;
        const valueText = typeof formatter === 'function'
          ? String(formatter(point.y, point))
          : defaultNumberFormat(point.y);
        const value = htmlElement('strong', 'site-graph-readout-number', valueText);
        item.append(key, label, value);
        list.append(item);
        spokenValues.push(`${series.label}: ${valueText}`);
      });
      this.readout.append(date, list);
      this.readout.hidden = false;
      return `${xLabel}. ${spokenValues.join('. ')}`;
    }
  }

  window.SiteGraph = SiteGraph;
})();
