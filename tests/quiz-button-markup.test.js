import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('student quiz button must carry quiz ID on data-quiz attribute',()=>{
 assert.match(js,/data-quiz="'+esc\(q\._id\)+'" data-quiz-proctor/);
 assert.doesNotMatch(js,/data-quiz data-quiz-proctor/);
});
test('teacher review button must carry quiz ID',()=>assert.match(js,/data-quiz-review="'+esc\(q\._id\)+'"/));
test('client validates quiz ID before request',()=>assert.match(js,/if\(!\/\^\[0-9a-f\]\{24\}\$\/i\.test\(String\(id\|\|''\)\)\)/));
