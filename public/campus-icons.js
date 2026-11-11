const paths = {
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/>',
  moon:'<path d="M20.8 14A9 9 0 0 1 10 3.2 9 9 0 1 0 20.8 14Z"/><path d="M17 3v4m-2-2h4"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  building:'<path d="m3 9 9-6 9 6M4 10h16M6 10v8m6-8v8m6-8v8M3 21h18M4 18h16"/>',
  video:'<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
  swap:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18m-13 5h2m4 0h2"/>',
  users:'<circle cx="9" cy="8" r="3.3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3.4 3.4 0 0 1 0 6.5m1 3a5 5 0 0 1 3 4.5v1"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  home:'<path d="m3 11 9-7 9 7M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8m-9 10v-6h6v6"/>',
  book:'<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>',
  library:'<path d="M3 4h4v16H3zm6 0h4v16H9zm7 1 4-1 3 15-4 1z"/>',
  chart:'<path d="M4 4v16h16M8 16v-4m4 4V8m4 8V5m4 11v-6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  lock:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2"/>',
  pin:'<path d="m9 3 7 2-2 5 3 3-1 2-10-3 1-2 3-1zM9 14l-3 7"/>',
  file:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  spark:'<path d="M12 3c0 5 4 9 9 9-5 0-9 4-9 9 0-5-4-9-9-9 5 0 9-4 9-9Z"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  link:'<path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0) scale(.92)"/>',
  mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8"/>',
  fullscreen:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  camera:'<rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3"/><path d="M8 6l1-2h6l1 2"/>',
  micOff:'<path d="m3 3 18 18M9 9v2a3 3 0 0 0 4 3m2-5V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 12 5M12 18v3"/>',
  star:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.2 1 6L12 17l-5.4 2.8 1-6L3.2 9.4l6.1-.9z"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/><circle cx="12" cy="12" r="7"/>'
};
export const premiumIconPath = name => paths[name];
export const premiumIcon = name => '<svg class="ui-icon pg-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.file)+'</svg>';

const glyphs = {'☀':'sun','🌙':'moon','📮':'mail','🌐':'globe','🏫':'building','🏛':'building','🎥':'video','🔀':'swap','📅':'calendar','👥':'users','🔔':'bell','✅':'check','✓':'check','📚':'library','📘':'book','📖':'book','🕒':'clock','⏱':'clock','📌':'pin','🔒':'lock','📄':'file','📋':'file','📥':'download','📝':'file','📊':'chart','📈':'chart','📁':'folder','✨':'spark','✦':'spark','🎙':'mic','⚙':'settings','🔇':'micOff','📷':'camera','⭐':'star','🎓':'book','🗂':'folder','🧭':'globe','🛎':'bell','📣':'bell','📎':'link','🔗':'link','📑':'file','▶':'video','👤':'users','↗':'link','🤟':'users'};
const glyphPattern = new RegExp('('+Object.keys(glyphs).join('|')+')\\uFE0F?', 'gu');
const chrome = '.ef-ico,.ef-ci-ico,.ef-badge,.em-badge,.ux-ico,.ux-doc-ico,.ux-hero-ico,.ux-ws-sec>h3,.ef-tabs button,.ux-tabs button,.in-tabs button,.course-topic-add-menu button,.personal-grade-meta span,.exam-chip,.proctor-exam-banner>b,.lesson-meta,.lesson-kind,.quick button>b,.ui-toolbar button,[data-ui-icon-label]';

export function polishInterfaceIcons(root) {
  const decorate = element => {
    if (!element?.matches || element.closest('[contenteditable]')) return;
    for (const target of [ ...(element.matches(chrome) ? [element] : []), ...element.querySelectorAll(chrome) ]) {
      for (const text of [...target.childNodes]) {
        if (text.nodeType !== 3) continue;
        const value = text.nodeValue;
        const matches = [...value.matchAll(glyphPattern)];
        if (!matches.length) continue;
        const fragment = document.createDocumentFragment();
        let offset = 0;
        for (const match of matches) {
          fragment.append(value.slice(offset, match.index));
          const span = document.createElement('span');
          span.className = 'pg-icon-glyph';
          span.setAttribute('aria-hidden','true');
          span.innerHTML = premiumIcon(glyphs[match[1]]);
          fragment.append(span);
          offset = match.index + match[0].length;
        }
        fragment.append(value.slice(offset));
        text.replaceWith(fragment);
      }
    }
  };
  decorate(root);
  const observer = new MutationObserver(records => {
    const elements = new Set();
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === 1) elements.add(node);
      if (node.nodeType === 3 && node.parentElement?.matches(chrome)) elements.add(node.parentElement);
    }
    for (const element of elements) decorate(element);
  });
  observer.observe(root,{childList:true,subtree:true});
}
