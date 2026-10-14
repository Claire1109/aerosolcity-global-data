(() => {
  "use strict";
  const C = window.CatalogCore, {esc, safeHref} = C;
  const main = document.querySelector('#main');
  let catalogue, taxonomy, mapping, facets, products = [], visibleLimit = 20;
  const LABELS = {
    frequency: {hourly:'小时（含多小时）', daily:'日', monthly:'月', annual:'年', static:'静态/快照', mixed:'混合/多期', unknown:'未知'},
    spatial_form: {grid:'格网', point:'点', line:'线', polygon:'面', aggregate:'城市/行政区汇总', mixed:'混合', unknown:'未知'},
    scale_group: {'sub-km':'已声明亚公里尺度', km:'约1公里（来源声明）', 'native-grid':'原生角度/模式/投影格网', object:'设施/对象几何', aggregate:'城市/行政区域', multiple:'多尺度版本', unknown:'未知'},
    access: {site:'本站文件', official:'官方直链/生成文件', repository:'作者/发布者仓库', mirror:'镜像文件', page:'仅官方产品页', request:'登录/申请', unknown:'待核'}
  };
  const clean = v => typeof v === 'string' && !['unknown','not verified','see release metadata'].includes(v.trim().toLowerCase()) ? v.trim() : '';
  const unique = values => [...new Set(values.map(clean).filter(Boolean))];
  const externalAttrs = href => /^https:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
  function bytesLabel(v) {if (!Number.isFinite(v)) return '大小未记录'; if (v < 1000) return v.toLocaleString()+' B'; let i=-1; const units=['kB','MB','GB','TB']; do {v/=1000; i++;} while(v>=1000 && i<3); return v.toLocaleString('zh-CN',{maximumFractionDigits:2})+' '+units[i];}
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
    const extraLinks = (product.additional_source_urls || []).filter(safeHref).map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">来源记录</a>`).join("");
    const refs = product.references || {};
    const typedDois = [
      refs.data_record_doi ? `<a href="https://doi.org/${esc(refs.data_record_doi.replace(/^https?:\/\/doi\.org\//i, ""))}" target="_blank" rel="noopener noreferrer">数据记录 DOI：${esc(refs.data_record_doi)}</a>` : "",
      refs.article_doi ? `<a href="https://doi.org/${esc(refs.article_doi.replace(/^https?:\/\/doi\.org\//i, ""))}" target="_blank" rel="noopener noreferrer">论文 DOI：${esc(refs.article_doi)}</a>` : "",
    ].filter(Boolean).join("");
    const citation = clean(refs.citation);
    const publisher = clean(product.publisher_author);
    const method = clean(product.source_method);
    if (!links && !typedDois && !citation && !publisher && !method) return "";
    return `<section class="detail-section"><h2>来源与引用</h2>${publisher ? `<p>发布者 / 作者：${esc(publisher)}</p>` : ""}${method ? `<p>来源方法：${esc(method)}</p>` : ""}${links || extraLinks ? `<p class="source-link-list">${links}${extraLinks}</p>` : ""}${typedDois ? `<p class="source-link-list">${typedDois}</p>` : ""}${citation ? `<p class="citation">${esc(citation)}</p>` : ""}</section>`;
  }

  function assetRows(product) {
    const assets = [...(product.downloads || []), ...(product.pending_downloads || [])];
    if (!assets.length) return "";
    const assetIds = new Set(assets.map((asset) => asset.asset_id));
    const provenance = (catalogue.provenance || []).filter((entry) => assetIds.has(entry.asset_id));
    const provenanceById = new Map(provenance.map((entry) => [entry.asset_id, entry]));
    return `<section class="detail-section"><h2>文件与证明</h2><div class="asset-list">${assets.map((asset) => {
      const pending = asset.publication_status === "pending";
      const href = pending ? "" : safeHref(asset.href);
      const title = asset.label || asset.filename || asset.asset_id;
      const method = asset.access_method === "official_generated_file" ? "官方生成链接" : asset.access_method === "official_direct_file" ? "官方文件" : asset.access_method === "site_hosted" ? "本站文件" : asset.access_method === "repository_file" ? "作者/发布者仓库文件" : asset.access_method === "mirror_file" ? "镜像文件" : "目录文件";
      const checksum = asset.publisher_checksum;
      const publisherValue = checksum && checksum.value ? `${checksum.algorithm || "校验值"}：${checksum.value}` : "无可用发布方校验值记录";
      const prov = provenanceById.get(asset.asset_id);
      const provHref = prov ? safeHref(prov.href) : "";
      return `<article class="asset-item${pending ? " pending-asset" : ""}"><div class="asset-heading"><strong>${esc(title)}</strong>${href ? `<a class="asset-link" href="${esc(href)}"${externalAttrs(href)}>打开文件 ↗</a>` : pending ? `<button class="action-button" type="button" disabled>官方原件入口待核</button>` : `<span class="quiet">无可用文件链接</span>`}</div><p class="asset-meta">${esc(method)}${asset.filename ? ` · ${esc(asset.filename)}` : ""}${Number.isFinite(asset.bytes) ? ` · ${esc(bytesLabel(asset.bytes))}` : ""}</p>${asset.scope_label ? `<p class="asset-meta">${esc(asset.scope_label)}</p>` : ""}${asset.access_note_zh ? `<p class="asset-meta">${esc(asset.access_note_zh)}${asset.checked_at ? ` · 核验：${esc(asset.checked_at)}` : ""}</p>` : ""}${asset.record_doi ? `<p class="asset-meta">${esc(asset.license_note_zh)} · <a href="https://doi.org/${esc(asset.record_doi)}" target="_blank" rel="noopener noreferrer">数据记录 DOI：${esc(asset.record_doi)}</a></p>` : ""}<details class="file-evidence"><summary>校验与来源证明</summary><dl class="asset-facts"><dt>资产键</dt><dd><code>${esc(asset.asset_id)}</code></dd>${asset.sha256 ? `<dt>本地 SHA-256</dt><dd><code class="hash-value">${esc(asset.sha256)}</code></dd>` : ""}<dt>发布方校验</dt><dd>${esc(publisherValue)}</dd>${provHref ? `<dt>来源证明</dt><dd><a href="${esc(provHref)}">${esc(prov.record_id || "查看公开来源证明")}</a></dd>` : ""}</dl></details></article>`;
    }).join("")}</div></section>`;
  }


  function themeById(id) {return taxonomy.themes.find(t=>t.id===id);}
  function routeHref(path,params) {return '#'+path+(params?.toString()?'?'+params.toString():'');}
  function crumb(items) {return '<nav class="breadcrumbs" aria-label="面包屑"><a href="#/">首页</a>'+items.map(([label,path])=>'<span aria-hidden="true">/</span>'+(path?'<a href="#'+esc(path)+'">'+esc(label)+'</a>':'<span aria-current="page">'+esc(label)+'</span>')).join('')+'</nav>';}
  function searchForm(value='',home=false) {return `<form class="search-form ${home?'home-search':''}" role="search" autocomplete="off"><label class="visually-hidden" for="query">搜索产品、变量或来源</label><span class="search-icon" aria-hidden="true">⌕</span><input id="query" name="q" type="search" value="${esc(value)}" placeholder="搜索产品、变量、来源或 DOI"><button type="submit">搜索 <span aria-hidden="true">↗</span></button></form>`;}
  function themeProducts(id,sub) {return products.filter(p=>C.paths(p.dataset_id,mapping).some(x=>x[0]===id&&(!sub||x[1]===sub)));}
  function activeSubs(t) {return t.children.map(s=>({...s,count:themeProducts(t.id,s.id).length})).filter(s=>s.count);}
  function homepage() {
    main.innerHTML=`<section class="home-intro"><p class="eyebrow">AerosolCity / DATA CATALOG</p><h1>全球数据资源库</h1><p class="lede">按领域浏览与检索公开数据，查看时空范围、来源及获取方式。</p>${searchForm('',true)}</section><section class="theme-grid" aria-label="七个数据主题">${taxonomy.themes.map(t=>`<article class="theme-card"><div class="theme-top"><a class="theme-title" href="#/categories/${t.id}">${esc(t.label)}</a><span class="theme-arrow" aria-hidden="true">↗</span></div><p>${esc(t.description)}</p><div class="theme-shortcuts">${activeSubs(t).slice(0,4).map(s=>`<a href="#/categories/${t.id}/${s.id}">${esc(s.label)}</a>`).join('')}</div><p class="theme-count">${themeProducts(t.id).length} 个数据产品</p></article>`).join('')}</section><p id="catalog-stats" class="catalog-stats">${products.length} 个数据产品 <span>·</span> ${products.flatMap(p=>p.downloads).length} 项文件记录 <span>·</span> ${products.flatMap(p=>p.downloads).filter(a=>a.access_method==='site_hosted').length} 项本站文件</p>`;
    wireSearch('/search');
  }
  function getState(params) {const s={q:params.get('q')||'',sort:params.get('sort')||''};for(const k of ['theme','sub','format','access'])s[k]=params.getAll(k);for(const k of ['frequency','spatial_form','scale_group','source_years','local_years','hosted_years'])s[k]=params.get(k)||'';return s;}
  function selectControl(key,title,state) {const vals=[...new Set(Object.values(facets.products).map(f=>f[key]))];return `<label class="filter-control" for="${key}"><span>${title}</span><select id="${key}" name="${key}"><option value="">不限</option>${vals.map(v=>`<option value="${esc(v)}"${state[key]===v?' selected':''}>${esc(LABELS[key]?.[v]||v)}</option>`).join('')}</select></label>`;}
  function checkGroup(name,title,entries,state) {return `<fieldset class="filter-fieldset"><legend>${title}</legend><div class="filter-options">${entries.map(([v,label])=>`<label><input type="checkbox" name="${name}" value="${esc(v)}"${(state[name]||[]).includes(v)?' checked':''}><span>${esc(label)}</span></label>`).join('')}</div></fieldset>`;}
  function filters(state) {return `<form id="filters" autocomplete="off"><details id="more-filters"><summary>筛选条件 <span class="quiet">主题、年份、空间与获取方式</span></summary><div class="filters-body">${checkGroup('theme','主题（可多选）',taxonomy.themes.map(t=>[t.id,t.label]),state)}${checkGroup('sub','子主题（可跨领域多选）',taxonomy.themes.flatMap(t=>activeSubs(t).map(s=>[t.id+'/'+s.id,t.label+' / '+s.label])),state)}<div class="filter-grid">${[['source_years','来源年份'],['local_years','本地取得年份'],['hosted_years','本站文件年份']].map(([key,label])=>`<label class="filter-control" for="${key}"><span>${label}</span><input type="number" id="${key}" name="${key}" min="1000" max="2200" placeholder="不限" value="${esc(state[key])}"></label>`).join('')}${selectControl('frequency','来源时间步长',state)}${selectControl('spatial_form','空间形式',state)}${selectControl('scale_group','空间尺度组',state)}</div><p class="filter-note">年份范围匹配仅表示记录覆盖范围，不表示该年有完整或已核验文件；明确年份优先，详情保留原始范围说明。</p>${checkGroup('access','获取方式',Object.entries(LABELS.access),state)}${checkGroup('format','原始格式（可多选）',[...new Set(Object.values(facets.products).flatMap(f=>f.formats))].sort().map(f=>[f,f==='UNKNOWN'?'未知':f]),state)}</div></details></form>`;}
  function activeFilters(state) {const names={q:'搜索',theme:'主题',sub:'子主题',format:'格式',access:'获取',frequency:'时间步长',spatial_form:'空间形式',scale_group:'尺度',source_years:'来源年份',local_years:'本地年份',hosted_years:'本站年份'};return Object.entries(names).flatMap(([key,label])=>{const vals=Array.isArray(state[key])?state[key]:state[key]?[state[key]]:[];return vals.map(v=>{const text=key==='theme'?themeById(v)?.label:key==='sub'?C.pathLabel(v.split('/'),taxonomy):LABELS[key]?.[v]||v;return `<button type="button" class="filter-chip" data-remove-key="${key}" data-remove-value="${esc(v)}" aria-label="移除${esc(label)}：${esc(text)}">${esc(label)}：${esc(text)} <span aria-hidden="true">×</span></button>`;});}).join('');}
  function accessText(p) {return facets.products[p.dataset_id].access.map(a=>LABELS.access[a]).join(' / ');}
  function productRow(p) {const id=p.dataset_id;return `<article class="product-row" data-id="${esc(id)}"><div class="product-summary"><div class="record-id"><code>${esc(id)}</code><span>${esc(C.pathLabel(mapping.products[id].primary,taxonomy))}</span></div><h2><a data-detail href="#/datasets/${esc(id)}">${esc(p.display_name)}</a></h2><p class="row-description">${esc(p.short_use_zh)}</p><div class="row-facts"><span>${esc(yearText(p,'source_years')||'来源年份待核')}</span><span>${esc(p.native_spatial_resolution||p.native_spatial_unit_or_grid||'原生尺度待核')}</span></div></div><div class="row-access"><span>${esc(accessText(p))}</span><a class="detail-link" data-detail href="#/datasets/${esc(id)}">查看详情 <span aria-hidden="true">→</span></a></div></article>`;}
  function listPage(route) {
    const parts=route.path.split('/').filter(Boolean),isTheme=parts[0]==='categories',theme=isTheme?themeById(parts[1]):null,sub=theme?.children.find(s=>s.id===parts[2]);
    if(isTheme&&(!theme||(parts[2]&&!sub))) {missing();return;}
    const state=getState(route.params),effective={...state};if(theme && !state.theme.length && !state.sub.length) {effective.theme=[theme.id];if(sub)effective.sub=[theme.id+'/'+sub.id];}
    const filtered=C.selectProducts(products,effective,mapping,facets,taxonomy);const title=theme?(sub?.label||theme.label):parts[0]==='search'?'搜索结果':'全部数据';
    const breadcrumbs=theme?(sub?[[theme.label,'/categories/'+theme.id],[sub.label,null]]:[[theme.label,null]]):[[title,null]];
    main.innerHTML=`${crumb(breadcrumbs)}<section class="page-intro"><p class="eyebrow">${theme?'按领域浏览':'全局目录'}</p><h1>${esc(title)}</h1><p class="lede">${theme?esc(theme.description):'检索产品、变量、机构与 DOI，按记录中的客观信息筛选。'}</p>${theme?`<p class="page-count">${themeProducts(theme.id,sub?.id).length} 个独立产品</p>`:''}</section>${theme?`<nav class="subtheme-nav" aria-label="子主题"><a href="#/categories/${theme.id}"${!sub?' aria-current="page"':''}>全部</a>${activeSubs(theme).map(s=>`<a class="subtheme-link" href="#/categories/${theme.id}/${s.id}"${sub?.id===s.id?' aria-current="page"':''}>${esc(s.label)} <small>${s.count}</small></a>`).join('')}</nav>`:''}${searchForm(state.q)}${filters(state)}<div class="results-toolbar"><p class="result-total"><strong id="result-count">${filtered.length}</strong> 条匹配记录</p><div class="result-actions"><label class="sort-control">排序<select id="sort"><option value="">${state.q?'相关度':'目录顺序'}</option><option value="name"${state.sort==='name'?' selected':''}>名称</option></select></label><button id="export-csv" type="button">导出 CSV ↓</button><button id="clear-filters" type="button">清除筛选</button></div></div><div class="active-filters">${activeFilters(state)}</div><section id="product-list" aria-label="产品列表">${filtered.slice(0,visibleLimit).map(productRow).join('')}</section>${filtered.length===0?'<div id="empty-state" class="empty-state"><h2>没有找到匹配记录</h2><p>减少筛选条件，或换一个产品名、变量名或 ID。</p><a class="button" href="#/all">浏览全部数据</a></div>':''}${filtered.length>visibleLimit?`<button id="load-more" class="load-more" type="button">加载更多（已显示 ${visibleLimit} / ${filtered.length}）</button>`:''}`;
    wireSearch(route.path);
    function update(params) {const path=theme && (params.getAll('theme').length || params.getAll('sub').length) ? '/all' : route.path; location.hash=routeHref(path,params);}
    document.querySelector('#filters').addEventListener('submit',e=>e.preventDefault());
    document.querySelector('#filters').addEventListener('change',()=>{const params=new URLSearchParams(route.params);for(const k of ['theme','sub','format','access','frequency','spatial_form','scale_group','source_years','local_years','hosted_years'])params.delete(k);for(const [key,val]of new FormData(document.querySelector('#filters')))if(String(val).trim())params.append(key,val);update(params);});
    document.querySelector('#sort').addEventListener('change',e=>{const params=new URLSearchParams(route.params);params.set('sort',e.target.value);update(params);});
    document.querySelector('#clear-filters').addEventListener('click',()=>{location.hash='#/all';if(route.path==='/all'&&!route.params.toString())listPage(route);});
    main.querySelectorAll('[data-remove-key]').forEach(b=>b.addEventListener('click',()=>{const params=new URLSearchParams(route.params),key=b.dataset.removeKey;const keep=params.getAll(key).filter(v=>v!==b.dataset.removeValue);params.delete(key);keep.forEach(v=>params.append(key,v));update(params);}));
    document.querySelector('#load-more')?.addEventListener('click',()=>{const previous=visibleLimit;visibleLimit+=20;listPage(route);main.querySelectorAll('.product-row')[previous]?.querySelector('a')?.focus({preventScroll:true});});
    document.querySelector('#export-csv').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([C.exportCsv(filtered,mapping,taxonomy)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='AerosolCity-catalog.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  }
  function datasetPage(id) {
    const p=products.find(p=>p.dataset_id===id);if(!p) {missing();return;}
    const path=mapping.products[id].primary,theme=themeById(path[0]),sub=theme?.children.find(s=>s.id===path[1]);const paths=C.paths(id,mapping).filter(x=>x.length===2);
    const action=p.primary_action||{},primaryHref=safeHref(action.url),noFiles=!p.downloads.length;
    const access=noFiles&&primaryHref?`<p class="access-note"><a href="${esc(primaryHref)}"${externalAttrs(primaryHref)}>${esc(action.kind==='login_or_request'?'登录/申请入口':'官方产品页')} ↗</a> <span>此入口是来源页面，不能视为已核实文件下载。</span></p>`:noFiles?'<p class="access-note">暂无已核实文件入口。来源信息见下方。</p>':'';
    main.innerHTML=`${crumb([...(theme?[[theme.label,'/categories/'+theme.id],[sub.label,'/categories/'+theme.id+'/'+sub.id]]:[]),[id,null]])}<header class="dataset-header"><div class="record-id"><code>${esc(id)}</code>${p.display_identity_note?`<span>${esc(p.display_identity_note)}</span>`:''}</div><h1>${esc(p.display_name)}</h1><p class="lede">${esc(p.short_use_zh)}</p><p class="version-line">${esc(p.version_label)}</p><div class="detail-quickfacts"><span>来源年份：${esc(yearText(p,'source_years')||'待核')}</span><span>原生尺度：${esc(p.native_spatial_resolution||p.native_spatial_unit_or_grid||'待核')}</span><span>获取方式：${esc(accessText(p))}</span></div><div class="detail-tools"><button id="jump-files" type="button">查看文件与获取方式 ↓</button><button id="copy-link" type="button">复制详情链接</button><span id="copy-status" role="status"></span></div>${paths.length?`<div class="detail-paths">${paths.map(x=>`<a href="#/categories/${x.join('/')}">${esc(C.pathLabel(x,taxonomy))}</a>`).join('')}</div>`:''}</header><div id="dataset-details"><section class="detail-section"><h2>变量与单位</h2>${variableRows(p)||'<p>变量信息待核。</p>'}</section><section class="detail-section"><h2>年份与原生空间支持</h2><dl class="axis-grid">${['source_years','local_years','hosted_years'].map((key,i)=>`<div class="axis-cell"><dt>${['来源覆盖年份','本地已取得年份','本站文件年份'][i]}</dt><dd>${esc(yearText(p,key)||'未记录明确年份')}</dd></div>`).join('')}</dl>${scopeFacts(p)}<p class="inline-note">${esc(p.local_scope_note_zh)}</p></section><section id="files-access" class="detail-section" tabindex="-1"><h2>文件与获取方式</h2><p class="access-note">${esc(accessText(p))}。每个文件的实际范围和核验说明分别记录。</p>${access}${assetRows(p).replace('<section class="detail-section"><h2>文件与证明</h2>','<div class="file-section">').replace(/<\/section>$/,'</div>')}</section>${sourceBlock(p)}<section class="detail-section"><h2>许可、覆盖限制与核验说明</h2><p>${esc(p.license_note_zh||'许可待核，使用前查看来源条款。')}</p><p>${esc(p.quality_note_zh)}</p>${p.main_limitation_zh!==p.quality_note_zh?`<p>${esc(p.main_limitation_zh)}</p>`:''}</section><details id="technical-evidence" class="technical-evidence"><summary>技术证明与完整原始元数据</summary><p>以下保留此记录全部原始字段，以及对应的来源证明记录；校验值与证据状态不因分类改变。</p><pre id="raw-product">${esc(JSON.stringify(p,null,2))}</pre><h3>来源证明记录</h3><pre>${esc(JSON.stringify((catalogue.provenance||[]).filter(a=>[...(p.downloads||[]),...(p.pending_downloads||[])].some(x=>x.asset_id===a.asset_id)),null,2))}</pre></details></div>`;
    document.querySelector('#jump-files').addEventListener('click',()=>{const section=document.querySelector('#files-access');section.focus({preventScroll:true});section.scrollIntoView({block:'start'});});
    document.querySelector('#copy-link').addEventListener('click',async()=>{const url=new URL(location.href);url.hash='/datasets/'+id;const status=document.querySelector('#copy-status');try {await navigator.clipboard.writeText(url.href);status.textContent='已复制';} catch {status.innerHTML='<label>详情链接<input readonly value="'+esc(url.href)+'"></label>';status.querySelector('input').select();}});
  }
  function guide() {const allAssets=products.flatMap(p=>p.downloads),hosted=allAssets.filter(a=>a.access_method==='site_hosted'),hostedBytes=hosted.reduce((n,a)=>n+a.bytes,0);main.innerHTML=`${crumb([['使用说明',null]])}<section class="guide page-intro"><p class="eyebrow">目录说明</p><h1>使用说明</h1><section><h2>数据在哪里</h2><p>本站文件：${hosted.length} 项文件，合计约 ${Math.round(hostedBytes/1000000)} MB（${hostedBytes.toLocaleString('zh-CN')} B），保存在 GitHub 仓库并通过 GitHub Pages 公开。可分享本网站链接；访客无需连接维护者电脑。</p><p>外部文件：${allAssets.length-hosted.length} 个入口由官方、作者仓库或镜像来源提供，文件保存在相应来源，不是本站上传。许可、登录要求和可用性以来源为准；外部入口不表示每份文件都已完整读取或核验。</p><p>“本地已取得”表示维护者保存过对应数据，不等于已上传本站。公开网页不会访问维护者电脑上的本地文件。请分别查看来源范围、本地范围和本站文件范围。</p></section><section><h2>按主题浏览，按变量查找</h2><p>从首页进入七个主题，再选择子主题。一个产品可以出现在多个相关目录中，所有路径都指向同一详情页。全部数据和搜索也保留尚待归类的记录。</p></section><section><h2>先看范围，再打开文件</h2><p>产品、变量、文件是不同层级。来源覆盖、本地已取得与本站文件年份分别列示；年份范围不保证每个中间年都有完整或已核验文件。格网、设施、城市和国家汇总保留各自原生空间支持。</p></section><section><h2>获取方式与证据</h2><p>本站文件、官方直链、作者仓库、来源产品页及登录申请明确区分。文件头、仓库清单或官方生成路线只表示对应的证据范围，不等于完整文件内容验收。查看每个文件的核验说明及折叠的校验与来源证明。</p></section><section><h2>分享与导出</h2><p>详情页可以复制链接。列表页可导出当前匹配结果 CSV，查询条件保留在网址中，可刷新或使用浏览器前进后退。</p></section><section><h2>许可与引用</h2><p>使用数据前查看发布方条款及各记录的许可，按原作者要求署名与引用。未知单位、版本或核验状态以详情中的事实说明为准。</p></section></section>`;}
  function missing() {main.innerHTML=crumb([['记录未找到',null]])+'<section class="empty-state"><h1>找不到这条记录</h1><p>链接中的产品或分类不存在。可从全部数据重新查找。</p><a class="button" href="#/all">浏览全部数据</a></section>';}
  function wireSearch(path) {main.querySelector('.search-form')?.addEventListener('submit',e=>{e.preventDefault();const params=new URLSearchParams(C.parseRoute(location.hash).params);params.set('q',new FormData(e.target).get('q').trim());location.hash=routeHref(path,params);});}
  function datasetRoute(path) {try {const id=decodeURIComponent(path.split('/')[2]||'');if(!/^[A-Z]+-[0-9]+$/.test(id))return missing();datasetPage(id);} catch {missing();}}
  document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();main.focus();});
  function render() {
    if(!catalogue)return;const route=C.parseRoute(location.hash);if(location.hash&&location.hash!==routeHref(route.path,route.params))history.replaceState(null,'',routeHref(route.path,route.params));
    const oldFilters=document.querySelector('#more-filters')?.open,focusId=document.activeElement?.id;
    if(route.path==='/')homepage();else if(route.path==='/guide')guide();else if(route.path.startsWith('/datasets/'))datasetRoute(route.path);else if(route.path==='/all'||route.path==='/search'||route.path.startsWith('/categories/'))listPage(route);else missing();
    document.querySelector('#more-filters')?.toggleAttribute('open',!!oldFilters);
    document.querySelectorAll('.site-nav a').forEach(a=>{if(a.getAttribute('href')==='#'+route.path)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    const heading=document.querySelector('h1')?.textContent||'全球数据资源库';document.title=(heading==='全球数据资源库'?heading:heading+' | 全球数据资源库')+' · AerosolCity';
    if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
  }
  async function init() {try {const data=await Promise.all(['catalog','taxonomy','product-taxonomy','normalized-facets'].map(async name=>{const r=await fetch('./data/'+name+'.json?v=d040-v1');if(!r.ok)throw new Error('目录读取失败（HTTP '+r.status+'）');return r.json();}));[catalogue,taxonomy,mapping,facets]=data;products=catalogue.products;const ids=products.map(p=>p.dataset_id),assets=products.flatMap(p=>p.downloads||[]);if(new Set(ids).size!==ids.length||new Set(assets.map(a=>a.asset_id)).size!==assets.length||catalogue.counts.products!==ids.length||catalogue.counts.assets!==assets.length||ids.some(id=>!mapping.products[id]||!facets.products[id]))throw new Error('目录身份或分类检查未通过');render();} catch(e) {main.innerHTML=`<section class="empty-state" role="alert"><h1>目录暂时无法读取</h1><p>${esc(e.message)}。请重新加载页面。</p><button id="retry" type="button">重新加载</button></section>`;document.querySelector('#retry').addEventListener('click',()=>location.reload());}}
  window.addEventListener('hashchange',()=>{visibleLimit=20;render();window.scrollTo(0,0);});init();

})();
