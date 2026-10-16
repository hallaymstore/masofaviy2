// HALLAYM EDU — family upload page: a relative adds a book to a student's personal shelf through a one-time link
// (token in the URL fragment, never sent in server logs as a query string).
(function(){
  'use strict';
  var token=location.hash.slice(1),who=document.getElementById('who'),form=document.getElementById('f'),msg=document.getElementById('msg');
  function say(t,cls){msg.textContent=t;msg.className=cls||''}
  if(!/^[A-Za-z0-9_-]{20,64}$/.test(token)){who.textContent='Havola noto‘g‘ri. Talabadan yangi havola so‘rang.';return}
  var url='/api/family-upload/'+encodeURIComponent(token);
  fetch(url).then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.message||'Havola ishlamaydi');return x})}).then(function(x){
    who.textContent=x.student+' uchun kitob yuklaysiz. Yana '+x.left+' ta kitob yuklash mumkin.';form.hidden=false;form.querySelector('input').focus();
  }).catch(function(e){who.textContent=e.message});
  form.addEventListener('submit',function(e){
    e.preventDefault();var fd=new FormData(form),file=fd.get('file');
    if(!file||!file.size)return say('Kitob faylini tanlang','bad');
    if(file.size>60*1024*1024)return say('Fayl 60 MB dan katta','bad');
    if(!fd.get('title'))fd.set('title',file.name.replace(/\.[^.]+$/,''));
    var b=form.querySelector('button');b.disabled=true;say('Yuklanmoqda…');
    fetch(url,{method:'POST',body:fd}).then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.message||'Yuklab bo‘lmadi');return x})})
      .then(function(x){say('✅ «'+x.title+'» javonga qo‘shildi. Talaba uni darhol tinglay oladi.','ok');form.reset();return fetch(url).then(function(r){return r.json().then(function(info){if(!r.ok){form.hidden=true;who.textContent=info.message;return}who.textContent=info.student+' uchun kitob yuklaysiz. Yana '+info.left+' ta kitob yuklash mumkin.'})})})
      .catch(function(e){say(e.message,'bad')}).then(function(){b.disabled=false});
  });
})();
