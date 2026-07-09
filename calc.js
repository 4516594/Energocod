"use strict";
/* ================= КОНФИГУРАТОР ================= */
/* --- Источники питания: любая комбинация, живой расчёт категории и Tier --- */
let PSRC = DB.getPsrc();
function powerStatus(){
  const p=PSRC, srcs=(p.grid1?1:0)+(p.grid2?1:0)+(p.gpu?1:0);
  let cat,catCls;
  if(srcs===0){cat="источник основного питания не выбран — схема неработоспособна";catCls="rd";}
  else if(srcs>=2&&p.dgu){cat="I категория, особая группа (два независимых источника + автономный третий)";catCls="gr";}
  else if(srcs>=2){cat="I категория (два независимых источника)";catCls="gr";}
  else if(p.dgu){cat="II категория (один источник + автономный резерв)";catCls="am";}
  else {cat="III категория (один источник, без резерва)";catCls="rd";}
  let tier,tierCls;
  if(srcs===0){tier="—";tierCls="rd";}
  else if(!p.ups){tier="вне классификации Tier: без СБЭ (ИБП) нагрузка не защищена от провалов при переключениях";tierCls="rd";}
  else if(!p.dgu&&!p.gpu){tier="Tier I: есть СБЭ, но нет автономного источника на длительный перерыв";tierCls="rd";}
  else if(p.dgu&&srcs>=2){tier="до Tier III при N+1 (ИБП, ДГУ, охлаждение) и обслуживании без остановки; при 2N компонентов — потенциал Tier IV";tierCls="gr";}
  else {tier="до Tier II: одиночный путь питания; для Tier III добавьте второй независимый источник";tierCls="am";}
  return {cat,catCls,tier,tierCls,srcs};
}
function powerVerdictHtml(){
  const s=powerStatus();
  const c={gr:"var(--green)",am:"var(--amber)",rd:"var(--red)"};
  return `<div style="margin-top:8px;padding:10px 12px;background:var(--card2);border-radius:8px">
    <div><span class="muted">Категория надёжности электроснабжения (ПУЭ):</span> <b style="color:${c[s.catCls]}">${s.cat}</b></div>
    <div style="margin-top:4px"><span class="muted">Достижимый уровень Tier (Uptime):</span> <b style="color:${c[s.tierCls]}">${s.tier}</b></div>
    <div class="muted" style="margin-top:4px">Экспресс-оценка по составу источников; фактический Tier определяется резервированием всех систем и подтверждается сертификацией.</div></div>`;
}
function togglePsrc(k){
  PSRC[k]=!PSRC[k];
  DB.setPsrc(PSRC);
  const v=document.getElementById("powerVerdict"); if(v) v.innerHTML=powerVerdictHtml();
  calc();
}
function viewCalc(){
  const psBoxes=PSRC_ITEMS.map(([k,l,d])=>`
    <label style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;cursor:pointer">
      <input type="checkbox" ${PSRC[k]?"checked":""} onchange="togglePsrc('${k}')" style="margin-top:3px;accent-color:#3DD6F5">
      <span><b>${l}</b><br><span class="muted" style="font-size:11.5px">${d}</span></span>
    </label>`).join("");
  const rows=DB.getParams().map(p=>`
    <div class="prow">
      <div class="plabel">${p.l} <span class="punit">${p.u}</span></div>
      <input type="range" id="${p.id}_r" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.v}" oninput="syncP('${p.id}',true)">
      <input type="number" id="${p.id}" step="${p.step}" value="${p.v}" oninput="syncP('${p.id}',false)">
      <span class="ovr" id="${p.id}_o">override</span>
    </div>`).join("");
  const presets=Object.keys(DB.getPresets()).map(k=>`<span class="tag preset" onclick="applyPreset('${k}')">${k}</span>`).join(" ");
  return `<h2>Конфигуратор проекта «ЦОД + энергоцентр»</h2>
  <div class="muted" style="margin-bottom:10px">Каждый параметр: ползунок в типовом диапазоне + поле ручного ввода. Значение за пределами диапазона допустимо — помечается меткой <span class="tag am">override</span>. Пресеты: ${presets}</div>
  <div class="split">
    <div class="card">
      <h3>Источники питания — соберите любую комбинацию</h3>
      ${psBoxes}
      <div id="powerVerdict">${powerVerdictHtml()}</div>
      <hr class="sep">
      <h3>Параметры (ползунок или ручной ввод)</h3>${rows}
      <div class="muted" style="margin-top:8px">Все суммы без НДС (НДС 22%). Значения по умолчанию задаются администратором платформы глобально; ручной ввод в конкретной заявке имеет приоритет (manual override). Допущения расчёта: персонал ЭЦ = 2% CAPEX ЭЦ/год · обслуживание ЦОД = 1,5% CAPEX ЦОД/год · страхование = 0,4% CAPEX/год · LCOE на 10 лет без дисконтирования.</div>
    </div>
    <div>
      <div class="grid g4" id="calcKpi" style="margin-bottom:14px"></div>
      <div class="card"><h3>Структура OPEX, млн ₽/год</h3><div id="opexBars"></div></div>
      <div class="card" style="margin-top:14px"><h3>Сводка проекта</h3><div id="calcSummary"></div></div>
    </div>
  </div>`;
}
function pv(id){return parseFloat(document.getElementById(id).value)||0}
function syncP(id,fromRange){
  const r=document.getElementById(id+"_r"),n=document.getElementById(id),o=document.getElementById(id+"_o");
  if(fromRange) n.value=r.value; else r.value=n.value;
  const p=DB.getParams().find(x=>x.id===id), val=parseFloat(n.value);
  o.classList.toggle("show", val<p.min||val>p.max);
  calc();
}
function applyPreset(k){
  const pr=DB.getPresets()[k];
  for(const id in pr){document.getElementById(id).value=pr[id];document.getElementById(id+"_r").value=pr[id];document.getElementById(id+"_o").classList.remove("show");}
  calc();
}
let LAST_CALC=null;
function calc(){
  if(!document.getElementById("calcKpi"))return;
  const it=pv("itmw"), pue=pv("pue"), resv=pv("resv"), kium=pv("kium"), kwr=pv("kwrack"),
        cxe=pv("cxec"), cxd=pv("cxdc"), gp=pv("gasp"), gr=pv("gasr"), tor=pv("tor"),
        grid=pv("grid"), colo=pv("colo"), util=pv("util");
  const CC=DB.getCalcConst();                 // расчётные константы-ориентиры (настройки администратора)
  const gpuOn=PSRC.gpu, gridOn=PSRC.grid1||PSRC.grid2;
  const full=it*pue;                          // полная потребляемая мощность, МВт
  const ecMW=gpuOn?full*(1+resv/100):0;       // мощность ЭЦ (0 — если ГПУ не выбран)
  const racks=Math.round(it*1000/kwr);
  const capexEC=gpuOn?ecMW*cxe:0;
  const capexDC=racks*cxd;
  const capexGrid=gridOn?full*CC.tpPerMW*(PSRC.grid1&&PSRC.grid2?CC.tpDualMult:1):0;  // ТП; 2 ввода = +60%
  const capexDgu=PSRC.dgu?full*CC.dguPerKw:0;                      // ДГУ
  const capexUps=PSRC.ups?it*CC.upsPerKwIt:0;                      // ИБП+АКБ
  const capex=capexEC+capexDC+capexGrid+capexDgu+capexUps;
  const enMWh=full*8760*kium/100;             // потребление, МВт·ч/год
  const gasVol=gpuOn?enMWh*1000*gr:0;         // нм³/год
  const opGas=gasVol*gp/1e6;                  // млн ₽/год
  const opTo=gpuOn?enMWh*1000*tor/1e6:0;
  const opStaff=capexEC*CC.staffPct;
  const opGridEn=gpuOn?0:(gridOn?enMWh*1000*grid/1e6:0);           // покупка энергии из сети
  const opRes=(capexDgu+capexUps)*CC.resMaintPct;                  // ТО ДГУ и ИБП
  const opDC=capexDC*CC.dcMaintPct;
  const opIns=capex*CC.insPct;
  const opex=opGas+opTo+opStaff+opGridEn+opRes+opDC+opIns;
  const opexEC=gpuOn?(opGas+opTo+opStaff+opIns*(capex?capexEC/capex:0)):opGridEn;
  const costKwh=enMWh>0&&(gpuOn||gridOn)?opexEC/(enMWh*1000)*1e6:0; // ₽/кВтч
  const gridCost=enMWh*1000*grid/1e6;
  const saving=gpuOn?gridCost-opexEC:0;
  const lcoe=gpuOn?(capexEC/CC.lcoeYears+opexEC)/(enMWh*1000)*1e6:(gridOn?grid:0);
  const rev=racks*util/100*colo*12/1000;      // млн ₽/год
  const ebitda=rev-opex;
  const pbEnergy=gpuOn&&saving>0?capexEC/saving:null;
  const pbFull=ebitda>0?capex/ebitda:null;
  const pstat=powerStatus();
  LAST_CALC={it,pue,resv,kium,kwr,cxe,cxd,gp,gr,tor,grid,colo,util,full,ecMW,racks,capexEC,capexDC,capexGrid,capexDgu,capexUps,capex,enMWh,gasVol,opGas,opTo,opStaff,opGridEn,opRes,opDC,opIns,opex,opexEC,costKwh,gridCost,saving,lcoe,rev,ebitda,pbEnergy,pbFull,gpuOn,gridOn,pstat};
  const K=(v,l,cls="")=>`<div class="kpi"><div class="v ${cls}">${v}</div><div class="l">${l}</div></div>`;
  document.getElementById("calcKpi").innerHTML =
    K(fmt(full,1)+" МВт","полная мощность (IT × PUE)")+
    K(gpuOn?fmt(ecMW,1)+" МВт":"—","мощность ЭЦ (с резервом)","am")+
    K(fmt(racks,0),"стоек")+
    K(fmt(capex,0)+" млн ₽","CAPEX суммарно","am")+
    K(gpuOn?fmt(capexEC,0)+" млн ₽":"—","CAPEX энергоцентра")+
    K(fmt(capexDC,0)+" млн ₽","CAPEX ЦОД")+
    K((gpuOn||gridOn)?fmt(costKwh,2)+" ₽/кВтч":"—",gpuOn?"себестоимость энергии (ЭЦ)":"стоимость энергии (сеть)","gr")+
    K((gpuOn||gridOn)?fmt(lcoe,2)+" ₽/кВтч":"—",gpuOn?"LCOE ЭЦ (10 лет)":"тариф сети")+
    K(gpuOn?fmt(saving,0)+" млн ₽/год":"—","экономия vs сеть","gr")+
    K(fmt(rev,0)+" млн ₽/год","выручка colocation")+
    K(fmt(ebitda,0)+" млн ₽/год","EBITDA проекта",ebitda>0?"gr":"rd")+
    K(pbFull?fmt(pbFull,1)+" лет":"—","окупаемость (полный проект)",pbFull&&pbFull<8?"gr":"am");
  const bars=[["Газ",opGas,"#F5B942"],["ТО и запчасти ГПУ",opTo,"#3DD6F5"],["Покупка энергии (сеть)",opGridEn,"#F5B942"],["Персонал ЭЦ",opStaff,"#4ADE80"],["ТО ДГУ и ИБП",opRes,"#38BDF8"],["Обслуживание ЦОД",opDC,"#B48CF2"],["Страхование",opIns,"#F87171"]].filter(b=>b[1]>0.05);
  const mx=Math.max(...bars.map(b=>b[1]),1);
  document.getElementById("opexBars").innerHTML=bars.map(b=>
    `<div style="display:flex;align-items:center;gap:8px"><div style="width:150px;font-size:12px;color:var(--mut)">${b[0]}</div>
     <div class="bar" style="width:${Math.max(6,b[1]/mx*100*0.7)}%;background:${b[2]}">${fmt(b[1],0)}</div></div>`).join("")+
    `<div class="muted" style="margin-top:6px">Итого OPEX: <b style="color:var(--txt)">${fmt(opex,0)} млн ₽/год</b> · потребление газа: ${fmt(gasVol/1e6,1)} млн нм³/год</div>`;
  document.getElementById("calcSummary").innerHTML=`<table>
    <tr><th>Схема питания</th><td>${PSRC_ITEMS.filter(([k])=>PSRC[k]).map(([k,l])=>l.split(" — ")[0].split(":")[0]==="Сеть"?l.split(",")[0]:l.split(" — ")[0]).join(" + ")||"не выбрана"}</td></tr>
    <tr><th>Категория надёжности / Tier</th><td>${pstat.cat}; ${pstat.tier}</td></tr>
    <tr><th>Потребление энергии</th><td>${fmt(enMWh,0)} МВт·ч/год (КИУМ ${kium}%)</td></tr>
    <tr><th>Затраты при питании от сети</th><td>${fmt(gridCost,0)} млн ₽/год (${grid} ₽/кВтч)</td></tr>
    ${gpuOn?`<tr><th>Затраты с собственным ЭЦ</th><td>${fmt(opexEC,0)} млн ₽/год (${fmt(costKwh,2)} ₽/кВтч)</td></tr>
    <tr><th>Окупаемость ЭЦ (vs сеть)</th><td>${pbEnergy?fmt(pbEnergy,1)+" лет":"— (экономия отрицательная)"}</td></tr>`:""}
    <tr><th>CAPEX: ТП к сети / ДГУ / ИБП</th><td>${fmt(capexGrid,0)} / ${fmt(capexDgu,0)} / ${fmt(capexUps,0)} млн ₽</td></tr>
    <tr><th>CAPEX на 1 МВт IT</th><td>${fmt(capex/it,0)} млн ₽</td></tr>
    <tr><th>Выручка на стойку</th><td>${fmt(colo,0)} тыс ₽/мес при загрузке ${util}%</td></tr></table>
    <div style="margin-top:10px"><button class="btn am" onclick="exportXls()">Экспорт в Excel</button>
    <button class="btn sec" onclick="setTab('deals')">Приложить к заявке</button></div>`;
}

/* ================= ЭКСПОРТ В EXCEL ================= */
function exportXls(){
  if(!LAST_CALC){alert("Сначала выполните расчёт");return;}
  const c=LAST_CALC, esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const row=(cells,style)=>`<Row>${cells.map(v=>typeof v==="number"
    ?`<Cell${style?` ss:StyleID="${style}"`:""}><Data ss:Type="Number">${v}</Data></Cell>`
    :`<Cell${style?` ss:StyleID="${style}"`:""}><Data ss:Type="String">${esc(v)}</Data></Cell>`).join("")}</Row>`;
  const paramRows=[
    ["Параметр","Значение","Ед. изм."],
    ["Схема питания",PSRC_ITEMS.filter(([k])=>PSRC[k]).map(([k,l])=>l.split(" — ")[0]).join(" + ")||"не выбрана",""],
    ["Категория надёжности (оценка)",c.pstat?c.pstat.cat:"—",""],
    ["Достижимый Tier (оценка)",c.pstat?c.pstat.tier:"—",""],
    ["IT-мощность ЦОД",c.it,"МВт"],["PUE",c.pue,"—"],["Резерв мощности ЭЦ",c.resv,"%"],["КИУМ",c.kium,"%"],
    ["Мощность стойки",c.kwr,"кВт"],["CAPEX ЭЦ (под ключ)",c.cxe,"тыс ₽/кВт"],["CAPEX ЦОД",c.cxd,"млн ₽/стойка"],
    ["Цена газа",c.gp,"₽/нм³"],["Удельный расход газа",c.gr,"нм³/кВтч"],["ТО ГПУ",c.tor,"₽/кВтч"],
    ["Тариф сети (сравнение)",c.grid,"₽/кВтч"],["Тариф colocation",c.colo,"тыс ₽/стойка/мес"],["Загрузка ЦОД",c.util,"%"]];
  const r1=(n)=>Math.round(n*100)/100;
  const resRows=[
    ["Показатель","Значение","Ед. изм."],
    ["Полная мощность (IT × PUE)",r1(c.full),"МВт"],["Мощность энергоцентра",r1(c.ecMW),"МВт"],["Количество стоек",c.racks,"шт."],
    ["CAPEX энергоцентра",r1(c.capexEC),"млн ₽"],["CAPEX ЦОД",r1(c.capexDC),"млн ₽"],["CAPEX техприсоединения к сети",r1(c.capexGrid||0),"млн ₽"],["CAPEX ДГУ",r1(c.capexDgu||0),"млн ₽"],["CAPEX ИБП+АКБ",r1(c.capexUps||0),"млн ₽"],["CAPEX суммарно",r1(c.capex),"млн ₽"],
    ["Выработка энергии",Math.round(c.enMWh),"МВт·ч/год"],["Потребление газа",r1(c.gasVol/1e6),"млн нм³/год"],
    ["OPEX: газ",r1(c.opGas),"млн ₽/год"],["OPEX: ТО и запчасти ГПУ",r1(c.opTo),"млн ₽/год"],["OPEX: персонал ЭЦ",r1(c.opStaff),"млн ₽/год"],
    ["OPEX: покупка энергии из сети",r1(c.opGridEn||0),"млн ₽/год"],["OPEX: ТО ДГУ и ИБП",r1(c.opRes||0),"млн ₽/год"],["OPEX: обслуживание ЦОД",r1(c.opDC),"млн ₽/год"],["OPEX: страхование",r1(c.opIns),"млн ₽/год"],["OPEX итого",r1(c.opex),"млн ₽/год"],
    ["Себестоимость энергии",r1(c.costKwh),"₽/кВтч"],["LCOE (10 лет)",r1(c.lcoe),"₽/кВтч"],
    ["Затраты при питании от сети",r1(c.gridCost),"млн ₽/год"],["Экономия vs сеть",r1(c.saving),"млн ₽/год"],
    ["Выручка colocation",r1(c.rev),"млн ₽/год"],["EBITDA проекта",r1(c.ebitda),"млн ₽/год"],
    ["Окупаемость ЭЦ (vs сеть)",c.pbEnergy?r1(c.pbEnergy):"—","лет"],["Окупаемость полного проекта",c.pbFull?r1(c.pbFull):"—","лет"],
    ["",""],["Допущения: суммы без НДС (НДС 22%). Персонал ЭЦ 2% CAPEX ЭЦ/год, обслуживание ЦОД 1,5% CAPEX ЦОД/год, страхование 0,4% CAPEX/год, LCOE 10 лет без дисконтирования. Значения по умолчанию задаются администратором платформы.","",""]];
  const sheet=(name,rows)=>`<Worksheet ss:Name="${name}"><Table><Column ss:Width="230"/><Column ss:Width="110"/><Column ss:Width="120"/>${rows.map((r,i)=>row(r,i===0?"h":null)).join("")}</Table></Worksheet>`;
  const xml=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#D9E2F3" ss:Pattern="Solid"/></Style></Styles>
${sheet("Параметры",paramRows)}${sheet("Результаты",resRows)}</Workbook>`;
  const blob=new Blob(["﻿"+xml],{type:"application/vnd.ms-excel"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="Finmodel_EnergoTsOD_"+new Date().toISOString().slice(0,10)+".xls";a.click();URL.revokeObjectURL(a.href);
}
