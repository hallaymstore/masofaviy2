// Pure PDF/text helpers shared by the reader and its regression tests.
export function splitSentences(text){
  const clean=String(text||'').replace(/\u00ad/g,'').replace(/-\r?\n(?=\p{Ll})/gu,'').replace(/\s+/g,' ').trim();
  return clean.match(/[^.!?…]+(?:[.!?…]+["»”)]*|$)/g)?.map(x=>x.trim()).filter(Boolean)||[];
}
export function pageTextFromItems(items){
  let text='';
  for(const item of items||[]){
    text+=item.str||'';
    if(item.hasEOL)text+='\n';
    else if(item.str&&!/\s$/.test(item.str))text+=' ';
  }
  return text.replace(/[ \t]+\n/g,'\n').trim();
}
export const looksScanned=pages=>pages.length>0&&pages.every(p=>!String(p).trim());
export function clampPosition(start,pageCount,chunkCount){
  const page=Math.max(0,Math.min(Math.max(0,pageCount-1),Math.floor(Number(start?.page)||0)));
  const idx=Math.max(0,Math.min(Math.max(0,chunkCount-1),Math.floor(Number(start?.idx)||0)));
  return {page,idx};
}
