import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const js = read('public/campus-game.js'), css = read('public/campus-game.css');

test('face has expressions mapped from poses and eyes that follow the pointer', () => {
  assert.ok(js.includes('class="pg-face" data-face="idle"'));
  for (const face of ['happy', 'laugh', 'love', 'wink', 'surprised', 'sleep', 'determined', 'curious', 'excited'])
    assert.ok(css.includes(`[data-face="${face}"]`), face);
  assert.ok(js.includes("faceEl.style.setProperty('--lx'"));
  assert.ok(js.includes("attributeFilter: ['data-pose']"));
});

test('card stunts only use temporary animations on page elements', () => {
  for (const fn of ['perchOnCard', 'pushCard', 'tugCard']) assert.ok(js.includes(`async function ${fn}(`), fn);
  const jolt = js.slice(js.indexOf('async function jolt('), js.indexOf('// Squat, spring'));
  assert.ok(jolt.includes('animation.cancel()'));
  assert.ok(!/card\.style\./.test(js), 'never writes inline styles on page cards');
  assert.ok(js.includes("page.id === 'lesson' || page.id === 'videoWatch'"));
});

test('page changes send the robot travelling, every move is cancellable', () => {
  for (const fn of ['menuHop', 'hangDrop', 'skateRide', 'slideDown', 'portalHop']) assert.ok(js.includes(`async function ${fn}(`), fn);
  assert.ok(js.includes('refresh(chooseTransition())'));
  assert.ok(js.includes("attributeFilter: ['data-page']"));
  assert.ok(js.includes('function refresh(intro)'));
});

test('dance parties mix several styles including Lazgi and moonwalk', () => {
  for (const pose of ['dance-disco', 'dance-robot', 'dance-twist', 'dance-floss', 'dance-lazgi', 'dance-kick', 'moonwalk'])
    assert.ok(js.includes(`'${pose}'`) && css.includes(`[data-pose="${pose}"]`), pose);
  assert.ok(js.includes('.slice(0, 4)'));
});

test('new experiments are in the playlist and hidden for reduced motion', () => {
  for (const name of ['rocket', 'volcano', 'plane', 'bubbles', 'plant', 'perch', 'push', 'tug']) assert.ok(js.includes(`'${name}'`), name);
  assert.ok(css.includes(':is(.pg-skate,.pg-slide,.pg-portal,.pg-rocket,.pg-volcano,.pg-plane,.pg-plant) {display:none!important}'));
});

test('experiments start at the workbench: materialise, lean, carry, set down', () => {
  assert.ok(js.includes('async function fetchProp('));
  for (const step of ["robot.dataset.pose = 'reach-low'", "robot.dataset.pose = 'carry'", "'carry-walk'", 'await lean(true, signal)'])
    assert.ok(js.includes(step), step);
  for (const prop of ['rocket,', 'ball,', 'volcanoEl,', 'plant,', 'lab,', 'plane,']) assert.ok(js.includes(`fetchProp(positions, ${prop}`), prop);
  assert.ok(css.includes('[data-pose="carry-walk"] .pg-leg'));
});
