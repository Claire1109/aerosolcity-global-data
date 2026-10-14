(() => {
  "use strict";

  const ACTION_LABELS = {
    site_asset_list: "本站文件清单",
    official_file: "官方文件",
    official_product_page: "官方产品页",
    login_or_request: "登录/申请入口",
    no_verified_entry: "暂无已核实入口",
  };
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const controls = {
    search: $("#search-input"),
    action: $("#access-filter"),
    sourceYear: $("#source-year"),
    localYear: $("#local-year"),
    hostedYear: $("#hosted-year"),
    frequency: $("#source-frequency"),
    resolution: $("#native-resolution"),
    type: $("#type-filter"),
    format: $("#format-filter"),
  };
  const lineFilter = $("#line-filters");
  const list = $("#product-list");
  const resultCount = $("#result-count");
  const errorBox = $("#catalog-error");
  const emptyBox = $("#empty-state");
  const activeFilters = $("#active-filters");
  const lineSelection = new Set();
  let catalogue = null;
  let products = [];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function safeHref(value) {
    if (typeof value !== "string") return "";
    if (/^https:\/\//i.test(value)) return value;
    if (/^\.\/data\/(?:files|provenance)\/[A-Za-z0-9._/-]+$/.test(value)) return value;
    return "";
  }

  function externalAttrs(href) {
    return /^https:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
  }

  function bytesLabel(value) {
    if (!Number.isFinite(value)) return "";
    if (value < 1000) return `${value.toLocaleString("zh-CN")} B`;
    const units = ["kB", "MB", "GB", "TB"];
    let n = value;
    let i = -1;
    do { n /= 1000; i += 1; } while (n >= 1000 && i < units.length - 1);
    return `${n.toLocaleString("zh-CN", { maximumFractionDigits: n < 10 ? 2 : 1 })} ${units[i]}`;
  }

  function clean(value) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    return text && !["unknown", "not verified", "see release metadata"].includes(text.toLowerCase()) ? text : "";
  }

  const YEAR_STEPS = new Map([["annual", 1], ["monthly", 1], ["年度", 1], ["5年", 5], ["五年", 5]]);

  function yearSupport(product, axisKey) {
    const axis = product?.[axisKey];
    if (!axis) return [];
    if (Array.isArray(axis.values) && axis.values.length) {
      return [...new Set(axis.values.filter(Number.isInteger))].sort((a, b) => b - a);
    }
    if (product.dataset_id === "LEG-001" && axisKey === "local_years") return [2020, 2015];

    const range = axis.range;
    if (product.dataset_id === "URB-021" && axisKey === "source_years") {
      if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return [];
      const years = new Set();
      (product.variables || []).forEach((variable) => {
        String(variable.period || "").split(/[,;，；]/).forEach((part) => {
          const value = part.trim();
          if (/^(?:19|20)\d{2}$/.test(value)) years.add(Number(value));
        });
      });
      return [...years].filter((year) => year >= range.start && year <= range.end).sort((a, b) => b - a);
    }
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.end < range.start || range.end - range.start > 250) return [];

    const step = product.dataset_id === "LEG-004" && axisKey === "source_years"
      ? 5
      : YEAR_STEPS.get(clean(product.source_temporal_resolution).toLowerCase());
    if (!step) return [];
    const years = [];
    for (let year = range.start; year <= range.end; year += step) years.push(year);
    return years.sort((a, b) => b - a);
  }

  function unique(values) {
    return [...new Set(values.map(clean).filter(Boolean))];
  }

  function fillSelect(select, entries, firstLabel = "不限") {
    select.innerHTML = `<option value="">${esc(firstLabel)}</option>` + entries.map(([value, label]) =>
      `<option value="${esc(value)}">${esc(label)}</option>`).join("");
  }

  function fillYearSelect(select, axisKey) {
    const years = new Set();
    products.forEach((product) => yearSupport(product, axisKey).forEach((year) => years.add(year)));
    fillSelect(select, [...years].sort((a, b) => b - a).map((year) => [year, year]));
  }

  function setupFilters() {
    const themeCounts = new Map();
    products.forEach((product) => (product.main_lines || []).forEach((line) => themeCounts.set(line, (themeCounts.get(line) || 0) + 1)));
    lineFilter.innerHTML = (catalogue.themes || []).map((theme) => `
      <label class="line-option"><input type="checkbox" value="${esc(theme.label)}"><span>${esc(theme.short_label || theme.label)}</span><small>${themeCounts.get(theme.label) || 0}</small></label>`).join("");

    const actions = unique(products.map((product) => product.primary_action?.kind));
    fillSelect(controls.action, actions.map((kind) => [kind, ACTION_LABELS[kind] || kind]), "全部方式");
    fillYearSelect(controls.sourceYear, "source_years");
    fillYearSelect(controls.localYear, "local_years");
    fillYearSelect(controls.hostedYear, "hosted_years");
    fillSelect(controls.frequency, unique(products.map((product) => product.source_temporal_resolution)).sort((a, b) => a.localeCompare(b, "zh-CN")).map((x) => [x, x]));
    fillSelect(controls.resolution, unique(products.map((product) => product.native_spatial_resolution)).sort((a, b) => a.localeCompare(b, "zh-CN")).map((x) => [x, x]));
    fillSelect(controls.type, unique(products.map((product) => product.data_type)).sort((a, b) => a.localeCompare(b, "zh-CN")).map((x) => [x, x]));
    fillSelect(controls.format, unique(products.flatMap((product) => product.native_formats || [])).sort((a, b) => a.localeCompare(b, "zh-CN")).map((x) => [x, x]));
  }

  function matchesYear(product, axisKey, selected) {
    if (!selected) return true;
    const year = Number(selected);
    return Number.isInteger(year) && yearSupport(product, axisKey).includes(year);
  }

  function searchableText(product) {
    return JSON.stringify(product).toLocaleLowerCase("zh-CN");
  }

  function filterProducts() {
    const term = controls.search.value.trim().toLocaleLowerCase("zh-CN");
    return products.filter((product) => {
      if (term && !searchableText(product).includes(term)) return false;
      if (lineSelection.size && !(product.main_lines || []).some((line) => lineSelection.has(line))) return false;
      if (controls.action.value && product.primary_action?.kind !== controls.action.value) return false;
      if (!matchesYear(product, "source_years", controls.sourceYear.value)) return false;
      if (!matchesYear(product, "local_years", controls.localYear.value)) return false;
      if (!matchesYear(product, "hosted_years", controls.hostedYear.value)) return false;
      if (controls.frequency.value && product.source_temporal_resolution !== controls.frequency.value) return false;
      if (controls.resolution.value && product.native_spatial_resolution !== controls.resolution.value) return false;
      if (controls.type.value && product.data_type !== controls.type.value) return false;
      if (controls.format.value && !(product.native_formats || []).includes(controls.format.value)) return false;
      return true;
    });
  }

  function yearText(product, axisKey) {
    const axis = product?.[axisKey];
    if (!axis) return "";
    if (product.dataset_id === "LEG-001" && axisKey === "local_years") return "1975–2030 数据包；本地明确有2015/2020图层";
    if (product.dataset_id === "ATM-032" && axisKey === "local_years") return "2008–2020；本地2019年含14个年层";
    if (product.dataset_id === "ATM-032" && axisKey === "hosted_years") return "2019；本站含14个年层";
    if (product.dataset_id === "ATM-026" && axisKey === "local_years") return "2019；本地仅有2019-01、2019-04、2019-07、2019-10";

    const values = Array.isArray(axis.values) ? axis.values.filter(Number.isInteger) : [];
    const range = axis.range;
    const validRange = range && Number.isInteger(range.start) && Number.isInteger(range.end);
    const base = values.length
      ? (values.length <= 8 ? values.join("、") : `${values[0]} 等 ${values.length} 个明确年份`)
      : validRange ? `${range.start}–${range.end}` : "";
    const qualifier = clean(axis.qualifier);
    if (!base) return qualifier;
    if (!qualifier || qualifier === base) return base;
    if (validRange && qualifier.includes(String(range.start)) && qualifier.includes(String(range.end))) return qualifier;
    if (values.length && values.every((year) => qualifier.includes(String(year)))) return qualifier;
    return `${base}；${qualifier}`;
  }

  function detailAxis(label, product, axisKey) {
    const value = yearText(product, axisKey);
    return value ? `<div class="axis-cell"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : "";
  }

  function scopeFacts(product) {
    const rows = [
      ["产品空间范围", product.source_spatial_coverage],
      ["来源时间步长", product.source_temporal_resolution],
      ["原生空间尺度", product.native_spatial_resolution],
      ["原生网格 / 空间单位", product.native_spatial_unit_or_grid],
      ["数据类型", product.data_type],
      ["原始格式", (product.native_formats || []).join("、")],
    ].filter(([, value]) => clean(value));
    return rows.length ? `<dl class="fact-list">${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}</dl>` : "";
  }

  function variableRows(product) {
    const variables = product.variables;
    if (!Array.isArray(variables) || !variables.length) return "";
    return `<div class="variable-list">${variables.map((variable) => {
      if (typeof variable === "string") return `<div class="variable-row"><strong>${esc(variable)}</strong></div>`;
      const name = clean(variable.name);
      const label = clean(variable.label) || name;
      const unit = clean(variable.unit);
      const differs = name && label && name !== label;
      let period = clean(variable.period);
      if (product.dataset_id === "LEG-001" && period.includes("抽查")) period = "1975–2030 数据包；本地明确有2015/2020图层";
      if (product.dataset_id === "ATM-032" && /extracted\/read/i.test(period)) period = "2008–2020 annual; 2019 includes 14 annual layers";
      const definition = clean(variable.definition);
      return `<div class="variable-row"><div><strong>${esc(label || name || "变量")}</strong>${differs ? `<br><code>${esc(name)}</code>` : ""}</div>${unit ? `<span class="unit">${esc(unit)}</span>` : ""}${period ? `<p>时期：${esc(period)}</p>` : ""}${definition ? `<p>${esc(definition)}</p>` : ""}</div>`;
    }).join("")}</div>`;
  }

  function sourceBlock(product) {
    const page = product.source_page;
    const links = page && safeHref(page.url) ? `<a href="${esc(page.url)}" target="_blank" rel="noopener noreferrer">${esc(page.label || "官方产品/数据记录页")}</a>` : "";
    const refs = product.references || {};
    const typedDois = [
      refs.data_record_doi ? `<a href="https://doi.org/${esc(refs.data_record_doi.replace(/^https?:\/\/doi\.org\//i, ""))}" target="_blank" rel="noopener noreferrer">数据记录 DOI：${esc(refs.data_record_doi)}</a>` : "",
      refs.article_doi ? `<a href="https://doi.org/${esc(refs.article_doi.replace(/^https?:\/\/doi\.org\//i, ""))}" target="_blank" rel="noopener noreferrer">论文 DOI：${esc(refs.article_doi)}</a>` : "",
    ].filter(Boolean).join("");
    const citation = clean(refs.citation);
    if (!links && !typedDois && !citation) return "";
    return `<section class="detail-section"><h4>来源与引用</h4>${links ? `<p class="source-link-list">${links}</p>` : ""}${typedDois ? `<p class="source-link-list">${typedDois}</p>` : ""}${citation ? `<p class="citation">${esc(citation)}</p>` : ""}</section>`;
  }

  function assetRows(product) {
    const assets = [...(product.downloads || []), ...(product.pending_downloads || [])];
    if (!assets.length) return "";
    const assetIds = new Set(assets.map((asset) => asset.asset_id));
    const provenance = (catalogue.provenance || []).filter((entry) => assetIds.has(entry.asset_id));
    const provenanceById = new Map(provenance.map((entry) => [entry.asset_id, entry]));
    return `<section class="detail-section"><h4>文件与证明</h4><div class="asset-list">${assets.map((asset) => {
      const pending = asset.publication_status === "pending";
      const href = pending ? "" : safeHref(asset.href);
      const title = asset.label || asset.filename || asset.asset_id;
      const method = asset.access_method === "official_direct_file" ? "官方文件" : asset.access_method === "site_hosted" ? "本站文件" : "目录文件";
      const checksum = asset.publisher_checksum;
      const publisherValue = checksum && checksum.value ? `${checksum.algorithm || "校验值"}：${checksum.value}` : "无可用发布方校验值记录";
      const prov = provenanceById.get(asset.asset_id);
      const provHref = prov ? safeHref(prov.href) : "";
      return `<article class="asset-item${pending ? " pending-asset" : ""}"><div class="asset-heading"><strong>${esc(title)}</strong>${href ? `<a href="${esc(href)}"${externalAttrs(href)}>打开文件</a>` : pending ? `<button class="action-button" type="button" disabled>官方原件入口待核</button>` : `<span class="quiet">无可用文件链接</span>`}</div><p class="asset-meta">${esc(method)}${asset.filename ? ` · ${esc(asset.filename)}` : ""}${Number.isFinite(asset.bytes) ? ` · ${esc(bytesLabel(asset.bytes))}` : ""}</p>${asset.scope_label ? `<p class="asset-meta">${esc(asset.scope_label)}</p>` : ""}${asset.access_note_zh ? `<p class="asset-meta">${esc(asset.access_note_zh)} · ${asset.checked_at ? `核验：${esc(asset.checked_at)}` : "本轮尚未核验"}</p>` : ""}${asset.record_doi ? `<p class="asset-meta">${esc(asset.license_note_zh)} · <a href="https://doi.org/${esc(asset.record_doi)}" target="_blank" rel="noopener noreferrer">数据记录 DOI：${esc(asset.record_doi)}</a></p>` : ""}<dl class="asset-facts"><dt>资产键</dt><dd><code>${esc(asset.asset_id)}</code></dd>${asset.sha256 ? `<dt>本地 SHA-256</dt><dd><code class="hash-value">${esc(asset.sha256)}</code></dd>` : ""}<dt>发布方校验</dt><dd>${esc(publisherValue)}</dd>${provHref ? `<dt>来源证明</dt><dd><a href="${esc(provHref)}">${esc(prov.record_id || "查看公开来源证明")}</a></dd>` : ""}</dl></article>`;
    }).join("")}</div></section>`;
  }

  function productDetail(product) {
    const variables = variableRows(product);
    const facts = scopeFacts(product);
    let localNote = clean(product.local_scope_note_zh);
    if (product.dataset_id === "LEG-001" && localNote.includes("抽查")) localNote = "本地数据包范围为1975–2030；本地明确有2015与2020图层。";
    const quality = clean(product.quality_note_zh);
    const license = clean(product.license_note_zh);
    const sources = sourceBlock(product);
    const assets = assetRows(product);
    const identity = product.display_identity_note ? `<span>${esc(product.display_identity_note)}</span>` : "";
    const keyline = `<div class="keyline"><code>${esc(product.dataset_id)}</code>${identity}</div>`;
    const version = clean(product.version_label) ? `<p class="version-line">版本 / 变量区分：${esc(product.version_label)}</p>` : "";
    const yearAxes = [
      detailAxis("来源年份", product, "source_years"),
      detailAxis("本地取得年份", product, "local_years"),
      detailAxis("本站文件年份", product, "hosted_years"),
    ].filter(Boolean).join("");
    const sections = [
      `<section class="detail-section"><h4>记录身份</h4>${keyline}${version}</section>`,
      variables ? `<section class="detail-section"><h4>变量与单位</h4>${variables}</section>` : "",
      `<section class="detail-section"><h4>年份与原生尺度</h4>${yearAxes ? `<dl class="axis-grid">${yearAxes}</dl>` : ""}${facts ? `<div class="scope-facts">${facts}</div>` : ""}${localNote ? `<p class="inline-note">${esc(localNote)}</p>` : ""}</section>`,
      quality || license ? `<section class="detail-section"><h4>科学限制与许可</h4>${quality ? `<p class="inline-note">${esc(quality)}</p>` : ""}${license ? `<p>${esc(license)}</p>` : ""}</section>` : "",
      sources,
      assets,
    ].filter(Boolean).join("");
    return `<details class="product-detail" id="details-${esc(product.dataset_id)}"><summary>记录详情</summary><div class="detail-body">${sections}</div></details>`;
  }

  function productRow(product) {
    const action = product.primary_action || {kind:"no_verified_entry",label:ACTION_LABELS.no_verified_entry};
    const rowScope = clean(product.action_scope_text) || clean(product.source_spatial_coverage) || "产品范围尚未明确";
    const spatial = clean(product.native_spatial_resolution) || clean(product.native_spatial_unit_or_grid) || "原生尺度待核实";
    let primary = `<span class="action-static">${esc(action.label || ACTION_LABELS.no_verified_entry)}</span>`;
    if (action.kind === "site_asset_list") {
      primary = `<button class="action-button" type="button" data-open-details="${esc(product.dataset_id)}" aria-controls="details-${esc(product.dataset_id)}" aria-expanded="false">${esc(action.label || "本站文件清单")}</button>`;
    } else if ((action.kind === "official_file" || action.kind === "official_product_page" || action.kind === "login_or_request") && safeHref(action.url)) {
      primary = `<a class="action-link" href="${esc(action.url)}"${externalAttrs(action.url)}>${esc(action.label || ACTION_LABELS[action.kind])}<span aria-hidden="true">↗</span></a>`;
    }
    const pending = product.display_identity_note ? `<span class="name-pending">${esc(product.display_identity_note)}</span>` : "";
    const disambiguator = clean(product.disambiguator) ? `<span>${esc(product.disambiguator)}</span>` : "";
    const version = clean(product.version_label) ? `<span>${esc(product.version_label)}</span>` : "";
    return `<article class="product-row" id="product-${esc(product.dataset_id)}">
      <div class="row-identity"><div class="identity-flags">${pending}${disambiguator}${version}</div><h3>${esc(product.display_name || "未命名记录")}</h3><p class="row-use">${esc(product.short_use_zh || "")}</p></div>
      <div class="row-scope"><span class="row-label">${esc(action.scope_label || "记录范围")}</span><p>${esc(rowScope)}</p><p class="scale-line"><span class="row-label">原生尺度</span>${esc(spatial)}</p></div>
      <div class="row-action"><span class="row-label">获取方式</span>${primary}<p class="row-limit">${esc(product.main_limitation_zh || "")}</p></div>
      <div class="detail-wrap">${productDetail(product)}</div>
    </article>`;
  }

  function selectedLabels() {
    const values = [];
    if (controls.search.value.trim()) values.push(`搜索：${controls.search.value.trim()}`);
    lineSelection.forEach((line) => values.push(`主线：${line}`));
    if (controls.action.value) values.push(`获取方式：${ACTION_LABELS[controls.action.value] || controls.action.value}`);
    [[controls.sourceYear,"来源年份"],[controls.localYear,"本地取得年份"],[controls.hostedYear,"本站文件年份"],
      [controls.frequency,"来源时间步长"],[controls.resolution,"原生空间尺度"],[controls.type,"数据类型"],[controls.format,"原始格式"]].forEach(([control,label]) => {
      if (control.value) values.push(`${label}：${control.selectedOptions[0]?.textContent || control.value}`);
    });
    return values;
  }

  function render() {
    if (!catalogue) return;
    const filtered = filterProducts();
    list.innerHTML = filtered.map(productRow).join("");
    resultCount.textContent = filtered.length.toLocaleString("zh-CN");
    emptyBox.hidden = filtered.length !== 0;
    const chips = selectedLabels();
    activeFilters.innerHTML = chips.map((label) => `<span class="active-filter">${esc(label)}</span>`).join("");
    list.querySelectorAll("[data-open-details]").forEach((button) => button.addEventListener("click", () => {
      const details = document.getElementById(`details-${button.dataset.openDetails}`);
      if (!details) return;
      details.open = !details.open;
      button.setAttribute("aria-expanded", String(details.open));
      if (details.open) details.querySelector("summary")?.focus({ preventScroll: true });
    }));
    list.querySelectorAll(".product-detail").forEach((details) => details.addEventListener("toggle", () => {
      const button = list.querySelector(`[data-open-details="${CSS.escape(details.id.replace("details-", ""))}"]`);
      if (button) button.setAttribute("aria-expanded", String(details.open));
    }));
  }

  function clearFilters() {
    Object.values(controls).forEach((control) => { control.value = ""; });
    lineSelection.clear();
    lineFilter.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
    render();
    controls.search.focus();
  }

  function wireEvents() {
    Object.values(controls).forEach((control) => control.addEventListener(control === controls.search ? "input" : "change", render));
    lineFilter.addEventListener("change", (event) => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      if (input.checked) lineSelection.add(input.value);
      else lineSelection.delete(input.value);
      render();
    });
    $("#clear-filters").addEventListener("click", clearFilters);
    $("#empty-clear").addEventListener("click", clearFilters);
  }

  async function init() {
    try {
      const response = await fetch("./data/catalog.json?v=d035-r03", { cache: "no-store" });
      if (!response.ok) throw new Error(`目录数据读取失败（HTTP ${response.status}）`);
      catalogue = await response.json();
      products = Array.isArray(catalogue.products) ? catalogue.products : [];
      const ids = products.map((product) => product.dataset_id);
      if (products.length !== 84 || new Set(ids).size !== 84) throw new Error("目录键检查未通过，请重新加载页面。");
      const assetCount = products.reduce((sum, product) => sum + (product.downloads || []).length, 0);
      if (assetCount !== 26) throw new Error("文件清单与冻结基线不一致，页面已停止渲染。");
      setupFilters();
      wireEvents();
      render();
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = `${error.message} 请从本地静态服务器打开 site/ 目录。`;
      list.innerHTML = "";
      resultCount.textContent = "0";
    }
  }

  init();
})();
