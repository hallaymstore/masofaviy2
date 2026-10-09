// A course is a sequence of topics. Uploaded materials, tasks and quizzes are grouped
// by association; nothing is destroyed when an old item is moved between topics.
const kinds={resource:'Material',assignment:'Topshiriq',quiz:'Test',video:'Videodars'};
export function groupCourseItems(course,structure){
 const topics=[...(structure?.topics||[])].sort((a,b)=>a.position-b.position||String(a._id).localeCompare(String(b._id)));
 const mapping=new Map((structure?.links||[]).map(l=>[l.itemType+':'+String(l.itemId),String(l.topicId)]));
 const all=[
  ...(course.resources||[]).map(item=>({...item,itemType:'resource'})),
  ...(course.assignments||[]).map(item=>({...item,itemType:'assignment'})),
  ...(course.quizzes||[]).map(item=>({...item,itemType:'quiz'})),
  ...(course.videos||[]).map(item=>({...item,itemType:'video'}))
 ];
 const groups=topics.map(topic=>({...topic,items:[]}));
 const byId=new Map(groups.map(g=>[String(g._id),g]));
 const unassigned=[];
 for(const item of all){
  const group=byId.get(mapping.get(item.itemType+':'+String(item._id)));
  (group?group.items:unassigned).push(item);
 }
 return {groups,unassigned,all};
}
export function coursePlanHtml(course,structure,{editor=false,student=false,esc}={}){
 const {groups,unassigned}=groupCourseItems(course,structure);
 const e=x=>esc(String(x??''));
 const options='<option value="">Biriktirilmagan</option>'+groups.map(t=>'<option value="'+e(t._id)+'">'+e(t.title)+'</option>').join('');
 const map=new Map((structure?.links||[]).map(l=>[l.itemType+':'+String(l.itemId),String(l.topicId)]));
 const itemMarkup=item=>{
   const type=item.itemType,id=e(item._id),title=e(item.title),kind=kinds[type]||type;
   let action='';
   if(type==='resource'){
     const url=item.fileId?'/api/lms/resources/'+encodeURIComponent(String(item._id))+'/content':'/api/lms/resources/'+encodeURIComponent(String(item._id))+'/open';
     const media=item.fileId&&item.kind==='video'?'<video controls preload="none" src="'+e(url)+'"></video>':
        item.fileId&&item.kind==='audio'?'<audio controls preload="none" src="'+e(url)+'"></audio>':
        item.fileId&&item.kind==='image'?'<img loading="lazy" alt="'+title+'" src="'+e(url)+'">':'';
     action='<a href="'+e(url)+'" target="_blank" rel="noopener noreferrer">Ochish ↗</a>'+
       (media?'<details class="course-topic-preview"><summary>Oldindan ko‘rish</summary>'+media+'</details>':'');
     if(editor)action+='<button data-library-resource="'+id+'" data-library-title="'+title+'">Kutubxonaga</button><button data-delete-resource="'+id+'">O‘chirish</button>';
   }
   if(type==='assignment')action='<button data-assignment="'+id+'">'+(student?'Javob berish':'Javoblarni ko‘rish')+'</button>';
   if(type==='quiz')action='<button '+(student?'data-quiz="'+id+'" data-quiz-proctor="'+(item.proctorRequired?'1':'0')+'"':'data-quiz-review="'+id+'"')+'>'+(student?'Testni boshlash':'Urinishlar')+'</button>';
   if(type==='video')action='<button type="button" data-topic-video="'+id+'">Ko‘rish ▶</button>';
   const current=map.get(type+':'+String(item._id))||'';
   const select=editor?'<label class="topic-move-label">Mavzusi <select data-topic-assign="'+id+'" data-item-type="'+e(type)+'">'+options.replace('value="'+e(current)+'"','value="'+e(current)+'" selected')+'</select></label>':'';
   return '<div data-search-item="'+id+'" class="course-topic-item"><div class="course-topic-item-copy"><span class="course-topic-kind">'+e(kind)+'</span><strong>'+title+'</strong>'+
     (type==='assignment'&&item.instructions?'<p>'+e(item.instructions)+'</p>':'')+
     (item.description?'<p>'+e(item.description)+'</p>':'')+
     (type==='assignment'&&item.dueAt?'<small>Muddat: '+e(new Date(item.dueAt).toLocaleString('uz-UZ'))+'</small>':'')+
     (type==='resource'&&item.size?'<small>'+e(Math.round(item.size/1024))+' KB</small>':'')+
     '</div><div class="course-topic-item-actions">'+action+select+'</div></div>';
 };
 let html='<div class="course-topic-plan"><div class="course-topic-plan-head"><div><h3>Dars mavzulari</h3><p>Fan bo‘yicha mavzular ketma-ketligi va ularga biriktirilgan materiallar</p></div>'+
 (editor?'<div class="course-topic-add-controls"><label>Qaysi mavzuga? <select id="courseTopicTarget">'+options+'</select></label><button class="primary" type="button" id="courseAddButton">+ Qo‘shish ▾</button></div>':'')+'</div>';
 if(editor)html+='<div id="courseAddMenu" class="course-topic-add-menu" hidden><button type="button" data-course-create="topic">📑 Yangi mavzu</button><button type="button" data-course-create="upload">📎 Fayl yuklash</button><button type="button" data-course-create="resource">🔗 Havola / onlayn resurs</button><button type="button" data-course-create="assignment">📝 Topshiriq</button><button type="button" data-course-create="quiz">✅ Test</button></div>';
 if(!groups.length)html+='<div class="course-topic-empty"><b>Hozircha dars mavzulari yo‘q</b><p>Avval “+ Qo‘shish → Yangi mavzu” ni tanlab dars rejasini tuzing. Keyin har bir mavzuga resurs biriktiring.</p></div>';
 groups.forEach((topic,index)=>{
   const topicId=e(topic._id);
   html+='<details class="course-topic-card" data-topic="'+topicId+'" '+(index===0?'open':'')+'><summary class="course-topic-card-head"><span class="course-topic-number">'+(index+1)+'</span><span class="course-topic-title"><b>'+e(topic.title)+'</b>'+(topic.description?'<small>'+e(topic.description)+'</small>':'')+'<small>'+topic.items.length+' ta material / topshiriq</small></span><span class="course-topic-arrow">⌄</span></summary><div class="course-topic-body">'+
      (editor?'<div class="course-topic-tools"><button type="button" data-topic-add="'+topicId+'">+ Biriktirish</button><button type="button" data-topic-edit="'+topicId+'">Tahrirlash</button><button type="button" data-topic-move="'+topicId+'" data-direction="-1" '+(index===0?'disabled':'')+'>↑</button><button type="button" data-topic-move="'+topicId+'" data-direction="1" '+(index===groups.length-1?'disabled':'')+'>↓</button><button type="button" data-topic-delete="'+topicId+'">O‘chirish</button></div>':'')+
      (topic.items.map(itemMarkup).join('')||'<p class="course-topic-muted">Bu mavzuga hali hech narsa biriktirilmagan.</p>')+
      '</div></details>';
 });
 if(unassigned.length)html+='<details class="course-topic-card course-topic-unassigned" open><summary class="course-topic-card-head"><span class="course-topic-number">•</span><span class="course-topic-title"><b>Mavzuga biriktirilmaganlar</b><small>'+unassigned.length+' ta eski yoki biriktirilmagan material</small></span></summary><div class="course-topic-body">'+unassigned.map(itemMarkup).join('')+'</div></details>';
 return html+'</div>';
}
