// Friendly MCQ editor. No JSON input required.
export function parseQuizRows(text){
 const lines=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const rows=[];
 for(let i=0;i<lines.length;i++){
   const sep=lines[i].includes('\t')?'\t':lines[i].includes('|')?'|':',';
   const fields=[];let cell='',quoted=false;
   for(let j=0;j<lines[i].length;j++){const ch=lines[i][j];
     if(ch==='"'){if(quoted&&lines[i][j+1]==='"'){cell+='"';j++}else quoted=!quoted}
     else if(ch===sep&&!quoted){fields.push(cell);cell=''}else cell+=ch;
   }
   fields.push(cell);
   const cells=fields.map(x=>x.trim());
   if(cells.length<4)throw Error((i+1)+'-qatorda savol, kamida 2 javob va to‘g‘ri raqam bo‘lishi kerak');
   const prompt=cells.shift(),correct=Number(cells.pop()),options=cells;
   if(!Number.isInteger(correct)||correct<1||correct>options.length)throw Error((i+1)+'-qatorda to‘g‘ri javob raqami noto‘g‘ri');
   rows.push({prompt,options,correctIndex:correct-1});
 }
 return validateQuizQuestions(rows);
}
export function validateQuizQuestions(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>100)throw Error('Testda 1–100 savol bo‘lishi kerak');
 return rows.map((row,index)=>{
   const prompt=String(row.prompt||'').trim(),options=(row.options||[]).map(x=>String(x||'').trim());
   if(prompt.length<3)throw Error((index+1)+'-savol matnini kiriting');
   if(options.length<2||options.length>8||options.some(x=>!x))throw Error((index+1)+'-savolda 2–8 ta to‘liq javob varianti kerak');
   if(!Number.isInteger(row.correctIndex)||row.correctIndex<0||row.correctIndex>=options.length)throw Error((index+1)+'-savol uchun to‘g‘ri javobni tanlang');
   return {prompt,options,correctIndex:row.correctIndex};
 });
}

export function openQuizComposer({modal,api,courseId,openCourse,toast,esc,onQuizCreated}){
 const body='<label>Test nomi<input name="title" minlength="3" required placeholder="Masalan: 4-mavzu testi"></label>'+
 '<div class="quiz-settings-grid"><label>Davomiylik (daqiqa)<input name="durationMinutes" type="number" min="1" max="240" value="30" required></label><label>Maksimal urinish<input name="maxAttempts" type="number" min="1" max="10" value="1" required></label></div>'+
 '<div class="quiz-composer-toolbar"><strong>Test savollari</strong><span id="quizCount">1 ta savol</span><button type="button" id="quizAddQuestion">+ Savol qo‘shish</button></div><div id="quizQuestionCards"></div>'+
 '<details class="quiz-import"><summary>TXT, CSV yoki jadvaldan savollar import qilish</summary><p>Har qatorda: Savol | 1-variant | 2-variant | 3-variant | To‘g‘ri javob raqami (1 dan)</p><textarea id="quizBulkInput" rows="4" placeholder="Poytaxt qayerda? | Toshkent | Samarqand | Buxoro | 1"></textarea><label>Fayl tanlash<input id="quizFileInput" type="file" accept=".txt,.csv,.tsv"></label><button type="button" id="quizImportRows">Import qilish</button></details>'+
 '<label class="quiz-proctor-option"><input name="proctorRequired" type="checkbox" value="true"> Proktoring rejimi</label><p class="quiz-composer-hint">JSON yozish shart emas: to‘g‘ri javobni doiracha orqali tanlang.</p>';
 modal('Test tuzish',body,async d=>{
  const rows=[...document.querySelectorAll('#quizQuestionCards .quiz-question-card')].map(card=>({
   prompt:card.querySelector('.quiz-prompt').value,
   options:[...card.querySelectorAll('.quiz-option-text')].map(el=>el.value),
   correctIndex:[...card.querySelectorAll('.quiz-option-correct')].findIndex(el=>el.checked)
  }));
  const questions=validateQuizQuestions(rows);
  const created=await api('/lms/courses/'+courseId+'/quizzes',{method:'POST',body:JSON.stringify({title:d.title,durationMinutes:Number(d.durationMinutes)||30,maxAttempts:Number(d.maxAttempts)||1,proctorRequired:d.proctorRequired==='true',published:true,questions})});
  if(onQuizCreated)await onQuizCreated(created);setTimeout(()=>openCourse(courseId),40);toast(questions.length+' ta savolli test qo‘shildi');
 });
 const board=document.querySelector('#quizQuestionCards'),count=document.querySelector('#quizCount');if(!board)return;
 let nextId=0;
 function renumber(){[...board.children].forEach((card,i)=>card.querySelector('.quiz-question-number').textContent=(i+1)+'-savol');count.textContent=board.children.length+' savol'}
 function addQuestion(row={}){
  if(board.children.length>=100)return toast('Testga ko‘pi bilan 100 savol qo‘shiladi');
  const card=document.createElement('article'),uid=++nextId;card.className='quiz-question-card';card.dataset.quizUid=String(uid);
  card.innerHTML='<div class="quiz-card-head"><strong class="quiz-question-number"></strong><div><button type="button" class="quiz-duplicate">Nusxalash</button><button type="button" class="quiz-remove">O‘chirish</button></div></div><label>Savol matni<textarea class="quiz-prompt" rows="2" required>'+esc(row.prompt||'')+'</textarea></label><p class="quiz-correct-hint">✓ To‘g‘ri javobni doirachadan belgilang</p><div class="quiz-options"></div><button class="quizAddOption" type="button">+ Variant</button>';
  board.append(card);
  const optionHost=card.querySelector('.quiz-options');
  const addOption=(text='',correct=false)=>{
   if(optionHost.children.length>=8)return toast('Maksimal 8 ta variant');
   const opt=document.createElement('div');opt.className='quiz-option';
   opt.innerHTML='<label><input class="quiz-option-correct" type="radio" name="quiz-answer-'+uid+'" required '+(correct?'checked':'')+'><span class="quiz-option-letter"></span></label><input class="quiz-option-text" type="text" required maxlength="500" placeholder="Javob varianti" value="'+esc(text)+'"><button type="button" class="quiz-option-remove">×</button>';
   optionHost.append(opt);
   opt.querySelector('.quiz-option-remove').onclick=()=>{if(optionHost.children.length<=2)return toast('Kamida 2 javob varianti');const selected=opt.querySelector('input[type=radio]').checked;opt.remove();if(selected)optionHost.querySelector('input[type=radio]').checked=true;renumberOptions()};
   renumberOptions();
  };
  function renumberOptions(){[...optionHost.children].forEach((opt,i)=>opt.querySelector('.quiz-option-letter').textContent=String.fromCharCode(65+i))}
  (row.options?.length?row.options:['','','','']).forEach((x,i)=>addOption(x,(row.correctIndex??0)===i));
  card.querySelector('.quizAddOption').onclick=()=>addOption();
  card.querySelector('.quiz-remove').onclick=()=>{if(board.children.length===1)return toast('Kamida bitta savol bo‘lishi kerak');card.remove();renumber()};
  card.querySelector('.quiz-duplicate').onclick=()=>addQuestion({prompt:card.querySelector('.quiz-prompt').value,options:[...card.querySelectorAll('.quiz-option-text')].map(x=>x.value),correctIndex:[...card.querySelectorAll('.quiz-option-correct')].findIndex(x=>x.checked)});
  renumber();
 }
 document.querySelector('#quizAddQuestion').onclick=()=>addQuestion();
 document.querySelector('#quizFileInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2*1024*1024)return toast('Fayl 2 MB dan kichik bo‘lsin');document.querySelector('#quizBulkInput').value=await f.text()};
 document.querySelector('#quizImportRows').onclick=()=>{
  try{const data=parseQuizRows(document.querySelector('#quizBulkInput').value);if(board.children.length+data.length>100)throw Error('Savollar jami 100 tadan oshmasin');if(board.children.length===1&&!board.querySelector('.quiz-prompt').value.trim())board.replaceChildren();data.forEach(addQuestion);toast(data.length+' ta savol import qilindi')}catch(e){toast(e.message)}
 };
 addQuestion();
}
