"use strict";
/* ================= КАТАЛОГ АКТИВОВ ================= */
let assetTab = "land";
function viewAssets(){
  const t=(k,l)=>`<span class="tab ${assetTab===k?"on":""}" style="border:1px solid var(--line);border-radius:8px;margin-right:6px" onclick="assetTab='${k}';render()">${l}</span>`;
  let h=`<h2>Каталог активов</h2><div style="margin-bottom:14px">${t("land","Земельные участки ("+LAND.length+")")}${t("ec","Энергоцентры ГПУ ("+EC.length+")")}${t("dc","ЦОД — проекты консорциума ("+DC.length+")")}${t("dcreg","Рынок ЦОД РФ ("+DCREG.length+")")}</div>`;
  if(assetTab==="dcreg"){
    const stc=s=>s.startsWith("Действует")?"gr":(s.startsWith("Строится")||s.includes("расширение")?"am":"");
    h+=`<div class="muted" style="margin-bottom:10px">Существующие и планируемые ЦОД РФ по публичным данным (рейтинги ComNews/TAdviser, сайты операторов; проверено 07.07.2026). Рынок: ~4 ГВт суммарной мощности по итогам 2025 г. (+33% к 2024), ~128 проектов в работе с инвестициями ~1 трлн ₽. Значения с пометкой «оценочно» не подтверждены операторами. Все объекты — на вкладке «Карта размещения».</div><div class="grid g3">`+
    DCREG.map((a,i)=>`<div class="card" onclick="openDcReg(${i})" style="cursor:pointer">
      <h3>${a.n}</h3><div class="muted">${a.oper} · ${a.city}</div>
      <div style="margin:8px 0"><span class="tag am">${a.racks}</span><span class="tag">${a.mw}</span><span class="tag">${a.tier}</span></div>
      <div class="muted">${a.note}</div>
      <div style="margin-top:8px"><span class="tag ${stc(a.st)}">${a.st}</span></div></div>`).join("")+"</div>";
    return h;
  }
  const dot=s=>s==="Свободен"||s.includes("Типовая")||s.includes("Проверенная")?"var(--green)":(s.includes("резерв")||s.includes("Эксплуат")?"var(--amber)":"var(--cyan)");
  if(assetTab==="land"){
    const defMW=SCORE_MW||(LAST_CALC?Math.round((PSRC.gpu?LAST_CALC.ecMW:LAST_CALC.full)*10)/10:16);
    h+=`<div class="card" style="margin-bottom:14px"><b>Скоринг площадок под проект.</b> <span class="tag ${PSRC.gpu?"am":"gr"}">режим: ${PSRC.gpu?"собственная генерация (ГПУ)":"питание от сети"}</span>
      <span class="muted">Укажите требуемую мощность (${PSRC.gpu?"ЭЦ":"сетевую, по пиковому потреблению"}) — участки будут оценены (0-100) и отсортированы: газ, сеть, оптика и независимость вводов ВОЛС, ВРИ, обременения, статус. Режим скоринга определяется источниками питания в конфигураторе.</span>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label class="muted">Требуемая мощность, МВт:</label><input type="number" id="scoreMW" value="${defMW}" step="0.5" style="width:90px">
        <button class="btn" onclick="runScoring()">Рассчитать скоринг</button>
        ${SCORE_MW?`<button class="btn sec" onclick="SCORE_MW=null;render()">Сбросить</button><span class="tag am">отсортировано по баллу для ЭЦ ${SCORE_MW} МВт</span>`:""}
      </div></div>`;
    let items=LAND.slice();
    if(SCORE_MW) items.sort((a,b)=>scoreLand(b,SCORE_MW).total-scoreLand(a,SCORE_MW).total);
    h+=`<div class="grid g3">`+items.map(a=>{
      const sc=SCORE_MW?scoreLand(a,SCORE_MW):null;
      return `<div class="card" onclick="openAsset('land','${a.id}')" style="cursor:pointer">
      <div style="display:flex;justify-content:space-between;gap:6px"><h3>${a.name}</h3>
        ${sc?`<span onclick="event.stopPropagation();openScore('${a.id}')" title="разбивка скоринга" style="cursor:pointer;font-weight:700;font-size:16px;color:${scoreColor(sc.total)}">${sc.total}</span>`:""}</div>
      <div class="muted">${a.region}</div>
      <div style="margin:8px 0"><span class="tag">${a.area} га</span><span class="tag am">${a.powerMW} МВт</span><span class="tag">газ ${fmt(a.gasM3h,0)} нм³/ч</span><span class="tag">оптика ${a.fiberKm} км</span></div>
      <div class="muted">ВРИ: ${a.vri}</div><div class="muted">Кадастр: ${a.cad}</div>
      <div style="margin-top:8px"><span class="status-dot" style="background:${dot(a.status)}"></span>${a.status} · <b>${a.price.split("(")[0]}</b></div>
      ${sc?`<div class="muted" style="margin-top:6px;cursor:pointer" onclick="event.stopPropagation();openScore('${a.id}')">Скоринг: <b style="color:${scoreColor(sc.total)}">${sc.total}/100</b> · показать разбивку</div>`:""}</div>`;
    }).join("")+"</div>"; return h;
  }
  h+=`<div class="grid g3">`;
  if(assetTab==="ec") h+=EC.map(a=>`<div class="card" onclick="openAsset('ec','${a.id}')" style="cursor:pointer">
      <h3>${a.name}</h3><div class="muted">${a.units}</div>
      <div style="margin:8px 0"><span class="tag am">${a.power} МВт</span><span class="tag">КПД ${a.elEff}%</span><span class="tag">${a.costKwh} ₽/кВтч</span><span class="tag gr">окуп. ${a.payback} г.</span></div>
      <div class="muted">CAPEX: ${fmt(a.capex,0)} млн ₽ (${a.capexKw} тыс ₽/кВт) · стройка ${a.build}</div>
      <div style="margin-top:8px"><span class="status-dot" style="background:${dot(a.status)}"></span>${a.status} · ${a.owner}</div></div>`).join("");
  if(assetTab==="dc") h+=DC.map(a=>`<div class="card" onclick="openAsset('dc','${a.id}')" style="cursor:pointer">
      <h3>${a.name}</h3><div class="muted">${a.tier}</div>
      <div style="margin:8px 0"><span class="tag am">${a.itMW} МВт IT</span><span class="tag">${a.racks} стоек</span><span class="tag">PUE ${a.pue}</span><span class="tag">${a.kwRack} кВт/стойка</span></div>
      <div class="muted">${a.cooling}</div>
      <div style="margin-top:8px"><span class="status-dot" style="background:${dot(a.status)}"></span>${a.status}</div></div>`).join("");
  return h+"</div>";
}

/* карточка актива: все параметры, для владельца — редактирование (manual override данных) */
function openAsset(kind,id){
  const src = kind==="land"?LAND:(kind==="ec"?EC:DC);
  const a = src.find(x=>x.id===id);
  const canEdit = OWNER_ROLE[kind].includes(role);
  const rows = FIELD_LABELS[kind].filter(([k])=>a[k]!==undefined).map(([k,l])=>{
    const v=a[k];
    const cell = canEdit? `<input value="${String(v).replace(/"/g,"&quot;")}" onchange="editAsset('${kind}','${id}','${k}',this.value)">` : `<span class="pv">${v}</span>`;
    return `<tr><th style="width:45%">${l}</th><td>${cell}</td></tr>`;
  }).join("");
  document.getElementById("modalBox").innerHTML = `
    <span class="x" onclick="closeModal()">×</span>
    <h2>${a.name}</h2>
    <div class="muted" style="margin-bottom:10px">${canEdit?"Режим владельца: значения редактируются вручную (manual override) и сохраняются в каталоге прототипа.":"Просмотр. Редактирование доступно правообладателю актива и УК."}</div>
    <table class="${canEdit?"editable":""}">${rows}</table>
    <div style="margin-top:14px">
      ${kind!=="land"?`<button class="btn sec" onclick="closeModal();setTab('calc')">Проверить экономику в конфигураторе</button> `:""}
      <button class="btn" onclick="alert('Запрос направлен в УК. В Production-версии — создание результативного контакта с фиксацией в журнале.')">Запросить контакт по активу</button>
    </div>`;
  document.getElementById("modalBg").style.display="flex";
}
function editAsset(kind,id,k,v){
  const src = kind==="land"?LAND:(kind==="ec"?EC:DC);
  const a=src.find(x=>x.id===id);
  a[k]=isNaN(parseFloat(v))||/[^\d\s.,\-]/.test(v)?v:parseFloat(String(v).replace(",","."));
}

/* ================= СКОРИНГ ПЛОЩАДОК ================= */
let SCORE_MW = null;
function scoreLand(a,reqMW){
  const gpuMode=PSRC.gpu;              // режим скоринга следует за выбором источников питания
  const LS=DB.getLandScore();          // веса и удельный расход газа — настройки администратора
  const w=gpuMode?LS.gpu:LS.grid;
  const reqGas=reqMW*LS.gasRatePerMW;  // нм³/ч
  const dualOk=String(a.fiberDual||"").startsWith("Да");
  const sub=[];
  const add=(name,score,wt)=>{if(!wt)return 0;sub.push([name,Math.round(score),wt]);return score*wt;};
  let s=0,W=0;
  s+=add("Газ: лимит vs потребность",Math.min(100,a.gasM3h/reqGas*100),w.gas);W+=w.gas;
  if(w.grs){s+=add("Газ: близость ГРС",Math.max(0,100-Math.max(0,a.grsKm-1)*11),w.grs);W+=w.grs;}
  s+=add(gpuMode?"Сеть: резервная мощность":"Сеть: мощность vs полная потребность",Math.min(100,a.powerMW/(reqMW*(gpuMode?0.5:1))*100),w.grid);W+=w.grid;
  s+=add("Оптика: близость",Math.max(0,100-Math.max(0,a.fiberKm-0.3)*30),w.fib);W+=w.fib;
  s+=add("Оптика: независимые вводы",dualOk?100:40,w.dual);W+=w.dual;
  s+=add("ВРИ",/6\.7|6\.8/.test(a.vri)?100:(/6\.0|6\.9/.test(a.vri)?80:50),w.vri);W+=w.vri;
  s+=add("Обременения",a.encumb==="Нет"?100:60,w.encumb);W+=w.encumb;
  s+=add("Статус",a.status==="Свободен"?100:(a.status==="Переговоры"?70:30),w.status);W+=w.status;
  s+=add("Транспортная доступность",a.cityKm<=20?100:(a.cityKm<=60?70:50),w.transport);W+=w.transport;
  return {total:Math.round(s/W),sub,reqGas,gpuMode};
}
function runScoring(){
  const v=parseFloat(document.getElementById("scoreMW").value);
  if(!v||v<=0){alert("Укажите требуемую мощность ЭЦ, МВт");return;}
  SCORE_MW=v;render();
}
function scoreColor(t){return t>=75?"var(--green)":(t>=55?"var(--amber)":"var(--red)");}
function openScore(id){
  const a=LAND.find(x=>x.id===id), r=scoreLand(a,SCORE_MW);
  document.getElementById("modalBox").innerHTML=`<span class="x" onclick="closeModal()">×</span>
    <h2>Скоринг: ${a.name} — <span style="color:${scoreColor(r.total)}">${r.total}/100</span></h2>
    <div class="muted" style="margin-bottom:10px">Режим: ${r.gpuMode?"под собственную генерацию (ГПУ): газ ≈ "+fmt(r.reqGas,0)+" нм³/ч (0,267 нм³/кВтч)":"под питание от сети: приоритет сетевой мощности и связности"}. Режим следует за выбором источников питания в конфигураторе. Веса критериев настраиваются администратором.</div>
    <table><tr><th>Критерий</th><th>Балл (0-100)</th><th>Вес, %</th></tr>
    ${r.sub.map(x=>`<tr><td>${x[0]}</td><td style="color:${scoreColor(x[1])}">${x[1]}</td><td>${x[2]}</td></tr>`).join("")}</table>`;
  document.getElementById("modalBg").style.display="flex";
}
