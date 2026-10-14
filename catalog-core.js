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
  return {esc,safeHref,parseRoute,paths,pathLabel,score,yearMatches,selectProducts,csvCell,exportCsv};
});
