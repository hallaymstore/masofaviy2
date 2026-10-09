import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const section=fs.readFileSync(new URL('../public/course-plan-ui.js',import.meta.url),'utf8');
test('quiz markup has bound student and teacher IDs',()=>{
 assert.ok(section.includes('data-quiz-proctor'));
 assert.ok(section.includes('data-quiz-review'));
 assert.ok(section.includes("data-quiz-review="));
 assert.ok(section.includes("const type=item.itemType,id=e(item._id)"));
 assert.ok(!section.includes('data-quiz data-quiz-proctor'));
 assert.ok(!section.includes("+'>'++"));
});
test('client prevents empty quiz ID calls',()=>assert.ok(js.includes("if(!/^[0-9a-f]{24}$/i.test(String(id||'')))")));
