/* Ithiel 2.0: original letter-morph transition for the static HTML storefront.
 * Not the licensed React Bits Pro component. Uses Web Animations API, no framework,
 * shared-letter matching and reduced-motion support.
 */
(() => {
  "use strict";
  const root = document.querySelector(".ithiel-rotate-window");
  if (!root) return;
  const source = Array.from(root.querySelectorAll(".ithiel-rotate-word"));
  const words = source.map(n => (n.textContent || "").trim()).filter(Boolean);
  if (!words.length) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  root.classList.add("ithiel-morph-ready");
  root.replaceChildren();
  const live = document.createElement("span");
  live.className = "ithiel-morph-current";
  live.setAttribute("aria-hidden","true");
  root.append(live);
  let index = 0;
  let busy = false;
  let timer = null;

  function letters(word) {
    const frag = document.createDocumentFragment();
    for (const character of Array.from(word)) {
      const span = document.createElement("span");
      span.className = "ithiel-morph-letter";
      span.textContent = character === " " ? "\u00a0" : character;
      frag.append(span);
    }
    return frag;
  }
  function render(word) {
    live.replaceChildren(letters(word));
    root.dataset.currentWord = word;
  }
  function matchLetters(from, to) {
    const matches = new Map();
    const used = new Set();
    for (let j = 0; j < to.length; j++) {
      const candidates = from.map((ch,i) => ({ch,i}))
        .filter(({ch,i}) => ch === to[j] && !used.has(i));
      if (!candidates.length) continue;
      candidates.sort((a,b) => Math.abs(a.i-j)-Math.abs(b.i-j));
      matches.set(j, candidates[0].i);
      used.add(candidates[0].i);
    }
    return {matches,used};
  }
  async function morph() {
    if (busy || document.hidden || reduced.matches) return;
    const next = (index + 1) % words.length;
    const oldLetters = [...live.children];
    const oldChars = Array.from(words[index]);
    const newChars = Array.from(words[next]);
    const oldRects = oldLetters.map(el => el.getBoundingClientRect());
    const {matches,used} = matchLetters(oldChars,newChars);
    const layer = document.createElement("span");
    layer.className = "ithiel-morph-layer";
    layer.setAttribute("aria-hidden","true");
    root.append(layer);
    busy = true;
    index = next;
    render(words[index]);
    const freshLetters = [...live.children];
    const newRects = freshLetters.map(el => el.getBoundingClientRect());
    const container = root.getBoundingClientRect();
    const animations = [];
    // The shared characters physically glide between their old and new locations.
    for (const [j,i] of matches) {
      const ghost = oldLetters[i].cloneNode(true);
      ghost.className = "ithiel-morph-letter ithiel-morph-ghost";
      ghost.style.left = (oldRects[i].left-container.left)+"px";
      ghost.style.top = (oldRects[i].top-container.top)+"px";
      ghost.style.width = oldRects[i].width+"px";
      ghost.style.height = oldRects[i].height+"px";
      layer.append(ghost);
      freshLetters[j].style.opacity = "0";
      const dx = newRects[j].left-oldRects[i].left;
      const dy = newRects[j].top-oldRects[i].top;
      animations.push(ghost.animate([
        {transform:"translate(0,0)",opacity:1,filter:"blur(0)"},
        {transform:`translate(${dx}px,${dy}px)`,opacity:1,filter:"blur(0)"}
      ],{duration:650,easing:"cubic-bezier(.25,.8,.25,1)",fill:"forwards"}).finished.catch(()=>{}));
    }
    oldLetters.forEach((old,i)=>{
      if(used.has(i))return;
      const ghost=old.cloneNode(true);
      ghost.className="ithiel-morph-letter ithiel-morph-ghost";
      ghost.style.left=(oldRects[i].left-container.left)+"px";
      ghost.style.top=(oldRects[i].top-container.top)+"px";
      layer.append(ghost);
      animations.push(ghost.animate([
        {transform:"translateY(0)",opacity:1,filter:"blur(0)"},
        {transform:"translateY(-12px)",opacity:0,filter:"blur(5px)"}
      ],{duration:410,easing:"ease-in",fill:"forwards"}).finished.catch(()=>{}));
    });
    freshLetters.forEach((fresh,j)=>{
      if(matches.has(j))return;
      animations.push(fresh.animate([
        {transform:"translateY(11px)",opacity:0,filter:"blur(5px)"},
        {transform:"translateY(0)",opacity:1,filter:"blur(0)"}
      ],{duration:550,delay:Math.min(140,j*20),easing:"ease-out",fill:"forwards"}).finished.catch(()=>{}));
    });
    await Promise.all(animations);
    freshLetters.forEach(el=>{el.style.opacity="";});
    layer.remove();
    busy = false;
  }
  function start() {
    if (timer) clearInterval(timer);
    if (!reduced.matches) timer = window.setInterval(morph,3100);
    else {index=0;render(words[0]);}
  }
  render(words[0]);
  start();
  reduced.addEventListener?.("change",start);
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden && !busy) start();
  });
})();
