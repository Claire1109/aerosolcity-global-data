/* Pure catalog operations shared by the browser and integrity checks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CatalogCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function esc(value) {return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
  function safeHref(value) {
    if (typeof value !== "string" || /[\u0000-\u0020<>"']/.test(value)) return "";
    if (/^https:\/\//i.test(value)) {try {const u=new URL(value);return u.protocol==="https:" && !u.username && !u.password ? value : "";} catch {return "";}}
    if (/^\.\/data\/(files|provenance)\/[A-Za-z0-9._/-]+$/.test(value) && !value.split("/").some(x=>x===".."||x==="." && value.indexOf(x)>0)) return value;
    return "";
  }
  function parseRoute(hash) {
    let s=String(hash||"#/").replace(/^#/,"");
    if(s==="top"||s==="")s="/";else if(s==="catalog")s="/all";else if(/^product-[A-Za-z0-9-]+$/.test(s))s="/datasets/"+s.slice(8);
    const i=s.indexOf("?");return {path:i<0?s:s.slice(0,i),params:new URLSearchParams(i<0?"":s.slice(i+1))};
  }
  function text(value) {return String(value??"").normalize("NFKC").toLowerCase();}
  function paths(id,mapping) {const m=mapping.products[id];return m ? [m.primary,...m.secondary] : [];}
  function pathLabel(route,taxonomy) {const t=taxonomy.themes.find(t=>t.id===route[0]);const s=t?.children.find(s=>s.id===route[1]);return t? t.label+(s?" / "+s.label:"") : "分类待核";}
  function score(product,query,mapping,taxonomy) {
    if(!query.trim())return 1;
    const q=text(query.trim()),title=text(product.display_name),id=text(product.dataset_id);
    const variable=text((product.variables||[]).map(v=>typeof v==="string"?v:[v.name,v.label,v.definition].join(" ")).join(" "));
    const aliases=paths(product.dataset_id,mapping).map(p=>{const t=taxonomy.themes.find(t=>t.id===p[0]),s=t?.children.find(s=>s.id===p[1]);return [t?.label,...(t?.aliases||[]),s?.label,...(s?.aliases||[])].join(" ");}).join(" ");
    const sources=text([product.publisher_author,product.source_page?.label,product.references?.article_doi,product.references?.data_record_doi,product.references?.citation,product.source_page?.url].join(" "));
    const summary=text([product.short_use_zh,product.disambiguator,product.version_label].join(" "));
    if(id===q||title===q)return 150;
    if(title.includes(q))return 100;
    if(variable.includes(q))return 80;
    if(text(aliases).includes(q))return 60;
    if(sources.includes(q))return 40;
    if(summary.includes(q)||id.includes(q))return 20;
    const terms=q.split(/\s+/).filter(Boolean),all=[title,id,variable,text(aliases),sources,summary].join(" ");
    return terms.length>1 && terms.every(t=>all.includes(t)) ? 10 : 0;
  }
  function yearMatches(axis,value) {
    if(!value)return true;const y=Number(value);if(!Number.isInteger(y))return false;
    if(axis.explicit?.length)return axis.explicit.includes(y);
    return Number.isInteger(axis.range?.start)&&Number.isInteger(axis.range?.end)&&y>=axis.range.start&&y<=axis.range.end;
  }
  function list(value) {return Array.isArray(value)?value:value?[value]:[];}
  function selectProducts(products,state,mapping,facets,taxonomy) {
    return products.map((product,i)=>({product,i,score:score(product,state.q||"",mapping,taxonomy)})).filter(({product:p,score})=>{
      if(!score)return false;const f=facets.products[p.dataset_id],ps=paths(p.dataset_id,mapping);
      if(list(state.theme).length&&!ps.some(x=>state.theme.includes(x[0])))return false;
      if(list(state.sub).length&&!ps.some(x=>state.sub.includes(x.join("/"))))return false;
      for(const key of ["frequency","spatial_form","scale_group"])if(state[key]&&f[key]!==state[key])return false;
      if(list(state.access).length&&!f.access.some(a=>state.access.includes(a)))return false;
      if(list(state.format).length&&!f.formats.some(a=>state.format.includes(a)))return false;
      for(const k of ["source_years","local_years","hosted_years"])if(!yearMatches(f.years[k],state[k]))return false;
      return true;
    }).sort((a,b)=>state.sort==="name"?a.product.display_name.localeCompare(b.product.display_name,"zh-CN"):b.score-a.score||a.i-b.i).map(x=>x.product);
  }
  function csvCell(value) {let s=String(value??"");if(/^[\s\uFEFF]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function exportCsv(products,mapping,taxonomy) {
    const rows=[["ID","名称","主分类","辅助分类","变量与单位","来源年份","本地年份","本站年份","原生空间单位","原生空间尺度","获取入口","来源"]];
    products.forEach(p=>rows.push([p.dataset_id,p.display_name,pathLabel(mapping.products[p.dataset_id].primary,taxonomy),mapping.products[p.dataset_id].secondary.map(x=>pathLabel(x,taxonomy)).join("；"),(p.variables||[]).map(v=>typeof v==="string"?v:[v.label||v.name,v.unit].filter(Boolean).join(" / ")).join("；"),JSON.stringify(p.source_years),JSON.stringify(p.local_years),JSON.stringify(p.hosted_years),p.native_spatial_unit_or_grid,p.native_spatial_resolution,p.downloads.map(a=>a.href).join("；")||p.primary_action?.url||"",p.source_page?.url||""]));
    return "\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n");
  }
  function viewRecord(variant) {
    if(variant.current_view)return variant.current_view;
    const p=variant.original_record,o=variant.approved_overlay||{};
    const record={...p,publisher_author:p.publisher_author||o.publisher||'',
      source_page:o.source_override_url?{url:o.source_override_url,label:'精确来源记录（补充核验）'}:p.source_page?.url?p.source_page:o.source_url?{url:o.source_url,label:'来源记录（补充核验）'}:p.source_page};
    for(const key of ['source_years','local_years','hosted_years']) {
      const a=variant.facets?.years[key];if(a)record[key]={values:a.explicit?.length?a.explicit:null,range:a.range||null,qualifier:a.qualifier||p[key]?.qualifier};
    }
    if(o.exact_source_doi)record.references={...p.references,data_record_doi:o.exact_source_doi};
    if(variant.source_group) {
      const s=variant.source_group;record.version_label=p.version_label+' / '+s.variant_id;
      record.short_use_zh=s.definition;record.source_temporal_resolution=s.temporal_resolution;
      record.native_spatial_resolution='当前列示文件为城市统计包；另述1km渠道不等于这些文件';
      record.variables=[{name:'UHII_'+s.variant_id,label:s.definition,unit:s.unit,period:s.years.start+'–'+s.years.end+'（社区分源声明）',definition:s.reference+'；日/夜；0.01存储比例仅社区说明，未读取RAR编码'}];
    }
    return record;
  }
  function variantScore(variant,group,query,catalog,mapping,taxonomy) {
    if(!String(query||'').trim())return 1;
    const q=text(String(query).trim()),legacy=Object.keys(catalog.migration||{}).find(id=>text(id)===q);
    if(legacy)return catalog.migration[legacy].action!=='archive'&&catalog.migration[legacy].variantID===variant.variant_id?250:0;
    const names=v=>(viewRecord(v).variables||[]).flatMap(x=>typeof x==='string'?[text(x)]:[text(x.name),text(x.label)]).filter(Boolean);
    const exactVariable=catalog.products.some(g=>g.variants.some(v=>names(v).some(n=>n.includes(q))));
    const classic=(catalog.classic_index?.indicators||[]).filter(i=>text(i.name_zh).includes(q)||text(i.slug)===q);
    if(!exactVariable&&classic.length)return classic.some(i=>i.sources.some(s=>s.canonicalID===group.dataset_id&&s.variantID===variant.variant_id))?150:0;
    // An exact variable query cannot be satisfied merely by the parent family title.
    if(exactVariable&&!names(variant).some(n=>n.includes(q)))return 0;
    const p=viewRecord(variant),vm={products:{[p.dataset_id]:mapping.products[group.dataset_id]}};
    const individual=score(p,query,vm,taxonomy),family=text([group.display_name,...(group.aliases||[])].join(' '));
    const overlay=text(JSON.stringify(variant.approved_overlay?.approved_facts||{}));
    return Math.max(individual,family.includes(q)?70:0,overlay.includes(q)?30:0,text([variant.variant_id,variant.label,variant.facets.heat_type,...(variant.facets.diurnal||[])].join(' ')).includes(q)?85:0);
  }
  function groupPathMatch(group,state,mapping) {
    const id=group.dataset_id,ps=paths(id,mapping);
    if(list(state.scope).length&&!state.scope.includes(id))return false;
    const themes=list(state.theme),oldThemes=list(state.legacy_theme);
    if((themes.length||oldThemes.length)&&!ps.some(p=>themes.includes(p[0]))&&!oldThemes.some(t=>mapping.old_themes?.[t]?.group_ids.includes(id)))return false;
    const subs=list(state.sub),oldSubs=list(state.legacy_sub);
    return !(subs.length||oldSubs.length)||ps.some(p=>subs.includes(p.join('/')))||oldSubs.some(t=>mapping.old_subthemes?.[t]?.group_ids.includes(id));
  }
  function variantMatches(variant,state) {
    const f=variant.facets;
    for(const k of ['frequency','spatial_form','scale_group'])if(state[k]&&f[k]!==state[k])return false;
    if(list(state.access).length&&!f.access.some(v=>state.access.includes(v)))return false;
    if(list(state.format).length&&!f.formats.some(v=>state.format.includes(v)))return false;
    if(state.heat_type&&f.heat_type!==state.heat_type)return false;
    if(list(state.diurnal).length&&!list(f.diurnal).some(v=>state.diurnal.includes(v)))return false;
    return ['source_years','local_years','hosted_years'].every(k=>yearMatches(f.years[k],state[k]));
  }
  function selectGroups(catalog,state,mapping,taxonomy) {
    return catalog.products.map((group,i)=>{
      if(!groupPathMatch(group,state,mapping))return null;
      const matches=group.variants.map(v=>({v,score:variantScore(v,group,state.q||'',catalog,mapping,taxonomy)}))
        .filter(x=>x.score>0&&variantMatches(x.v,state)&&(!state.indicator||catalog.classic_index?.indicators.find(i=>i.slug===state.indicator)?.sources.some(s=>s.canonicalID===group.dataset_id&&s.variantID===x.v.variant_id))).sort((a,b)=>b.score-a.score);
      return matches.length?{group,matched_variant_ids:matches.map(x=>x.v.variant_id),score:matches[0].score,i}:null;
    }).filter(Boolean).sort((a,b)=>state.sort==='name'?a.group.display_name.localeCompare(b.group.display_name,'zh-CN'):b.score-a.score||a.i-b.i);
  }
  function uniqueAssets(assets) {
    const rows=new Map();for(const a of assets){const key=a.canonical_asset_id||a.href||a.asset_id;if(!rows.has(key))rows.set(key,a);}return [...rows.values()];
  }
  function migrateRoute(route,catalog,mapping,taxonomy) {
    let path=route.path;const params=new URLSearchParams(route.params),parts=path.split('/').filter(Boolean);
    if(parts[0]==='datasets') {
      let id;try{id=decodeURIComponent(parts[1]||'');}catch{return {path:'/missing',params};}
      const explicit=catalog.variant_migration?.[id+'?variant='+params.get('variant')];if(explicit){const target=parseRoute('#'+explicit.route);path=target.path;params.delete('variant');for(const [k,v] of target.params)params.set(k,v);return {path,params};}
      const m=catalog.migration[id];
      if(m?.action==='archive')path='/archive/'+id;
      else if(m){path='/datasets/'+m.canonicalID;if(!params.has('variant'))params.set('variant',m.variantID);}
    }
    if(parts[0]==='categories'&&!taxonomy.themes.some(t=>t.id===parts[1])) {
      const key=parts.slice(1).join('/'),m=mapping.category_migrations[key];
      if(m){params.set('legacy_path',key);if(m.group_ids.length){path='/all';params.delete('scope');m.group_ids.forEach(id=>params.append('scope',id));}else{path='/archive';params.delete('archive_scope');(m.archive_ids.length?m.archive_ids:['__none__']).forEach(id=>params.append('archive_scope',id));}}
    }
    for(const [key,oldKey,index]of [['theme','legacy_theme',mapping.old_themes],['sub','legacy_sub',mapping.old_subthemes]]) {
      const values=params.getAll(key);params.delete(key);
      values.forEach(value=>params.append(index?.[value]?oldKey:key,value));
    }
    return {path,params};
  }
  function exportGroupsCsv(results,mapping,taxonomy,base='') {
    const rows=[['核心产品ID','产品名称','匹配版本ID','原记录ID','主分类','变量与单位','来源年份及说明','本地年份及说明','本站年份及说明','原生空间单位','原生尺度','当前版本文件入口','来源记录','版本详情链接','匹配版本标签','温度类型','昼夜声明','原家族来源年份（仅参考）']];
    results.forEach(({group,matched_variant_ids})=>group.variants.filter(v=>matched_variant_ids.includes(v.variant_id)).forEach(v=>{
      const p=viewRecord(v);rows.push([group.dataset_id,group.display_name,v.variant_id,(v.legacy_record_ids||[]).join(';'),pathLabel(mapping.products[group.dataset_id].primary,taxonomy),
      (p.variables||[]).map(x=>typeof x==='string'?x:[x.label||x.name,x.unit].filter(Boolean).join(' / ')).join(';'),
      JSON.stringify(p.source_years),JSON.stringify(p.local_years),JSON.stringify(p.hosted_years),p.native_spatial_unit_or_grid,p.native_spatial_resolution,
      (p.downloads||[]).map(a=>a.href).join(';')||p.primary_action?.url||'',p.source_page?.url||'',base+'#/datasets/'+group.dataset_id+'?variant='+encodeURIComponent(v.variant_id),v.label,v.facets.heat_type||'',(v.facets.diurnal||[]).join('/'),JSON.stringify(v.original_record.source_years)]);
    }));
    return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  return {esc,safeHref,parseRoute,paths,pathLabel,score,yearMatches,csvCell,viewRecord,variantScore,selectGroups,uniqueAssets,migrateRoute,exportGroupsCsv};
});
