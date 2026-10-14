(() => {
 "use strict";
 const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const href = v => typeof v === "string" && (/^https:\/\//.test(v) || /^\.\/data\/files\/[A-Za-z0-9._/-]+$/.test(v)) ? v : "";
 const supportLabels = {native_grid:"原生栅格",point:"设施点位",polygon:"设施面"};
 const publishers = {"URB-031":"Kummu及合作者（来源记录）","URB-032":"Kummu及合作者（来源记录）","URB-020":"World Resources Institute","ATM-001":"欧盟委员会/JRC（EDGAR）","LEG-005":"欧盟委员会/JRC（EDGAR）"};
 const labels = {model:"模型估计",inventory:"汇编设施记录",proxy:"代理指标",observed:"实测/统计"};
 let data, catalogue;
 function sourceLinks(i) {
  return i.source_relations.map(r => {
   if (r.source_id) {
    const s = (data.new_sources || []).find(s => s.source_id === r.source_id);
    if (!s || !["GO_STEEL_MIRROR_LINK_WITH_ATTRIBUTION","GO_OFFICIAL_LINK_HEADER_VERIFIED_ONLY"].includes(s.gate) || !href(s.href)) return '<button class="action-button" disabled>新源入口待核</button>';
    return `<article class="asset-item"><div class="asset-heading"><strong>${esc(s.title)}</strong><a href="${esc(s.href)}" target="_blank" rel="noopener noreferrer">${esc(s.download_label || "下载镜像源文件")}</a></div><p class="asset-meta">${esc(s.filename)} · ${esc(s.format)} · 发布者：${esc(s.publisher)} · ${esc(s.bytes.toLocaleString())} B</p><p>${esc(s.host_role)}</p><p>${esc(s.coverage)} · ${esc(s.years)}</p><p>${esc(s.counts)}</p><p>${esc(s.license)} · ${esc(s.citation)}</p><p>核验：${esc(s.checked_at)} · ${esc(s.verification)}</p><a href="${esc(s.source_url)}" target="_blank" rel="noopener noreferrer">${esc(s.gate === "GO_OFFICIAL_LINK_HEADER_VERIFIED_ONLY" ? "官方许可/来源说明（非文件）" : "镜像记录（非原发布者网站）")}</a></article>`;
   }
   const p = catalogue.products.find(p => p.dataset_id === r.product_id);
   const a = p?.downloads.find(a => a.asset_id === r.asset_id);
   if (!a || r.gate !== "reused_published_qualified_asset" || !href(a.href)) return '<button class="action-button" disabled>源入口待核</button>';
   const page = href(p.source_page?.url);
   return `<article class="asset-item"><div class="asset-heading"><strong>${esc(a.label || a.filename)}</strong><a href="${esc(a.href)}" target="_blank" rel="noopener noreferrer">下载源文件</a></div><p class="asset-meta">${esc(a.filename)} · ${esc(a.bytes.toLocaleString())} B · ${esc(a.access_method === "site_hosted" ? "既有本站资产" : "既有官方文件")}</p>${page ? `<a href="${esc(page)}" target="_blank" rel="noopener noreferrer">来源记录（非文件）</a>` : ""}<p>发布者：${esc(publishers[p.dataset_id] || "当前目录未明确记录，见来源记录")} · 原生格式：${esc(a.filename?.split(".").pop()?.toUpperCase() || "待核")}</p><p>来源版本：${esc(p.version_label || "版本见来源记录")} · 核验：${esc(a.checked_at || a.endpoint_evidence?.checked_at || "沿用历史发布收据，本轮未重复请求")}</p><p>${esc(i.license_note)}</p></article>`;
  }).join("");
 }
 function row(i) {
  const facts = [["物理定义",i.definition],["单位/分母",i.unit],["来源生成方法",i.generation_method],["原生坐标/支持",i.native_support],["原生尺度",i.native_resolution],["覆盖",i.coverage],["年份",i.years_note],["缺失与核验事实",i.limitations]];
  return `<article class="product-row" id="indicator-${esc(i.indicator_id)}"><div class="row-identity"><div class="identity-flags"><span>${esc(i.domain)}</span><span>${esc(labels[i.measurement_type] || i.measurement_type)}</span></div><h3>${esc(i.name_zh)}</h3><p class="row-use">${esc(i.definition)} · ${esc(i.unit)}</p></div><div class="row-scope"><span class="row-label">原生空间输入 · ${esc(supportLabels[i.support_class] || "原生支持待核")}</span><p>${esc(i.native_support)}</p><p>${esc(i.coverage)} · ${esc(i.years_note)}</p></div><div class="row-action"><span class="row-label">${esc(i.route_state === "official_header_only" ? "官方链接仅响应头核验" : i.route_state === "new_qualified_source" ? "新增源文件已核" : "既有源文件已复用")}</span><p>${esc(i.data_state)}</p><p class="row-limit">${esc(i.route_state === "official_header_only" ? "仅响应头核验；2020模型人口数，869,715,253 B；内容、校验码与原生地理信息未验证；发布方称约1km/30角秒，未读取CRS" : i.limitations)}</p></div><div class="detail-wrap"><details class="product-detail"><summary>数据定义、核验与文件</summary><div class="detail-body"><dl class="fact-list">${facts.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl><section class="detail-section"><h4>${esc(i.route_state === "reused_qualified_source" ? "既有来源复用" : "新增来源文件")} · 原始文件</h4>${sourceLinks(i)}</section></div></details></div></article>`;
 }
 function render() {
  const text = document.querySelector('#human-search').value.trim().toLowerCase();
  const domain = document.querySelector('#human-domain').value;
  const items = data.indicators.filter(i => (!domain || i.domain === domain) && (!text || JSON.stringify(i).toLowerCase().includes(text)));
  document.querySelector('#human-list').innerHTML = items.map(row).join('');
  document.querySelector('#counts').textContent = `${items.length} / ${data.indicators.length} 数据条目 · 新增来源${data.metrics.new_products} / 新增文件入口${data.metrics.new_files} · 复用${data.metrics.reused_products}个既有产品、${data.metrics.reused_assets}个资产；旧目录84记录/26文件保留`;
 }
 async function init() {
  const responses = await Promise.all([fetch('./data/human-indicators.json?v=d036-r05',{cache:'no-store'}), fetch('./data/catalog.json?v=d035-r03',{cache:'no-store'})]);
  if (responses.some(r => !r.ok)) throw new Error('数据目录未加载');
  [data,catalogue] = await Promise.all(responses.map(r => r.json()));
  if (catalogue.products.length !== 84 || catalogue.products.reduce((n,p) => n+p.downloads.length,0)!==26 || new Set(data.indicators.map(i => i.indicator_id)).size !== data.indicators.length) throw new Error('目录身份检查未通过');
  document.querySelector('#scope-note').textContent = data.scope_note;
  document.querySelector('#human-domain').insertAdjacentHTML('beforeend',[...new Set(data.indicators.map(i => i.domain))].map(d=>`<option>${esc(d)}</option>`).join(''));
  document.querySelector('#human-gaps').innerHTML = data.gaps.map(g=>`<article class="asset-item"><h3>${esc(g.domain)} · ${esc(g.name_zh)}</h3><p>${esc(g.note)}</p><button class="action-button" disabled>文件入口待核</button></article>`).join('');
  document.querySelector('#human-filters').addEventListener('submit',e=>e.preventDefault());
  document.querySelector('#human-search').addEventListener('input',render); document.querySelector('#human-domain').addEventListener('change',render);render();
 }
 init().catch(()=>{const e=document.querySelector('#human-error');e.hidden=false;e.textContent='数据目录加载或身份核验未通过。';});
})();
