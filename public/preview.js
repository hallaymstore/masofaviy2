(async()=>{
  try{
    const r=await fetch('/api/branding',{cache:'no-store'});
    const b=await r.json();
    if(!r.ok)return;
    const institution=b.institutionName||'Universitet',short=b.shortName||institution;
    document.querySelectorAll('.preview-institution').forEach((el,i)=>el.textContent=i===0?short:institution.toUpperCase());
    document.title='HALLAYM EDU · '+institution;
    if(b.logoUrl)document.querySelectorAll('.brand-mark').forEach(mark=>{mark.textContent='';mark.style.backgroundImage='url("'+String(b.logoUrl).replace(/"/g,'%22')+'")';mark.style.backgroundSize='cover';mark.style.backgroundPosition='center'});
  }catch{}
})();