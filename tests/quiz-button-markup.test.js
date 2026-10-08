import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('quiz attributes include IDs and have no malformed bare attributes',()=>{
 assert.ok(js.includes(`'data-quiz="'+esc(q._id)+'" data-quiz-proctor="'`));
 assert.ok(js.includes(`'data-quiz-review="'+esc(q._id)+'"'`));
 assert.ok(!js.includes('data-quiz data-quiz-proctor='));
});
test('quiz start validates 24 digit ObjectId',()=>{
 assert.ok(js.includes("if(!/^[0-9a-f]{24}$/i.test(String(id||'')))"));
});
