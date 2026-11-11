import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fitScenePoint, scenePositions } from '../public/campus-game.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('public/campus-game.css');
const script = read('public/campus-game.js');
const html = read('public/index.html');

test('robot paths fit desktop, narrow phone and rotated phone viewports', () => {
  for (const [width, height] of [[320, 568], [360, 800], [844, 390], [1440, 900], [1920, 1080]]) {
    const scene = scenePositions(width, height);
    for (const point of [scene.home, scene.near, scene.far, scene.laboratory]) {
      assert.ok(point.x >= 0);
      assert.ok(point.y >= scene.viewport.top);
      assert.ok(point.x + scene.robotSize.width <= width);
      assert.ok(point.y + scene.robotSize.height <= height - scene.viewport.bottom);
    }
    assert.ok(scene.dronePad.x + 112 <= width);
    assert.ok(scene.dronePad.y + 88 <= height - scene.viewport.bottom);
  }
  assert.deepEqual(fitScenePoint({ x: -100, y: 900 }, { width: 320, height: 600, top: 64, bottom: 80 }), { x: 0, y: 310 });
});

test('one game layer persists across the LMS page changes', () => {
  assert.ok(html.includes('/campus-game.css?v=20261111-robot2'));
  assert.ok(html.includes('/campus-game.js?v=20261111-pro1'));
  assert.ok(html.indexOf('/campus-game.css') > html.indexOf('/hallaym-ui.css'));
  assert.ok(html.indexOf('/a11y.css') > html.indexOf('/campus-game.css'));
  assert.ok(!html.includes('science-divider-engineering'));
  assert.ok(!script.includes("document.addEventListener('hx:navigate', refresh)"));
});

test('body joints, drone rotors, empty glass and liquid layers are independent', () => {
  for (const part of ['head', 'torso', 'pelvis', 'upper-arm', 'forearm', 'hand', 'thigh', 'shin', 'boot', 'controller', 'table', 'drone-body', 'flask-empty', 'beaker-empty', 'splash-teal', 'splash-purple']) {
    assert.ok(existsSync(new URL('../public/assets/campus/rig/' + part + '.webp', import.meta.url)), part);
    assert.ok(css.includes('/assets/campus/rig/' + part + '.webp'), part);
  }
  for (const rotor of ['a', 'b', 'c', 'd']) assert.ok(script.includes('pg-rotor-' + rotor));
  for (const liquid of ['teal', 'amber', 'purple']) assert.ok(script.includes('pg-liquid-' + liquid));
  for (const pose of ['reach', 'pilot-run', 'mix', 'curious', 'surprise', 'laugh', 'wave']) assert.ok(script.includes("'" + pose + "'"), pose);
});

test('scene lifetimes cancel on tab suspension, resize and motion preference changes', () => {
  assert.ok(script.includes('lifetime?.abort()'));
  assert.ok(script.includes("signal.addEventListener('abort', abort, { once: true })"));
  assert.ok(script.includes("signal.removeEventListener('abort', abort)"));
  assert.ok(script.includes("document.addEventListener('visibilitychange', refresh)"));
  assert.ok(script.includes("window.addEventListener('pagehide', stop)"));
  assert.ok(script.includes("window.addEventListener('pageshow', refresh)"));
  assert.ok(script.includes("reducedMotion.addEventListener('change', refresh)"));
  assert.ok(css.includes('pointer-events:none'));
  assert.ok(css.includes('@media (prefers-reduced-motion:reduce)'));
  assert.ok(script.includes("toggle.setAttribute('aria-pressed', String(paused))"));
});

test('internal pages use distinct local backgrounds, all declared assets are cacheable', () => {
  for (const asset of ['chemistry-lab', 'robotics-lab', 'physics-lab', 'campus-courtyard']) {
    assert.ok(css.includes('/assets/campus/' + asset + '.webp'), asset);
    assert.ok(existsSync(new URL('../public/assets/campus/' + asset + '.webp', import.meta.url)), asset);
  }
  const sw = read('public/sw.js');
  assert.ok(sw.includes("'/campus-game.js'"));
  assert.ok(sw.includes("'/campus-game.css'"));
  assert.ok(sw.includes('assets\\/campus'));
});

test('dashboard metrics and workspace interiors use local illustrated props', () => {
  const app = read('public/app.js');
  assert.ok(app.includes('dashboardStatArt.get(i.label)'));
  assert.ok(css.includes('.ux-ws-sec:last-of-type .ux-empty'));
  for (const art of ['study', 'teach', 'team', 'calendar', 'signal', 'folder']) {
    assert.ok(existsSync(new URL('../public/assets/campus/cards/' + art + '.webp', import.meta.url)), art);
    assert.ok(css.includes('/assets/campus/cards/' + art + '.webp'), art);
  }
});

test('premium skin serves distinct photos without a full-page wash and keeps conference hooks', () => {
  assert.ok(!css.includes('--pg-wash'));
  assert.ok(!read('public/hallaym-ui.css').includes('--campus-shade'));
  assert.ok(css.includes('background:var(--pg-scene) center/cover no-repeat fixed'));
  for (const asset of ['atrium', 'lecture-theatre', 'reading-hall', 'media-studio', 'admin-lounge', 'seminar-room']) {
    assert.ok(existsSync(new URL('../public/assets/campus/' + asset + '.webp', import.meta.url)));
  }
  for (const hook of ['callMic', 'callCamera', 'callScreen', 'callFullscreen', 'lessonDrawer']) assert.ok(html.includes('id="' + hook + '"'));
  assert.ok(css.includes(':not(.video-cinema-fallback) #lesson .video-stage'));
});

test('propeller centers match the drone artwork and pour follows the flask tilt', () => {
  assert.ok(css.includes('.pg-rotor-a {left:15.1%;top:10.2%}'));
  assert.ok(css.includes('.pg-rotor-d {left:84.9%;top:83.3%}'));
  assert.ok(css.includes('.pg-robot[data-facing="left"] .pg-held-remote'));
  assert.ok(script.includes('M106 35 Q123 39 126 66'));
  assert.ok(script.includes("transform:'rotate(48deg)',offset:.24"));
  assert.ok(script.includes('destinationLiquid].map'));
});
