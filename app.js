(() => {
  "use strict";

  const METHOD_LABELS = {
    site_hosted: "本站托管文件",
    official_direct_file: "官方文件直链",
    official_product_page: "官方来源页",
    login_or_application: "登录 / 申请",
    catalog_record_only: "仅目录记录",
    no_verified_channel: "暂无核实渠道",
    unknown: "获取方式未知",
  };
  const $ = (selector) => document.querySelector(selector);
  const controls = {
    search: $("#search-input"),
    sourceYear: $("#source-year"),
    localYear: $("#local-year"),
    hostedYear: $("#hosted-year"),
    sourceFrequency: $("#source-frequency"),
    nativeResolution: $("#native-resolution"),
    completeness: $("#completeness-filter"),
    quality: $("#quality-filter"),
    reuse: $("#reuse-filter"),
    access: $("#access-filter"),
    type: $("#type-filter"),
    format: $("#format-filter"),
  };

  let catalogue = null;
  let products = [];
  let themes = [];
  let lineSelection = new Set();

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

  function link(href, label, extraClass = "") {
    const safe = safeHref(href);
    if (!safe) return "";
    const external = /^https:/i.test(safe);
    return `<a class="${extraClass}" href="${esc(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(label)}</a>`;
  }

  function humanBytes(bytes) {
    if (!Number.isFinite(bytes)) return "字节数未知";
    if (bytes < 1000) return `${bytes.toLocaleString("zh-CN")} B`;
    const units = ["kB", "MB", "GB", "TB"];
    let value = bytes;
    let index = -1;
    do { value /= 1000; index += 1; } while (value >= 1000 && index < units.length - 1);
    return `${value.toLocaleString("zh-CN", { maximumFractionDigits: value < 10 ? 2 : 1 })} ${units[index]}`;
  }

  function yearLabel(axis) {
    if (!axis) return "unknown";
    if (Array.isArray(axis.values) && axis.values.length) {
      return axis.values.length <= 8 ? axis.values.join("、") : `${axis.values[0]} 等 ${axis.values.length} 个明确年份`;
    }
    if (axis.range && Number.isInteger(axis.range.start) && Number.isInteger(axis.range.end)) {
      return `${axis.range.start}–${axis.range.end}`;
    }
    return axis.qualifier && axis.qualifier !== "unknown" ? axis.qualifier : "unknown";
  }

  function fullText(value, result = []) {
    if (typeof value === "string" || typeof value === "number") result.push(String(value));
    else if (Array.isArray(value)) value.forEach((item) => fullText(item, result));
    else if (value && typeof value === "object") Object.values(value).forEach((item) => fullText(item, result));
    return result;
  }

  function unique(values) {
    return [...new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== ""))];
  }

  function stateOptions(field) {
    const map = new Map();
    products.forEach((product) => {
      const state = product[field];
      if (state?.code) map.set(state.code, state.label || state.code);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
  }

  function yearSet(axis) {
    const years = new Set();
    products.forEach((product) => {
      const field = product.years?.[axis];
      if (Array.isArray(field?.values)) field.values.forEach((year) => Number.isInteger(year) && years.add(year));
      const range = field?.range;
      if (range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.end >= range.start && range.end - range.start <= 250) {
        for (let year = range.start; year <= range.end; year += 1) years.add(year);
      }
    });
    return [...years].sort((a, b) => b - a);
  }

  function setOptions(select, entries) {
    const first = select.options[0]?.outerHTML || '<option value="">不限</option>';
    select.innerHTML = first + entries.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
  }

  function setYearOptions(select, axis) {
    const first = select.options[0]?.outerHTML || '<option value="">不限</option>';
    select.innerHTML = first + yearSet(axis).map((year) => `<option value="${year}">${year}</option>`).join("");
  }

  function setupFacets() {
    const lineCounts = new Map();
    products.forEach((product) => (product.main_lines || []).forEach((line) => lineCounts.set(line, (lineCounts.get(line) || 0) + 1)));
    $("#line-filters").innerHTML = themes.map((theme) => {
      const count = lineCounts.get(theme.label) || 0;
      return `<label class="line-option"><input type="checkbox" value="${esc(theme.label)}"><span class="line-check" aria-hidden="true"></span><span>${esc(theme.short_label || theme.label)}</span><small>${count}</small></label>`;
    }).join("");

    setYearOptions(controls.sourceYear, "source");
    setYearOptions(controls.localYear, "local");
    setYearOptions(controls.hostedYear, "hosted");
    setOptions(controls.completeness, stateOptions("local_completeness"));
    setOptions(controls.quality, stateOptions("quality"));
    setOptions(controls.reuse, stateOptions("reuse"));

    const methods = new Map();
    products.forEach((product) => (product.access?.methods || []).forEach((method) => methods.set(method.code, method.label || METHOD_LABELS[method.code] || method.code)));
    setOptions(controls.access, [...methods.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN")));
    const types = unique(products.map((product) => product.data_type)).sort((a, b) => a.localeCompare(b, "zh-CN"));
    setOptions(controls.type, types.map((value) => [value, value]));
    const formats = unique(products.flatMap((product) => product.native_formats || [])).sort((a, b) => a.localeCompare(b, "zh-CN"));
    setOptions(controls.format, formats.map((value) => [value, value]));
    const frequencies = unique(products.map((product) => product.source_temporal_resolution))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    setOptions(controls.sourceFrequency, frequencies.map((value) => [value, value.toLowerCase() === "unknown" ? "未核实" : value]));
    const resolutions = unique(products.map((product) => product.native_spatial_resolution))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    setOptions(controls.nativeResolution, resolutions.map((value) => [value, value.toLowerCase() === "unknown" ? "未核实" : value]));
  }

  function passesYear(product, axis, selected) {
    if (!selected) return true;
    const year = Number(selected);
    const field = product.years?.[axis];
    if (Array.isArray(field?.values) && field.values.includes(year)) return true;
    return Boolean(field?.range && year >= field.range.start && year <= field.range.end);
  }

  function filterProducts() {
    const needle = controls.search.value.trim().toLocaleLowerCase("zh-CN");
    return products.filter((product) => {
      if (needle && !fullText(product).join(" ").toLocaleLowerCase("zh-CN").includes(needle)) return false;
      if (lineSelection.size && !(product.main_lines || []).some((line) => lineSelection.has(line))) return false;
      if (!passesYear(product, "source", controls.sourceYear.value)) return false;
      if (!passesYear(product, "local", controls.localYear.value)) return false;
      if (!passesYear(product, "hosted", controls.hostedYear.value)) return false;
      if (controls.sourceFrequency.value && product.source_temporal_resolution !== controls.sourceFrequency.value) return false;
      if (controls.nativeResolution.value && product.native_spatial_resolution !== controls.nativeResolution.value) return false;
      if (controls.completeness.value && product.local_completeness?.code !== controls.completeness.value) return false;
      if (controls.quality.value && product.quality?.code !== controls.quality.value) return false;
      if (controls.reuse.value && product.reuse?.code !== controls.reuse.value) return false;
      if (controls.access.value && !(product.public_access_methods || []).includes(controls.access.value)) return false;
      if (controls.type.value && product.data_type !== controls.type.value) return false;
      if (controls.format.value && !(product.native_formats || []).includes(controls.format.value)) return false;
      return true;
    });
  }

  function chips(values, className = "tag") {
    return (values || []).filter(Boolean).map((value) => `<span class="${className}">${esc(value)}</span>`).join("");
  }

  function statusCell(label, state, fallback) {
    const code = state?.code || "unknown";
    return `<div class="status-cell"><span class="status-label">${esc(label)}</span><span class="status-value status-${esc(code)}"><i></i>${esc(state?.label || fallback || "unknown")}</span></div>`;
  }

  function accessSummary(product) {
    const methods = product.public_access_methods || [];
    const files = product.downloads || [];
    if (files.length) return `${files.length} 个核实文件入口`;
    const labels = methods.map((method) => METHOD_LABELS[method] || method);
    return labels.length ? labels.join(" · ") : "暂无核实入口";
  }

  function scopeRows(product) {
    const scopes = product.local_completeness?.scope_evidence || [];
    if (!scopes.length) return `<p class="muted-note">当前登记未拆分为独立 scope 计数。</p>`;
    return `<div class="scope-list">${scopes.map((scope) => {
      const numbers = [];
      if (Number.isInteger(scope.accepted_assets)) numbers.push(`已验收 ${scope.accepted_assets}`);
      if (Number.isInteger(scope.expected_assets)) numbers.push(`预期 ${scope.expected_assets}`);
      if (Number.isInteger(scope.blocked_assets)) numbers.push(`阻塞 ${scope.blocked_assets}`);
      return `<div class="scope-item"><div class="scope-item-head"><strong>${esc(scope.scope_id || "未命名范围")}</strong><span>${esc(scope.scope_state || "unknown")}</span></div><p>${esc(scope.variable_or_member || "")}${scope.unit ? ` · ${esc(scope.unit)}` : ""}</p><p>${esc(scope.time_support || "")}${scope.spatial_support ? ` · ${esc(scope.spatial_support)}` : ""}</p>${numbers.length ? `<div class="scope-counts">${numbers.map((item) => `<span>${esc(item)}</span>`).join("")}</div>` : ""}${scope.gap_or_blocker ? `<p class="scope-gap">${esc(scope.gap_or_blocker)}</p>` : ""}</div>`;
    }).join("")}</div>`;
  }

  function variableRows(variables) {
    if (!Array.isArray(variables) || !variables.length) return `<p class="muted-note">变量信息尚未结构化。</p>`;
    return `<div class="variable-list">${variables.map((variable) => {
      if (typeof variable === "string") return `<div class="variable-row"><strong>${esc(variable)}</strong></div>`;
      return `<div class="variable-row"><div><strong>${esc(variable.label || variable.name || "未命名变量")}</strong>${variable.name && variable.label && variable.name !== variable.label ? `<small>${esc(variable.name)}</small>` : ""}</div><span>${esc(variable.unit || "单位未知")}</span>${variable.period ? `<p>${esc(variable.period)}</p>` : ""}${variable.definition ? `<p>${esc(variable.definition)}</p>` : ""}</div>`;
    }).join("")}</div>`;
  }

  function visibleLimitations(product) {
    return (product.limitations || []).filter((item) => !/^GeoTIFF\s+\[.*PROJCS\[/i.test(item));
  }

  function sourceLink(product) {
    const source = product.source || {};
    const doi = source.doi && source.doi !== "unknown" ? source.doi.replace(/^https?:\/\/doi\.org\//i, "") : "";
    const doiHref = doi ? `https://doi.org/${doi}` : "";
    const sourceAnchor = link(source.url, "打开官方来源页", "source-link");
    const doiAnchor = link(doiHref, `DOI ${doi}`, "doi-link");
    const citation = source.citation || "";
    return `<div class="source-block"><div>${sourceAnchor}${doiAnchor}</div>${citation ? `<p>${esc(citation)}</p>` : ""}${product.producer ? `<p class="source-credit">${esc(product.producer)}</p>` : ""}</div>`;
  }

  function downloadList(product) {
    const assets = product.downloads || [];
    if (!assets.length) {
      const methods = product.access?.methods || [];
      const sourcePage = methods.some((method) => method.code === "official_product_page") ? link(product.source?.url, "查看官方产品页", "source-link") : "";
      return `<div class="no-download"><span class="no-download-icon" aria-hidden="true">↗</span><div><strong>当前没有目录文件按钮</strong><p>${esc(accessSummary(product))}。来源页仅用于了解产品，不代表文件直链。</p>${sourcePage}</div></div>`;
    }
    return `<div class="asset-list">${assets.map((asset) => {
      const methodLabel = METHOD_LABELS[asset.access_method] || asset.access_method;
      const actionLabel = asset.access_method === "official_direct_file" ? "打开官方文件" : "获取文件";
      const href = safeHref(asset.href);
      const action = href ? `<a class="button button-download" href="${esc(href)}"${/^https:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(actionLabel)} <span aria-hidden="true">↗</span></a>` : `<span class="disabled-action">暂不可用</span>`;
      return `<div class="asset-row"><div class="asset-main"><div class="asset-topline"><strong>${esc(asset.label || asset.filename || asset.asset_id)}</strong><span class="asset-method">${esc(methodLabel)}</span></div><p>${esc(asset.filename || "文件名未知")} · ${esc(humanBytes(asset.bytes))}</p><details class="asset-proof"><summary>查看文件身份与核验记录</summary><dl><div><dt>资产键</dt><dd>${esc(asset.asset_id)}</dd></div><div><dt>SHA-256</dt><dd class="hash-value">${esc(asset.sha256 || "unknown")}</dd></div><div><dt>本地读取</dt><dd>${asset.local_read?.accepted === true ? "已验收" : asset.local_read?.accepted === false ? "未通过" : "未核实"} · ${esc(asset.local_read?.details || "")}</dd></div><div><dt>公网端点</dt><dd>${esc(asset.endpoint_verification?.http_status ?? "unknown")} ${asset.endpoint_verification?.checked_at ? `· ${esc(asset.endpoint_verification.checked_at)}` : ""}${asset.endpoint_verification?.content_length ? ` · ${esc(humanBytes(asset.endpoint_verification.content_length))}` : ""}</dd></div></dl></details></div><div class="asset-action">${action}</div></div>`;
    }).join("")}</div>`;
  }

  function provenanceLinks(product) {
    const assetIds = new Set((product.downloads || []).map((asset) => asset.asset_id));
    const links = (catalogue.provenance || []).filter((item) => assetIds.has(item.asset_id));
    if (!links.length) return "";
    return `<div class="provenance-links"><span>处理记录</span>${links.map((item) => link(item.href, item.record_id, "provenance-link")).join("")}</div>`;
  }

  function releaseNotice(product) {
    const note = product.release_note;
    if (!note || note.status === "catalog_controls_enabled") return "";
    const facts = note.facts || {};
    const citation = facts.citation ? `<p class="release-citation">${esc(facts.citation)}</p>` : "";
    const dois = [
      facts.source_doi ? link(`https://doi.org/${String(facts.source_doi).replace(/^https?:\/\/doi\.org\//i, "")}`, `数据 DOI ${facts.source_doi}`, "doi-link") : "",
      facts.article_doi ? link(`https://doi.org/${String(facts.article_doi).replace(/^https?:\/\/doi\.org\//i, "")}`, `论文 DOI ${facts.article_doi}`, "doi-link") : "",
    ].filter(Boolean).join("");
    const license = facts.license?.name ? link(facts.license.url, facts.license.name, "doi-link") : "";
    const unit = facts.unit ? `<p>单位：${esc(facts.unit)}；${esc(facts.unit_basis || "单位依据见详情")} ${license ? `· 许可 ${license}` : ""}</p>` : "";
    const attribution = facts.attribution ? `<p>${esc(facts.attribution)}</p>` : "";
    return `<div class="release-note"><span class="release-icon" aria-hidden="true">↗</span><div><strong>${esc(note.label)}</strong><p>${esc(note.scope)} ${note.file_count} 层 · ${esc(humanBytes(note.bytes))}。模型与原生网格限制见下方详情。</p>${unit}${citation}${dois}${attribution}</div></div>`;
  }

  function productCard(product) {
    const sourceYear = product.years?.source;
    const localYear = product.years?.local;
    const hostedYear = product.years?.hosted;
    const completeness = product.local_completeness || {};
    const localBytes = completeness.accepted_bytes;
    const localFiles = completeness.accepted_file_count;
    const localMeta = [Number.isInteger(localFiles) ? `${localFiles} 个登记文件` : "文件数未知", Number.isInteger(localBytes) ? humanBytes(localBytes) : "字节数未知"].join(" · ");
    const limits = visibleLimitations(product);
    const source = product.source || {};
    const typeTags = [product.data_type, ...(product.native_formats || [])].filter(Boolean);
    const scope = completeness.details;
    const scopeText = typeof scope === "string" ? scope : [scope?.source_state_text, scope?.reported_range].filter(Boolean).join(" · ");
    const variables = (product.variables || []).slice(0, 40);
    const varLine = variables.map((variable) => typeof variable === "string" ? variable : (variable.label || variable.name)).filter(Boolean).slice(0, 3).join(" · ");
    return `<article class="product-card" id="product-${esc(product.dataset_id)}">
      <div class="card-accent"></div>
      <div class="product-card-inner">
        <div class="product-title-row"><div><div class="product-meta"><span class="dataset-id">${esc(product.dataset_id)}</span><span>${esc(product.version || "版本未知")}</span></div><h3>${esc(product.product_name || "未命名产品")}</h3><p class="producer">${esc(product.producer || "来源机构未知")}</p></div><div class="product-index" aria-hidden="true">${esc(String(products.indexOf(product) + 1).padStart(2, "0"))}</div></div>
        <div class="line-tags">${chips(product.main_lines || [], "line-tag")}${chips((product.tags || []).slice(0, 3), "topic-tag")}</div>
        <div class="status-grid">
          ${statusCell("本地取得", completeness, "取得状态未知")}
          ${statusCell("科学质量", product.quality, "质量状态未知")}
          ${statusCell("许可与再用", product.reuse, "许可状态未知")}
          <div class="status-cell"><span class="status-label">公开获取</span><span class="status-value access-status"><i></i>${esc(accessSummary(product))}</span></div>
        </div>
        <div class="year-strip">
          <div><span>来源年份</span><strong>${esc(yearLabel(sourceYear))}</strong><small>${esc(sourceYear?.qualifier || "unknown")}</small></div>
          <div><span>本地取得年份</span><strong>${esc(yearLabel(localYear))}</strong><small>${esc(localYear?.qualifier || "unknown")}</small></div>
          <div><span>本站文件年份</span><strong>${esc(yearLabel(hostedYear))}</strong><small>${esc(hostedYear?.qualifier || "unknown")}</small></div>
        </div>
        <p class="card-summary">${varLine ? `<strong>${esc(varLine)}</strong><br>` : ""}${esc(scopeText || product.source_spatial_coverage || "范围说明见详情")}<span class="local-meta">${esc(localMeta)}</span></p>
        ${releaseNotice(product)}
        <details class="product-details">
          <summary><span>产品范围、变量与文件</span><i aria-hidden="true">＋</i></summary>
          <div class="detail-content">
            <section class="detail-section"><h4>变量与单位</h4>${variableRows(product.variables)}</section>
            <section class="detail-section"><h4>来源与范围</h4>${sourceLink(product)}<div class="detail-facts"><div><span>来源空间范围</span><p>${esc(product.source_spatial_coverage || "unknown")}</p></div><div><span>来源时间尺度</span><p>${esc(product.source_temporal_resolution || "unknown")}</p></div><div><span>原生空间分辨率</span><p>${esc(product.native_spatial_resolution || "unknown")}</p></div><div><span>原生空间网格 / CRS</span><p>${esc(product.native_spatial_unit_or_grid || "unknown")}</p></div><div><span>数据类型</span><p>${esc(product.data_type || "unknown")}</p></div><div><span>原始格式</span><p>${esc((product.native_formats || []).join("、") || "unknown")}</p></div></div></section>
            <section class="detail-section"><h4>本地范围与缺口</h4><p class="detail-state-line">${esc(completeness.label || "unknown")} · ${esc(typeof completeness.details === "string" ? completeness.details : scopeText || "范围详情未提供")}</p>${scopeRows(product)}</section>
            <section class="detail-section"><h4>质量、许可与限制</h4><p class="detail-state-line">${esc(product.quality?.label || "unknown")} · ${esc(product.quality?.details || "")}</p><p class="license-line"><strong>许可记录：</strong>${esc(product.license_evidence_text || (product.reuse?.details?.license_evidence_text) || "unknown")}</p>${limits.length ? `<ul class="limitation-list">${limits.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : `<p class="muted-note">当前没有单独列出的限制说明。</p>`}<p class="license-caveat">许可条款记录不自动代表所有文件均可再分发或托管；具体文件按其资产状态提供。</p></section>
            <section class="detail-section"><h4>文件获取</h4>${downloadList(product)}${provenanceLinks(product)}</section>
          </div>
        </details>
      </div>
    </article>`;
  }

  function activeFilterLabels() {
    const labels = [];
    if (controls.search.value.trim()) labels.push(`搜索：${controls.search.value.trim()}`);
    [...lineSelection].forEach((line) => labels.push(`主线：${line}`));
    [[controls.sourceYear, "来源年份"], [controls.localYear, "本地年份"], [controls.hostedYear, "本站年份"]].forEach(([control, label]) => {
      if (control.value) labels.push(`${label}：${control.value}`);
    });
    [[controls.sourceFrequency, "来源时间频率"], [controls.nativeResolution, "原生空间分辨率"]].forEach(([control, label]) => {
      if (control.value) labels.push(`${label}：${control.selectedOptions[0]?.textContent || control.value}`);
    });
    [[controls.completeness, "完整度"], [controls.quality, "质量"], [controls.reuse, "再用"], [controls.access, "获取方式"], [controls.type, "类型"], [controls.format, "格式"]].forEach(([control, label]) => {
      if (control.value) labels.push(`${label}：${control.selectedOptions[0]?.textContent || control.value}`);
    });
    return labels;
  }

  function render() {
    if (!catalogue) return;
    const filtered = filterProducts();
    $("#result-count").textContent = filtered.length.toLocaleString("zh-CN");
    $("#scope-count").textContent = `${products.length} 条记录`;
    const list = $("#product-list");
    list.innerHTML = filtered.map(productCard).join("");
    const empty = filtered.length === 0;
    $("#empty-state").hidden = !empty;
    const tags = activeFilterLabels();
    $("#active-filters").innerHTML = tags.length ? tags.map((tag) => `<span class="active-tag">${esc(tag)}</span>`).join("") : `<span class="all-records-note">展示全部目录记录</span>`;
  }

  function clearFilters() {
    Object.values(controls).forEach((control) => { control.value = ""; });
    lineSelection.clear();
    document.querySelectorAll("#line-filters input[type=checkbox]").forEach((input) => { input.checked = false; });
    render();
    controls.search.focus();
  }

  function wireEvents() {
    Object.values(controls).forEach((control) => control.addEventListener(control === controls.search ? "input" : "change", render));
    $("#line-filters").addEventListener("change", (event) => {
      const input = event.target.closest("input[type=checkbox]");
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
      const response = await fetch("./data/catalog.json?v=d033-d032-r04-r02", { cache: "no-store" });
      if (!response.ok) throw new Error(`目录数据请求失败（HTTP ${response.status}）`);
      catalogue = await response.json();
      products = catalogue.products || [];
      themes = catalogue.themes || [];
      if (products.length !== 84 || new Set(products.map((item) => item.dataset_id)).size !== 84) {
        throw new Error("目录候选未通过 84 个稳定键校验。");
      }
      $("#stat-products").textContent = products.length.toLocaleString("zh-CN");
      $("#stat-lines").textContent = themes.length.toLocaleString("zh-CN");
      $("#stat-assets").textContent = products.reduce((sum, product) => sum + (product.downloads || []).length, 0).toLocaleString("zh-CN");
      setupFacets();
      wireEvents();
      render();
    } catch (error) {
      $("#catalog-error").hidden = false;
      $("#catalog-error").textContent = `${error.message} 请使用本地静态服务器从 site/ 打开预览。`;
      $("#product-list").innerHTML = "";
      $("#result-count").textContent = "0";
    }
  }

  init();
})();
