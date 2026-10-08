import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const section=js.slice(js.indexOf("html+='<h3>Testlar</h3>'"),js.indexOf("html+='<h3>Testlar</h3>'")+600);
test('quiz markup has bound student and teacher IDs',()=>{
 assert.ok(section.includes('data-quiz-proctor'));
 assert.ok(section.includes('data-quiz-review'));
 assert.ok(section.includes("esc(q._id)"));
 assert.ok(!section.includes('data-quiz data-quiz-proctor'));
 assert.ok(!section.includes("+'>'++"));
});
test('client prevents empty quiz ID calls',()=>assert.ok(js.includes("if(!/^[0-9a-f]{24}$/i.test(String(id||'')))")));
