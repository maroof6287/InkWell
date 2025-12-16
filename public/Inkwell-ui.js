// Inkwell UI helpers (vanilla). Kept separate for clarity + reuse.

export function $(sel, root=document){ return root.querySelector(sel); }
export function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function toast(msg, ms=2600){
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  t.classList.remove("pop");
  // restart animation
  void t.offsetWidth;
  t.classList.add("pop");
  window.clearTimeout(t.__to);
  t.__to = window.setTimeout(()=>{ t.hidden = true; }, ms);
}

export function haptic(){
  // harmless best-effort haptic (supported on some devices)
  if (navigator.vibrate) navigator.vibrate(12);
}

export function jaggedClipPath(seed=1){
  // Returns a CSS polygon string for a torn-paper edge.
  // Deterministic per seed.
  let r = mulberry32(seed);
  const pts = [];
  const steps = 9;
  pts.push([0,0]);
  for (let i=0;i<=steps;i++){
    const x = (i/steps)*100;
    const y = 2 + Math.floor(r()*6);
    pts.push([x,y]);
  }
  pts.push([100,0],[100,100]);
  for (let i=steps;i>=0;i--){
    const x = (i/steps)*100;
    const y = 96 - Math.floor(r()*6);
    pts.push([x,y]);
  }
  pts.push([0,100]);
  return "polygon(" + pts.map(p=>`${p[0]}% ${p[1]}%`).join(",") + ")";
}

function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatDateStamp(ts){
  const d = new Date(ts);
  return d.toLocaleString(undefined, { year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

export function animateScrap(fromEl, toEl, text){
  // Creates a floating scrap that moves into the journal.
  const r1 = fromEl.getBoundingClientRect();
  const r2 = toEl.getBoundingClientRect();
  const scrap = document.createElement("div");
  scrap.className = "scrapFloat";
  scrap.style.left = (r1.left + 12) + "px";
  scrap.style.top = (r1.top + 12) + "px";
  scrap.style.width = Math.min(320, r1.width - 24) + "px";
  scrap.style.clipPath = jaggedClipPath(Math.floor(Date.now()%100000));
  scrap.innerHTML = `<div class="scrapInner">${escapeHtml(text).slice(0,220)}${text.length>220?"…":""}</div>`;
  document.body.appendChild(scrap);

  // flight
  const dx = (r2.left + r2.width*0.25) - (r1.left + 20);
  const dy = (r2.top + 26) - (r1.top + 20);

  return new Promise((resolve)=>{
    requestAnimationFrame(()=>{
      scrap.classList.add("go");
      scrap.style.transform = `translate(${dx}px, ${dy}px) rotate(-6deg) scale(0.75)`;
      scrap.style.opacity = "0.15";
      setTimeout(()=>{
        scrap.remove();
        resolve();
      }, 950);
    });
  });
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
