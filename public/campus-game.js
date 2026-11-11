// Articulated campus companion. Every sequence has one cancellable lifetime.
export function fitScenePoint(point, viewport, size = { width: 160, height: 210 }) {
  return {
    x: Math.max(0, Math.min(point.x, Math.max(0, viewport.width - size.width))),
    y: Math.max(viewport.top || 0, Math.min(point.y, Math.max(viewport.top || 0, viewport.height - size.height - (viewport.bottom || 0))))
  };
}

export function scenePositions(width, height, station) {
  const small = width < 700;
  const scale = small ? 0.64 : 0.86;
  const robotSize = { width: 160 * scale, height: 210 * scale };
  const viewport = { width, height, top: 74, bottom: small ? 84 : 12 };
  const bench = station || { x: 16, y: height - (small ? 165 : 120), width: small ? 125 : 180 };
  const point = (x, y) => fitScenePoint({ x, y }, viewport, robotSize);
  return {
    scale, viewport, robotSize, bench,
    home: point(bench.x + bench.width - 38, bench.y - robotSize.height + 50),
    dronePad: fitScenePoint({ x: bench.x + bench.width + 42, y: bench.y - 5 }, viewport, { width: 112, height: 88 }),
    near: point(width * 0.4, height * 0.56),
    far: point(width * 0.78, height * 0.28),
    laboratory: point(width * 0.68, height - robotSize.height - (small ? 130 : 62))
  };
}

function limb(side, kind) {
  const lower = kind === 'arm' ? 'forearm' : 'shin';
  const end = kind === 'arm' ? 'hand' : 'boot';
  return `<span class="pg-${kind} pg-${side}"><i class="pg-part pg-${kind}-upper"></i><span class="pg-${lower}"><i class="pg-part pg-${lower}-shell"></i><i class="pg-part pg-${end}"></i></span></span>`;
}

function createPlayground() {
  if (document.getElementById('campusPlayground')) return;
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = document.createElement('div');
  stage.id = 'campusPlayground';
  stage.setAttribute('aria-hidden', 'true');
  stage.innerHTML = `
    <div class="pg-bench"><i class="pg-table-remote"></i></div>
    <div class="pg-robot-position"><div class="pg-robot-scale"><div class="pg-robot-hop"><div class="pg-robot-flip"><div class="pg-robot" data-pose="idle">
      ${limb('left', 'leg')}${limb('right', 'leg')}
      ${limb('left', 'arm')}
      <i class="pg-part pg-hips"></i><i class="pg-part pg-torso"></i>
      <span class="pg-head-joint"><i class="pg-part pg-head"></i><i class="pg-eye-blink"></i><span class="pg-face" data-face="idle"><i class="pg-eye pg-eye-l"></i><i class="pg-eye pg-eye-r"></i><i class="pg-mouth"></i><i class="pg-blush"></i></span></span>
      ${limb('right', 'arm')}
      <i class="pg-held-remote"></i><i class="pg-robot-splat"></i>
    </div></div></div></div>
    <i class="pg-dizzy-ring">★ ✦ ★</i><span class="pg-say" hidden></span><i class="pg-robot-hit"></i></div>
    <div class="pg-drone-position"><div class="pg-drone-attitude">
      <i class="pg-drone-body"></i>
      <i class="pg-rotor pg-rotor-a"></i><i class="pg-rotor pg-rotor-b"></i>
      <i class="pg-rotor pg-rotor-c"></i><i class="pg-rotor pg-rotor-d"></i>
      <i class="pg-drone-light"></i>
    </div></div>
    <div class="pg-laboratory" hidden>
      <div class="pg-flask"><div class="pg-flask-mask"><i class="pg-liquid pg-liquid-teal"></i><i class="pg-liquid pg-liquid-amber"></i><i class="pg-bubble"></i><i class="pg-bubble"></i><i class="pg-bubble"></i></div><i class="pg-flask-glass"></i></div>
      <svg class="pg-liquid-stream" viewBox="0 0 185 110" aria-hidden="true"><path d="M106 35 Q123 39 126 66"/><path d="M106 35 Q123 39 126 66"/></svg>
      <div class="pg-beaker"><div class="pg-beaker-mask"><i class="pg-liquid pg-liquid-purple"></i><i class="pg-liquid pg-liquid-teal"></i></div><i class="pg-beaker-glass"></i></div>
      <i class="pg-lab-splash"></i><i class="pg-droplet"></i><i class="pg-droplet"></i><i class="pg-droplet"></i>
    </div>
    <i class="pg-ball" hidden></i>
    <i class="pg-block pg-block-a" data-l="H" hidden></i><i class="pg-block pg-block-b" data-l="E" hidden></i><i class="pg-block pg-block-c" data-l="★" hidden></i>
    <div class="pg-tramp" hidden><i class="pg-tramp-legs"></i><i class="pg-tramp-mat"></i></div>
    <i class="pg-skate" hidden></i><i class="pg-slide" hidden></i><i class="pg-portal" hidden></i>
    <i class="pg-rocket" hidden></i><div class="pg-volcano" hidden><i></i></div><i class="pg-plane" hidden></i>
    <div class="pg-plant" hidden><i class="pg-stem"></i><i class="pg-leaf"></i><i class="pg-bloom"></i><i class="pg-pot"></i></div>
    <div class="pg-fx"></div>`;
  document.body.append(stage);

  const station = document.createElement('div');
  station.className = 'pg-station-anchor';
  station.setAttribute('aria-hidden', 'true');
  document.querySelector('#sidebar nav')?.after(station);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'campusMotionToggle';
  toggle.className = 'pg-motion-toggle';
  toggle.innerHTML = '<span aria-hidden="true"></span>';
  document.body.append(toggle);
  let paused = false;
  try { paused = localStorage.getItem('campus-motion-paused') === '1'; } catch {}
  let lifetime = null;
  let resizeTimer = null;
  const robotPosition = stage.querySelector('.pg-robot-position');
  const robot = stage.querySelector('.pg-robot');
  const drone = stage.querySelector('.pg-drone-position');
  const attitude = stage.querySelector('.pg-drone-attitude');
  const bench = stage.querySelector('.pg-bench');
  const tableRemote = stage.querySelector('.pg-table-remote');
  const heldRemote = stage.querySelector('.pg-held-remote');
  const lab = stage.querySelector('.pg-laboratory');
  const flask = stage.querySelector('.pg-flask');
  const stream = stage.querySelector('.pg-liquid-stream');
  const sourceLiquid = stage.querySelectorAll('.pg-flask .pg-liquid');
  const destinationLiquid = stage.querySelectorAll('.pg-beaker .pg-liquid');
  const splat = stage.querySelector('.pg-robot-splat');
  const hop = stage.querySelector('.pg-robot-hop');
  const flip = stage.querySelector('.pg-robot-flip');
  const say = stage.querySelector('.pg-say');
  const hit = stage.querySelector('.pg-robot-hit');
  const fx = stage.querySelector('.pg-fx');
  const ball = stage.querySelector('.pg-ball');
  const blocks = [...stage.querySelectorAll('.pg-block')];
  const tramp = stage.querySelector('.pg-tramp');
  const trampMat = stage.querySelector('.pg-tramp-mat');
  let sayTimer = null;
  let dizzyTimer = null;
  let pokes = [];
  const faceEl = stage.querySelector('.pg-face');
  const skate = stage.querySelector('.pg-skate');
  const slideEl = stage.querySelector('.pg-slide');
  const portal = stage.querySelector('.pg-portal');
  const rocket = stage.querySelector('.pg-rocket');
  const volcanoEl = stage.querySelector('.pg-volcano');
  const plane = stage.querySelector('.pg-plane');
  const plant = stage.querySelector('.pg-plant');
  const connections = navigator.connection;
  let robotPoint = { x: 0, y: 0 };
  let dronePoint = { x: 0, y: 0 };

  function layout() {
    const bounds = station.getBoundingClientRect();
    const isSidebarVisible = innerWidth > 900 && !document.querySelector('#shell')?.classList.contains('hidden');
    const stationPoint = isSidebarVisible && bounds.width ? {
      x: bounds.x + (bounds.width - 168) / 2,
      y: bounds.y + 24,
      width: 168
    } : null;
    const positions = scenePositions(innerWidth, innerHeight, stationPoint);
    stage.style.setProperty('--pg-scale', String(positions.scale));
    bench.style.width = `${positions.bench.width}px`;
    bench.style.transform = `translate(${positions.bench.x}px,${positions.bench.y}px)`;
    return positions;
  }

  function place(element, point) {
    element.style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
  }

  function stop() {
    lifetime?.abort();
    lifetime = null;
    stage.dataset.motors = 'off';
    stage.dataset.experiment = '';
    stage.dataset.remote = 'table';
    tableRemote.style.transform = '';
    robot.dataset.pose = 'idle';
    lab.hidden = true;
    splat.style.opacity = '0';
    splat.style.transform = '';
    stage.dataset.activity = '';
    stage.dataset.dizzy = '';
    stage.dataset.hang = '';
    stage.dataset.rocket = '';
    stage.dataset.volcano = '';
    stage.dataset.plant = '';
    for (const prop of [ball, tramp, ...blocks, skate, slideEl, portal, rocket, volcanoEl, plane, plant]) prop.hidden = true;
    flip.style.opacity = '';
    flip.style.transform = '';
    hop.style.transform = '';
    fx.replaceChildren();
    clearTimeout(sayTimer);
    clearTimeout(dizzyTimer);
    say.hidden = true;
  }

  function park(positions) {
    robotPoint = positions.home;
    dronePoint = positions.dronePad;
    place(robotPosition, robotPoint);
    place(drone, dronePoint);
    attitude.style.transform = '';
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  async function animate(element, frames, options, signal) {
    if (signal.aborted) throw signal.reason;
    const animation = element.animate(frames, { fill: 'forwards', ...options });
    const abort = () => animation.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try {
      await animation.finished;
      if (signal.aborted) throw signal.reason;
      const final = frames[frames.length - 1];
      for (const property of ['transform', 'opacity']) {
        if (final[property] !== undefined) element.style[property] = final[property];
      }
    } finally {
      signal.removeEventListener('abort', abort);
      animation.cancel();
    }
  }

  function faceRobot(direction) {
    robot.dataset.facing = direction < 0 ? 'left' : 'right';
    robot.style.setProperty('--pg-facing', String(direction));
  }

  async function walk(point, duration, signal, pose = 'walk') {
    robot.dataset.pose = pose;
    faceRobot(point.x < robotPoint.x ? -1 : 1);
    await animate(robotPosition, [
      { transform: `translate3d(${robotPoint.x}px,${robotPoint.y}px,0)` },
      { transform: `translate3d(${point.x}px,${point.y}px,0)` }
    ], { duration, easing: 'linear' }, signal);
    robotPoint = point;
    robot.dataset.pose = pose === 'pilot-run' ? 'pilot' : 'idle';
  }

  async function transferRemote(pickup, signal) {
    const table = tableRemote.getBoundingClientRect();
    const hand = heldRemote.getBoundingClientRect();
    const atHand = `translate3d(${hand.x + hand.width / 2 - table.x - table.width / 2}px,${hand.y + hand.height / 2 - table.y - table.height / 2}px,0) scale(${hand.width / table.width})`;
    const atTable = 'translate3d(0,0,0)';
    stage.dataset.remote = 'transfer';
    const frames = pickup ? [atTable, atHand] : [atHand, atTable];
    await animate(tableRemote, frames.map(transform => ({ transform })), { duration: 500, easing: 'ease-in-out' }, signal);
    stage.dataset.remote = pickup ? 'held' : 'table';
    tableRemote.style.transform = '';
  }

  async function fly(points, duration, rotations, signal) {
    stage.dataset.motors = 'on';
    const viewport = { width: innerWidth, height: innerHeight, top: 74, bottom: innerWidth < 700 ? 84 : 12 };
    const safe = points.map(point => fitScenePoint(point, viewport, { width: 112, height: 88 }));
    const frames = [dronePoint, ...safe].map(point => ({ transform: `translate3d(${point.x}px,${point.y}px,0)` }));
    await Promise.all([
      animate(drone, frames, { duration, easing: 'ease-in-out' }, signal),
      animate(attitude, rotations.map(transform => ({ transform })), { duration, easing: 'ease-in-out' }, signal)
    ]);
    dronePoint = safe[safe.length - 1];
  }

  // ---- Playground helpers -------------------------------------------------
  const scaleNow = () => Number(stage.style.getPropertyValue('--pg-scale')) || 0.86;
  const at = point => `translate3d(${point.x}px,${point.y}px,0)`;
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function robotHead() {
    const s = scaleNow();
    return { x: robotPoint.x + 80 * s, y: robotPoint.y + 18 * s };
  }

  function walkTo(point, signal, pose = 'walk', speed = 110) {
    const distance = Math.hypot(point.x - robotPoint.x, point.y - robotPoint.y);
    if (distance < 4) return Promise.resolve();
    return walk(point, Math.max(450, (distance / speed) * 1000), signal, pose);
  }

  // Floor row in the content area, clear of the sidebar workbench.
  function arena(positions) {
    const { viewport, robotSize, scale } = positions;
    const side = innerWidth > 900 ? document.getElementById('sidebar')?.getBoundingClientRect() : null;
    const left = side && side.width ? side.right + 16 : 8;
    const right = innerWidth - 8;
    const y = positions.laboratory.y;
    return {
      left, right, y, scale,
      floor: y + 206 * scale,
      x0: left + (right - left) * 0.3,
      point: x => fitScenePoint({ x, y }, viewport, robotSize)
    };
  }

  function show(prop, x, y, width, height) {
    prop.style.width = `${width}px`;
    prop.style.height = `${height}px`;
    prop.style.transform = at({ x, y });
    prop.style.opacity = '1';
    prop.hidden = false;
  }

  function burst(x, y, kind, count = 8, spread = 70) {
    if (fx.childElementCount > 60) return;
    const glyph = { heart: '♥', note: '♪', star: '★', spark: '✦', zzz: 'z', dust: '●', smoke: '●', lava: '●', drop: '●', bubble: '○' }[kind];
    const rising = kind === 'note' || kind === 'zzz' || kind === 'smoke' || kind === 'bubble' || kind === 'lava';
    for (let i = 0; i < count; i += 1) {
      const bit = document.createElement('i');
      bit.className = `pg-fx-bit pg-fx-${kind}`;
      bit.textContent = kind === 'note' && i % 2 ? '♫' : glyph;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const distance = spread * (0.55 + Math.random() * 0.6);
      const dx = rising ? Math.random() * 50 - 25 : Math.cos(angle) * distance;
      const dy = rising ? -(60 + Math.random() * 50) : Math.sin(angle) * distance - spread * 0.45;
      bit.style.left = `${x}px`;
      bit.style.top = `${y}px`;
      bit.style.setProperty('--dx', `${dx}px`);
      bit.style.setProperty('--dy', `${dy}px`);
      bit.style.setProperty('--r', `${Math.round(Math.random() * 90 - 45)}deg`);
      bit.style.animationDelay = `${i * 40}ms`;
      bit.addEventListener('animationend', () => bit.remove(), { once: true });
      fx.append(bit);
    }
  }

  function speak(text, ms = 2400) {
    clearTimeout(sayTimer);
    say.textContent = text;
    say.style.setProperty('--say-shift', '0px');
    say.hidden = false;
    const box = say.getBoundingClientRect();
    const shift = box.left < 6 ? 6 - box.left : box.right > innerWidth - 6 ? innerWidth - 6 - box.right : 0;
    say.style.setProperty('--say-shift', `${shift}px`);
    say.classList.remove('pg-say-in');
    void say.offsetWidth;
    say.classList.add('pg-say-in');
    sayTimer = setTimeout(() => { say.hidden = true; }, ms);
  }

  // Ballistic path with damped bounces for the ball.
  function bounceFrames(from, to, floorY, height, bounces, spin) {
    const frames = [];
    for (let i = 0; i <= 30; i += 1) {
      const t = i / 30;
      const x = from + (to - from) * (1 - Math.pow(1 - t, 1.6));
      const y = floorY - Math.abs(Math.sin(Math.PI * bounces * t)) * height * Math.pow(1 - t, 1.3);
      frames.push({ transform: `translate3d(${x}px,${y}px,0) rotate(${spin * t}deg)` });
    }
    return frames;
  }

  async function jumpTo(point, height, duration, signal) {
    const peak = { x: (robotPoint.x + point.x) / 2, y: Math.max(8, Math.min(robotPoint.y, point.y) - height) };
    await animate(robotPosition, [
      { transform: at(robotPoint), easing: 'ease-out' },
      { transform: at(peak), offset: 0.5, easing: 'ease-in' },
      { transform: at(point) }
    ], { duration }, signal);
    robotPoint = point;
  }

  // ---- Activities ----------------------------------------------------------
  async function droneShow(positions, signal) {
    const { bench: table, dronePad } = positions;
    await walkTo(positions.home, signal);
    faceRobot(-1);
    robot.dataset.pose = 'reach';
    await sleep(750, signal);
    await transferRemote(true, signal);
    robot.dataset.pose = 'pilot';
    stage.dataset.motors = 'spool';
    await sleep(1100, signal);

    await Promise.all([
      fly([
        { x: table.x + table.width + 70, y: table.y - 150 },
        { x: innerWidth * 0.7, y: innerHeight * 0.21 },
        { x: innerWidth * 0.85, y: innerHeight * 0.4 }
      ], 8500, ['rotateX(0deg) rotateZ(0deg)', 'rotateX(18deg) rotateZ(-17deg)', 'rotateX(-12deg) rotateZ(17deg)', 'rotateX(0deg) rotateZ(0deg)'], signal),
      walk(positions.near, 6200, signal, 'pilot-run')
    ]);
    robot.dataset.pose = 'pilot';
    await fly([
      { x: innerWidth * 0.6, y: innerHeight * 0.35 },
      { x: innerWidth * 0.34, y: innerHeight * 0.18 },
      { x: innerWidth * 0.72, y: innerHeight * 0.54 }
    ], 7200, ['rotateY(0deg) rotateZ(0deg)', 'rotateY(180deg) rotateZ(-18deg)', 'rotateY(360deg) rotateZ(360deg)', 'rotateY(360deg) rotateZ(360deg)'], signal);
    await Promise.all([
      fly([
        { x: innerWidth * 0.22, y: innerHeight * 0.3 },
        { x: innerWidth * 0.8, y: innerHeight * 0.16 },
        { x: innerWidth * 0.56, y: innerHeight * 0.55 }
      ], 7400, ['rotateX(0deg) rotateY(0deg)', 'rotateX(18deg) rotateY(-40deg)', 'rotateX(360deg) rotateY(-60deg)', 'rotateX(360deg) rotateY(0deg)'], signal),
      walk(positions.far, 5400, signal, 'pilot-run')
    ]);
    robot.dataset.pose = 'pilot';
    await sleep(850, signal);
    await Promise.all([
      fly([{ x: dronePad.x + 12, y: dronePad.y - 94 }, dronePad], 4600,
        ['rotateZ(12deg)', 'rotateZ(-8deg)', 'rotateZ(0deg)'], signal),
      walk(positions.home, 4600, signal, 'pilot-run')
    ]);
    stage.dataset.motors = 'off';
    robot.dataset.pose = 'reach';
    await sleep(420, signal);
    await transferRemote(false, signal);
    await sleep(600, signal);

  }

  async function labExperiment(positions, signal) {
    const { viewport, robotSize } = positions;
    const point = (x, y) => fitScenePoint({ x, y }, viewport, robotSize);
    const labScale = innerWidth <= 540 ? 0.75 : 1;
    const labPoint = fitScenePoint({ x: positions.laboratory.x + 72, y: positions.laboratory.y + robotSize.height - 88 }, viewport, { width: 185 * labScale, height: 110 * labScale });
    lab.style.transform = `translate(${labPoint.x}px,${labPoint.y}px)`;
    for (const liquid of sourceLiquid) liquid.style.transform = '';
    for (const liquid of destinationLiquid) liquid.style.transform = 'translateY(22px)';
    stream.style.opacity = '0';
    lab.hidden = false;
    await walk(point(labPoint.x - robotSize.width + 25, positions.laboratory.y), 4300, signal);
    faceRobot(1);
    robot.dataset.pose = 'mix';
    stage.dataset.experiment = 'mix';
    const duration = 3800;
    const pourFrames = (start, end, out = end) => [
      {transform:start,offset:0},{transform:start,offset:.24},{transform:end,offset:.78},{transform:out,offset:1}
    ];
    await Promise.all([
      animate(flask, [{transform:'rotate(0deg)',offset:0},{transform:'rotate(48deg)',offset:.24},{transform:'rotate(48deg)',offset:.78},{transform:'rotate(0deg)',offset:1}], {duration}, signal),
      animate(stream, [{opacity:0,offset:0},{opacity:0,offset:.24},{opacity:1,offset:.3},{opacity:1,offset:.73},{opacity:0,offset:.78},{opacity:0,offset:1}], {duration}, signal),
      ...[...sourceLiquid].map(el=>animate(el,[{transform:'translateY(0) rotate(0deg)',offset:0},{transform:'translateY(0) rotate(-48deg)',offset:.24},{transform:'translateY(25px) rotate(-48deg)',offset:.78},{transform:'translateY(25px) rotate(0deg)',offset:1}],{duration},signal)),
      ...[...destinationLiquid].map(el=>animate(el,pourFrames('translateY(22px)','translateY(-4px)'),{duration},signal))
    ]);
    stage.dataset.experiment = 'bubble';
    robot.dataset.pose = 'curious';
    await sleep(2400, signal);
    stage.dataset.experiment = 'splash';
    await sleep(150, signal);
    robot.dataset.pose = 'surprise';
    splat.style.transform = '';
    splat.style.opacity = '1';
    await animate(robotPosition, [
      { transform: `translate(${robotPoint.x}px,${robotPoint.y}px)` },
      { transform: `translate(${robotPoint.x - 12}px,${robotPoint.y - 18}px)` },
      { transform: `translate(${robotPoint.x}px,${robotPoint.y}px)` }
    ], { duration: 650, easing: 'ease-out' }, signal);
    robot.dataset.pose = 'laugh';
    await sleep(2800, signal);
    stage.dataset.experiment = 'settle';
    await animate(splat, [{ opacity: '1', transform: 'translateY(0)' }, { opacity: '0', transform: 'translateY(36px)' }], { duration: 1200 }, signal);
    await walkTo(positions.home, signal);
    lab.hidden = true;
    stage.dataset.experiment = '';
  }

  async function ballGame(positions, signal) {
    const a = arena(positions);
    const size = Math.round(40 * a.scale);
    const robotWidth = positions.robotSize.width;
    const ballY = a.floor - size;
    const start = a.point(a.x0);
    await walkTo(start, signal);
    faceRobot(1);
    let ballX = start.x + robotWidth * 0.74;
    show(ball, ballX, ballY - 180, size, size);
    speak('Futbol vaqti!');
    await animate(ball, bounceFrames(ballX, ballX, ballY, 180, 1.5, 200).slice(10), { duration: 900 }, signal);
    robot.dataset.pose = 'kick';
    await sleep(320, signal);
    robot.dataset.pose = 'kick-follow';
    const farX = Math.min(a.right - size, ballX + Math.max(220, (a.right - ballX) * 0.7));
    await animate(ball, bounceFrames(ballX, farX, ballY, 120 * a.scale + 40, 3, 900), { duration: 1500 }, signal);
    ballX = farX;
    burst(ballX + size / 2, ballY, 'star', 6, 50);
    robot.dataset.pose = 'cheer';
    speak('GOOL!', 1600);
    await sleep(900, signal);
    await walkTo(a.point(ballX + size * 0.2), signal, 'walk', 170);
    faceRobot(-1);
    robot.dataset.pose = 'kick';
    await sleep(320, signal);
    robot.dataset.pose = 'kick-follow';
    const backX = Math.max(a.left, ballX - Math.max(240, (ballX - a.left) * 0.6));
    await animate(ball, bounceFrames(ballX, backX, ballY, 170 * a.scale + 30, 2, -1080), { duration: 1600 }, signal);
    burst(backX + size / 2, ballY - 10, 'spark', 8, 60);
    robot.dataset.pose = 'cheer';
    await sleep(700, signal);
    await animate(ball, [{ opacity: '1' }, { opacity: '0' }], { duration: 400 }, signal);
    ball.hidden = true;
  }

  async function blockTower(positions, signal) {
    const a = arena(positions);
    const size = Math.round(32 * a.scale + 4);
    const start = a.point(a.x0 + 30);
    await walkTo(start, signal);
    faceRobot(1);
    const towerX = start.x + positions.robotSize.width * 0.8;
    const ground = a.floor - size;
    const piles = blocks.map((block, i) => ({ x: Math.min(a.right - size, towerX + size * (1.9 + i * 1.35)), y: ground }));
    blocks.forEach((block, i) => show(block, piles[i].x, piles[i].y, size, size));
    await Promise.all(blocks.map((block, i) => animate(block, [
      { transform: `${at(piles[i])} scale(0)` },
      { transform: `${at(piles[i])} scale(1.2)`, offset: 0.7 },
      { transform: `${at(piles[i])} scale(1)` }
    ], { duration: 420, delay: i * 120 }, signal)));
    speak('Minora quramiz!');
    for (let i = 0; i < blocks.length; i += 1) {
      const slot = { x: towerX, y: ground - i * size };
      robot.dataset.pose = 'reach';
      await sleep(260, signal);
      await animate(blocks[i], [
        { transform: `${at(piles[i])} rotate(0deg)`, easing: 'ease-out' },
        { transform: `${at({ x: (piles[i].x + slot.x) / 2, y: slot.y - 70 })} rotate(180deg)`, offset: 0.5, easing: 'ease-in' },
        { transform: `${at(slot)} rotate(360deg)` }
      ], { duration: 650 }, signal);
      burst(slot.x + size / 2, slot.y + size, 'spark', 4, 30);
      robot.dataset.pose = 'idle';
      await sleep(180, signal);
    }
    robot.dataset.pose = 'cheer';
    speak('Tayyor!', 1500);
    burst(towerX + size / 2, ground - size * 2.4, 'star', 9, 70);
    await sleep(1300, signal);
    await Promise.all(blocks.map((block, i) => animate(block, [
      { transform: `${at({ x: towerX, y: ground - i * size })} rotate(0deg)` },
      { transform: `${at({ x: towerX + 6 + i * 4, y: ground - i * size })} rotate(${8 + i * 6}deg)`, offset: 0.3 },
      { transform: `${at({ x: Math.min(a.right - size, towerX + size * (1 + i * 1.1)), y: ground })} rotate(${90 + i * 75}deg)` }
    ], { duration: 900, delay: i * 70, easing: 'cubic-bezier(.5,0,.8,.4)' }, signal)));
    robot.dataset.pose = 'surprise';
    speak('Voy-voy!', 1400);
    await sleep(900, signal);
    robot.dataset.pose = 'laugh';
    await sleep(1600, signal);
    await Promise.all(blocks.map(block => animate(block, [{ opacity: '1' }, { opacity: '0' }], { duration: 450 }, signal)));
    for (const block of blocks) block.hidden = true;
  }

  async function trampoline(positions, signal) {
    const a = arena(positions);
    const width = Math.round(140 * a.scale);
    const height = Math.round(40 * a.scale);
    const robotWidth = positions.robotSize.width;
    const base = a.point(a.x0 + 140);
    const trampX = base.x + robotWidth / 2 - width / 2;
    const trampY = a.floor - height + 6;
    show(tramp, trampX, trampY, width, height);
    await animate(tramp, [{ transform: `${at({ x: trampX, y: trampY })} scale(0)` }, { transform: `${at({ x: trampX, y: trampY })} scale(1)` }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' }, signal);
    await walkTo(a.point(base.x - robotWidth * 0.95), signal);
    faceRobot(1);
    speak('Batutda sakraymiz!');
    const onTop = { x: base.x, y: base.y - height * 0.45 };
    robot.dataset.pose = 'tuck';
    await jumpTo(onTop, 50, 560, signal);
    const squash = () => animate(trampMat, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.35)', offset: 0.35 }, { transform: 'scaleY(1.1)', offset: 0.7 }, { transform: 'scaleY(1)' }], { duration: 300 }, signal);
    for (let i = 0; i < 5; i += 1) {
      robot.dataset.pose = 'idle';
      await squash();
      robot.dataset.pose = 'tuck';
      const rise = Math.min(onTop.y - 10, (70 + i * 26) * (a.scale + 0.2));
      const duration = 640 + i * 70;
      const trick = i >= 2 ? [
        animate(flip, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${i === 4 ? -720 : -360}deg)` }], { duration, easing: 'ease-in-out' }, signal)
      ] : [];
      await Promise.all([
        animate(robotPosition, [
          { transform: at(onTop), easing: 'ease-out' },
          { transform: at({ x: onTop.x, y: onTop.y - rise }), offset: 0.5, easing: 'ease-in' },
          { transform: at(onTop) }
        ], { duration }, signal),
        ...trick
      ]);
      flip.style.transform = '';
      burst(robotHead().x, onTop.y + positions.robotSize.height, 'spark', 5, 40);
    }
    robot.dataset.pose = 'cheer';
    speak('Ura!', 1400);
    burst(robotHead().x, robotHead().y, 'star', 10, 80);
    await sleep(700, signal);
    robot.dataset.pose = 'tuck';
    await jumpTo(a.point(base.x + robotWidth * 0.9), 60, 600, signal);
    robot.dataset.pose = 'idle';
    await animate(tramp, [{ opacity: '1' }, { opacity: '0' }], { duration: 400 }, signal);
    tramp.hidden = true;
  }

  // Each party mixes four styles; every style has its own pose and moves.
  const DANCES = [
    { pose: 'dance', line: 'Diskoteka!' },
    { pose: 'dance-disco', line: 'Disko yulduzi!' },
    { pose: 'dance-robot', line: 'Robot raqsi!' },
    { pose: 'dance-twist', line: 'Tvist!' },
    { pose: 'dance-floss', line: 'Floss!' },
    { pose: 'dance-lazgi', line: 'Lazgi!' },
    { pose: 'dance-kick', line: 'Kazachok!' },
    { pose: 'moonwalk', line: 'Oy yurishi!', move: 'moon' },
    { pose: 'tuck', line: 'Piruet!', move: 'spin' }
  ];

  async function danceParty(positions, signal) {
    const a = arena(positions);
    await walkTo(a.point(a.x0 + 90), signal);
    faceRobot(1);
    stage.dataset.activity = 'dance';
    const set = [...DANCES].sort(() => Math.random() - 0.5).slice(0, 4);
    for (const style of set) {
      robot.dataset.pose = style.pose;
      speak(style.line, 1500);
      if (style.move === 'moon') {
        // glide backwards while the feet walk forwards
        const back = a.point(Math.max(a.left, robotPoint.x - 150 * a.scale));
        stage.dataset.activity = '';
        await animate(robotPosition, [{ transform: at(robotPoint) }, { transform: at(back) }], { duration: 2400, easing: 'linear' }, signal);
        robotPoint = back;
        stage.dataset.activity = 'dance';
      } else if (style.move === 'spin') {
        stage.dataset.activity = '';
        await animate(flip, [{ transform: 'rotateY(0deg) translateY(0)' }, { transform: 'rotateY(540deg) translateY(-26px)', offset: 0.5 }, { transform: 'rotateY(1080deg) translateY(0)' }], { duration: 1800, easing: 'ease-in-out' }, signal);
        flip.style.transform = '';
        robot.dataset.pose = 'cheer';
        await sleep(500, signal);
        stage.dataset.activity = 'dance';
      } else {
        for (let beat = 0; beat < 5; beat += 1) {
          const head = robotHead();
          burst(head.x + (beat % 2 ? 46 : -46) * a.scale, head.y + 10, 'note', 2, 50);
          await sleep(480, signal);
        }
      }
    }
    stage.dataset.activity = '';
    robot.dataset.pose = 'bow';
    burst(robotHead().x, robotHead().y, 'heart', 8, 70);
    await sleep(1300, signal);
    robot.dataset.pose = 'idle';
  }

  async function nap(positions, signal) {
    const a = arena(positions);
    await walkTo(a.point(a.x0 + 20), signal);
    faceRobot(1);
    speak('Biroz dam olaman...', 1800);
    stage.dataset.activity = 'sleep';
    robot.dataset.pose = 'sleep';
    for (let i = 0; i < 7; i += 1) {
      const head = robotHead();
      burst(head.x + 24 * a.scale, head.y + 8, 'zzz', 1, 40);
      await sleep(900, signal);
    }
    stage.dataset.activity = '';
    robot.dataset.pose = 'surprise';
    speak('Uxlab qolibman!', 1500);
    await sleep(1100, signal);
    robot.dataset.pose = 'idle';
  }

  // ---- Face: expressions + eyes that follow the pointer ---------------------
  const POSE_FACE = {
    idle: 'idle', walk: 'idle', wave: 'happy', cheer: 'happy', laugh: 'laugh', bow: 'happy', dance: 'happy',
    surprise: 'surprised', curious: 'curious', sleep: 'sleep', kick: 'determined', 'kick-follow': 'happy',
    tuck: 'excited', pilot: 'focus', 'pilot-run': 'focus', mix: 'focus', reach: 'focus', push: 'determined',
    sit: 'idle', hang: 'excited', squat: 'determined', skate: 'excited', pull: 'determined',
    'dance-disco': 'excited', 'dance-robot': 'focus', 'dance-twist': 'happy', 'dance-floss': 'laugh', 'dance-lazgi': 'love', 'dance-kick': 'excited', moonwalk: 'wink'
  };
  let faceLock = 0;
  let faceTimer = null;
  let pointer = null;
  let lookFrame = 0;

  function setFace(name, ms = 0) {
    clearTimeout(faceTimer);
    faceEl.dataset.face = name;
    faceLock = ms ? performance.now() + ms : 0;
    if (ms) faceTimer = setTimeout(() => { faceLock = 0; faceEl.dataset.face = POSE_FACE[robot.dataset.pose] || 'idle'; }, ms);
  }
  new MutationObserver(() => {
    if (performance.now() < faceLock) return;
    faceEl.dataset.face = POSE_FACE[robot.dataset.pose] || 'idle';
  }).observe(robot, { attributes: true, attributeFilter: ['data-pose'] });

  function look() {
    lookFrame = 0;
    if (!pointer || stage.hidden) return;
    const head = robotHead();
    const facing = Number(robot.style.getPropertyValue('--pg-facing')) || 1;
    const dx = pointer.x - head.x, dy = pointer.y - head.y, distance = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, distance / 200);
    faceEl.style.setProperty('--lx', `${((dx / distance) * reach * facing * 2.8).toFixed(2)}px`);
    faceEl.style.setProperty('--ly', `${((dy / distance) * reach * 2.2).toFixed(2)}px`);
    // a cursor that comes close gets a smile
    if (distance < 130 && faceEl.dataset.face === 'idle' && performance.now() > faceLock) setFace('happy', 1400);
  }
  window.addEventListener('pointermove', event => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!lookFrame) lookFrame = requestAnimationFrame(look);
  }, { passive: true });

  // ---- Page cards: the robot may sit on, push, kick or tug them -------------
  // Cards are only nudged with temporary animations; nothing is left behind.
  const CARD_SELECTOR = 'article, .stat, .gx-card, .lesson-row, .page-head, .edu-banner';

  function pickCard(fit) {
    const page = document.querySelector('#main>.page.active');
    if (!page || page.id === 'lesson' || page.id === 'videoWatch') return null;
    const side = innerWidth > 900 ? document.getElementById('sidebar')?.getBoundingClientRect().right || 0 : 0;
    const cards = [...page.querySelectorAll(CARD_SELECTOR)].filter(card => {
      const r = card.getBoundingClientRect();
      return r.width > 140 && r.height > 40 && r.left > side - 4 && r.right < innerWidth + 4 && (!fit || fit(r));
    });
    return cards.length ? pick(cards) : null;
  }

  function nextFrame(signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      requestAnimationFrame(() => (signal.aborted ? reject(signal.reason) : resolve()));
    });
  }

  async function jolt(element, frames, options, signal) {
    if (signal.aborted) throw signal.reason;
    const animation = element.animate(frames, { duration: 700, easing: 'ease-out', ...options });
    const abort = () => animation.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try { await animation.finished.catch(() => {}); } finally { signal.removeEventListener('abort', abort); animation.cancel(); }
    if (signal.aborted) throw signal.reason;
  }

  // Squat, spring, land with a dusty knee bend.
  async function leap(point, height, duration, signal, trick = 0) {
    robot.dataset.pose = 'squat';
    await sleep(170, signal);
    robot.dataset.pose = 'tuck';
    faceRobot(point.x < robotPoint.x ? -1 : 1);
    await Promise.all([
      jumpTo(point, height, duration, signal),
      trick ? animate(flip, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${trick}deg)` }], { duration, easing: 'ease-in-out' }, signal).then(() => { flip.style.transform = ''; }) : null
    ]);
    robot.dataset.pose = 'squat';
    const s = scaleNow();
    burst(robotPoint.x + 80 * s, robotPoint.y + 205 * s, 'dust', 6, 36);
    await sleep(200, signal);
    robot.dataset.pose = 'idle';
  }

  async function perchOnCard(positions, signal) {
    const s = positions.scale, hip = 142 * s, width = positions.robotSize.width;
    const card = pickCard(r => r.top > 150 && r.top < innerHeight - 160);
    if (!card) return;
    const r0 = card.getBoundingClientRect();
    const offset = { x: Math.min(r0.width - width * 0.7, Math.max(-width * 0.2, r0.width * (0.15 + Math.random() * 0.5) - width / 2)), y: -hip };
    await leap({ x: r0.left + offset.x, y: r0.top + offset.y }, 90, 760, signal);
    faceRobot(r0.left + offset.x + width / 2 < innerWidth / 2 ? 1 : -1);
    robot.dataset.pose = 'sit';
    stage.dataset.activity = 'sit';
    speak(pick(['Bu yer qulay ekan!', 'Sizni kuzataman', 'Dam olamiz?', 'Nima qilyapsiz?']), 2200);
    const end = performance.now() + 9000;
    let gestured = 0;
    while (performance.now() < end) {
      const r = card.getBoundingClientRect();
      if (!card.isConnected || !card.closest('.page.active') || r.top < 70 || r.top > innerHeight - 60) break;
      robotPoint = { x: r.left + offset.x, y: r.top + offset.y };
      place(robotPosition, robotPoint);
      const elapsed = 9000 - (end - performance.now());
      if (elapsed > 3200 && gestured === 0) { gestured = 1; setFace('love', 1600); burst(robotHead().x, robotHead().y, 'heart', 5, 50); }
      if (elapsed > 6200 && gestured === 1) { gestured = 2; setFace('wink', 1200); }
      await nextFrame(signal);
    }
    stage.dataset.activity = '';
    const a = arena(positions);
    await leap(a.point(Math.max(a.left, Math.min(robotPoint.x, a.right - width))), 40, 640, signal);
  }

  async function pushCard(positions, signal) {
    const width = positions.robotSize.width, height = positions.robotSize.height;
    const card = pickCard(r => r.bottom > height + 80 && r.bottom < innerHeight - 10 && r.left > width * 0.6);
    if (!card) return;
    const r = card.getBoundingClientRect();
    const spot = fitScenePoint({ x: r.left - width * 0.62, y: r.bottom - height }, positions.viewport, positions.robotSize);
    await walkTo(spot, signal);
    faceRobot(1);
    const kick = Math.random() < 0.5;
    if (kick) {
      speak('Tep!', 1200);
      robot.dataset.pose = 'kick';
      await sleep(330, signal);
      robot.dataset.pose = 'kick-follow';
      burst(r.left, r.bottom - 20, 'star', 6, 40);
      await jolt(card, [
        { transform: 'none' }, { transform: 'translate(12px,-10px) rotate(2.2deg)', offset: 0.22 },
        { transform: 'translate(-4px,2px) rotate(-1deg)', offset: 0.55 }, { transform: 'translate(2px,0) rotate(.4deg)', offset: 0.8 }, { transform: 'none' }
      ], { duration: 820 }, signal);
      robot.dataset.pose = 'laugh';
      await sleep(1300, signal);
    } else {
      speak('Bir, ikki... itaramiz!', 1600);
      robot.dataset.pose = 'push';
      const pushed = { x: spot.x + 18, y: spot.y };
      await Promise.all([
        jolt(card, [
          { transform: 'none' }, { transform: 'translateX(20px) rotate(.7deg)', offset: 0.6 }, { transform: 'translateX(18px) rotate(.5deg)', offset: 0.66 },
          { transform: 'translateX(-6px) rotate(-.4deg)', offset: 0.8 }, { transform: 'translateX(2px)', offset: 0.9 }, { transform: 'none' }
        ], { duration: 2300, easing: 'ease-in-out' }, signal),
        (async () => {
          await animate(robotPosition, [{ transform: at(spot) }, { transform: at(pushed) }], { duration: 1400, easing: 'ease-in-out' }, signal);
          robotPoint = pushed;
          robot.dataset.pose = 'surprise';
        })()
      ]);
      speak('Qaytib keldi-ku!', 1500);
      robot.dataset.pose = 'laugh';
      await sleep(1200, signal);
    }
  }

  async function tugCard(positions, signal) {
    const width = positions.robotSize.width, height = positions.robotSize.height;
    const card = pickCard(r => r.bottom > 120 && r.bottom + height + 6 < innerHeight - positions.viewport.bottom);
    if (!card) return;
    const r = card.getBoundingClientRect();
    const spot = fitScenePoint({ x: r.left + r.width * (0.2 + Math.random() * 0.5) - width / 2, y: r.bottom - 14 * positions.scale }, positions.viewport, positions.robotSize);
    await walkTo({ x: spot.x, y: Math.max(spot.y, robotPoint.y) }, signal);
    await leap(spot, 30, 420, signal);
    robot.dataset.pose = 'pull';
    speak('Pastga tushamiz!', 1500);
    await Promise.all([
      jolt(card, [
        { transform: 'none' }, { transform: 'translateY(16px) scaleY(1.02)', offset: 0.45 }, { transform: 'translateY(14px)', offset: 0.62 },
        { transform: 'translateY(-8px)', offset: 0.76 }, { transform: 'translateY(3px)', offset: 0.88 }, { transform: 'none' }
      ], { duration: 1750, easing: 'ease-in-out' }, signal),
      animate(hop, [
        { transform: 'translateY(0)' }, { transform: 'translateY(16px)', offset: 0.45 }, { transform: 'translateY(14px)', offset: 0.62 },
        { transform: 'translateY(40px) rotate(-8deg)', offset: 0.8 }, { transform: 'translateY(0)' }
      ], { duration: 1750, easing: 'ease-in-out' }, signal),
      sleep(1080, signal).then(() => { robot.dataset.pose = 'surprise'; })
    ]);
    hop.style.transform = '';
    const a = arena(positions);
    await leap(a.point(robotPoint.x), 20, 520, signal);
    robot.dataset.pose = 'laugh';
    speak('Juda kuchli ekan!', 1500);
    await sleep(1200, signal);
  }

  // ---- More experiments ----------------------------------------------------
  async function rocketLaunch(positions, signal) {
    const a = arena(positions), s = a.scale, size = { w: 34 * s + 8, h: 70 * s + 14 };
    const spot = a.point(a.x0 + 40);
    await walkTo(spot, signal);
    faceRobot(1);
    const x = spot.x + positions.robotSize.width * 0.95, y = a.floor - size.h;
    show(rocket, x, y, size.w, size.h);
    speak('Raketa tayyor!', 1400);
    robot.dataset.pose = 'reach';
    await sleep(900, signal);
    robot.dataset.pose = 'curious';
    for (const n of ['3', '2', '1']) { speak(n, 700); await sleep(750, signal); }
    stage.dataset.rocket = 'fire';
    robot.dataset.pose = 'surprise';
    speak('Uchdi!', 1600);
    const smoke = setInterval(() => burst(x + size.w / 2, a.floor - 6, 'smoke', 3, 40), 160);
    try {
      await animate(rocket, [
        { transform: at({ x, y }) }, { transform: `${at({ x: x + 4, y: y + 3 })}`, offset: 0.12 },
        { transform: `${at({ x: x + 30, y: y - innerHeight * 0.4 })} rotate(8deg)`, offset: 0.6 }, { transform: `${at({ x: x + 80, y: -size.h - 40 })} rotate(14deg)` }
      ], { duration: 2200, easing: 'cubic-bezier(.5,0,.75,.6)' }, signal);
    } finally { clearInterval(smoke); }
    stage.dataset.rocket = '';
    rocket.hidden = true;
    burst(x + 80, 60, 'star', 10, 90);
    robot.dataset.pose = 'cheer';
    await sleep(1400, signal);
  }

  async function volcano(positions, signal) {
    const a = arena(positions), s = a.scale, w = 74 * s + 14, h = 46 * s + 8;
    const spot = a.point(a.x0 + 20);
    await walkTo(spot, signal);
    faceRobot(1);
    const x = spot.x + positions.robotSize.width * 0.85, y = a.floor - h;
    show(volcanoEl, x, y, w, h);
    speak('Vulqon tajribasi!', 1500);
    robot.dataset.pose = 'mix';
    await sleep(1600, signal);
    robot.dataset.pose = 'curious';
    stage.dataset.volcano = 'rumble';
    await sleep(1100, signal);
    stage.dataset.volcano = 'erupt';
    robot.dataset.pose = 'surprise';
    for (let i = 0; i < 6; i += 1) { burst(x + w / 2, y + 4, 'lava', 5, 70); await sleep(220, signal); }
    stage.dataset.volcano = '';
    robot.dataset.pose = 'laugh';
    speak('Qaynab ketdi!', 1500);
    await sleep(1300, signal);
    await animate(volcanoEl, [{ opacity: '1' }, { opacity: '0' }], { duration: 400 }, signal);
    volcanoEl.hidden = true;
  }

  async function paperPlane(positions, signal) {
    const a = arena(positions), s = a.scale;
    await walkTo(a.point(a.x0), signal);
    faceRobot(1);
    robot.dataset.pose = 'reach';
    speak('Qog‘oz samolyot!', 1400);
    await sleep(700, signal);
    const start = { x: robotPoint.x + 120 * s, y: robotPoint.y + 70 * s };
    show(plane, start.x, start.y, 38 * s + 10, 22 * s + 6);
    robot.dataset.pose = 'kick-follow';
    const w = innerWidth, h = innerHeight;
    await animate(plane, [
      { transform: `${at(start)} rotate(-10deg)` },
      { transform: `${at({ x: w * 0.7, y: h * 0.25 })} rotate(-25deg)`, offset: 0.3 },
      { transform: `${at({ x: w * 0.85, y: h * 0.12 })} rotate(-200deg)`, offset: 0.45 },
      { transform: `${at({ x: w * 0.55, y: h * 0.3 })} rotate(-340deg)`, offset: 0.62 },
      { transform: `${at({ x: w * 0.3, y: h * 0.5 })} rotate(-370deg)`, offset: 0.8 },
      { transform: `${at({ x: robotPoint.x + 40 * s, y: robotPoint.y + 30 * s })} rotate(-380deg)` }
    ], { duration: 5200, easing: 'ease-in-out' }, signal);
    plane.hidden = true;
    robot.dataset.pose = 'cheer';
    speak('Qaytib keldi!', 1300);
    await sleep(1200, signal);
  }

  async function bubbles(positions, signal) {
    const a = arena(positions);
    await walkTo(a.point(a.x0 + 60), signal);
    faceRobot(1);
    robot.dataset.pose = 'reach';
    speak('Pufakchalar!', 1300);
    for (let i = 0; i < 8; i += 1) {
      const head = robotHead();
      burst(head.x + 50 * a.scale, head.y + 30 * a.scale, 'bubble', 3, 60);
      await sleep(420, signal);
    }
    robot.dataset.pose = 'cheer';
    await sleep(1000, signal);
  }

  async function plantGrow(positions, signal) {
    const a = arena(positions), s = a.scale, w = 44 * s + 10, h = 70 * s + 16;
    await walkTo(a.point(a.x0 + 30), signal);
    faceRobot(1);
    const x = robotPoint.x + positions.robotSize.width * 0.85, y = a.floor - h;
    show(plant, x, y, w, h);
    stage.dataset.plant = 'seed';
    speak('Gul ekamiz', 1300);
    robot.dataset.pose = 'mix';
    for (let i = 0; i < 6; i += 1) { burst(x + w / 2, y + h * 0.35, 'drop', 2, 30); await sleep(300, signal); }
    stage.dataset.plant = 'grow';
    robot.dataset.pose = 'curious';
    await sleep(1800, signal);
    stage.dataset.plant = 'bloom';
    burst(x + w / 2, y, 'spark', 8, 50);
    robot.dataset.pose = 'cheer';
    setFace('love', 1500);
    speak('Gulladi!', 1400);
    await sleep(1600, signal);
    await animate(plant, [{ opacity: '1' }, { opacity: '0' }], { duration: 450 }, signal);
    plant.hidden = true;
    stage.dataset.plant = '';
  }

  // ---- Page transitions: the robot travels into the new page ---------------
  async function portalOut(signal) {
    const s = scaleNow();
    show(portal, robotPoint.x + 80 * s - 50, robotPoint.y + 200 * s - 22, 100, 44);
    await animate(flip, [{ transform: 'scale(1) rotate(0deg)', opacity: 1 }, { transform: 'scale(.1) rotate(540deg)', opacity: 0 }], { duration: 520, easing: 'ease-in' }, signal);
    portal.hidden = true;
  }
  async function portalIn(point, signal) {
    const s = scaleNow();
    robotPoint = point;
    place(robotPosition, point);
    show(portal, point.x + 80 * s - 50, point.y + 200 * s - 22, 100, 44);
    await animate(flip, [{ transform: 'scale(.1) rotate(-540deg)', opacity: 0 }, { transform: 'scale(1) rotate(0deg)', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.34,1.56,.64,1)' }, signal);
    flip.style.transform = '';
    flip.style.opacity = '';
    portal.hidden = true;
  }

  async function menuHop(positions, signal) {
    const s = positions.scale, width = positions.robotSize.width, feet = 200 * s;
    const buttons = [...document.querySelectorAll('#sidebar nav button:not(.hidden)')].filter(b => { const r = b.getBoundingClientRect(); return r.height > 10 && r.top > 70 && r.bottom < innerHeight - 20; });
    const target = document.querySelector('#sidebar nav button.active');
    if (!buttons.length || !target) return portalHop(positions, signal);
    const onButton = b => { const r = b.getBoundingClientRect(); return fitScenePoint({ x: r.right - width - 6, y: r.top - feet + 6 }, positions.viewport, positions.robotSize); };
    const ty = target.getBoundingClientRect().top;
    const path = buttons.filter(b => { const t = b.getBoundingClientRect().top; return (t - robotPoint.y - feet) * (t - ty) <= 0 || b === target; })
      .sort((p, q) => Math.abs(p.getBoundingClientRect().top - robotPoint.y - feet) - Math.abs(q.getBoundingClientRect().top - robotPoint.y - feet));
    const steps = path.filter((b, i) => i % Math.max(1, Math.ceil(path.length / 3)) === 0).slice(0, 3);
    if (!steps.includes(target)) steps.push(target);
    for (const b of steps) await leap(onButton(b), 46, 460, signal);
    speak(PAGE_LINES[root.dataset.page] || 'Keldik!', 1800);
    const a = arena(positions);
    await leap(a.point(a.left + 20), 120, 900, signal, 360);
  }

  async function hangDrop(positions, signal) {
    const s = positions.scale, a = arena(positions);
    const header = document.querySelector('#shell>header')?.getBoundingClientRect();
    const top = (header?.bottom || 64) - 20 * s;
    const x = Math.max(a.left, Math.min(a.right - positions.robotSize.width, a.left + (a.right - a.left) * (0.25 + Math.random() * 0.5)));
    await portalOut(signal);
    robot.dataset.pose = 'hang';
    stage.dataset.hang = 'true';
    robotPoint = { x, y: top };
    place(robotPosition, robotPoint);
    flip.style.opacity = '';
    await animate(flip, [{ transform: 'translateY(-60px)' }, { transform: 'translateY(0)' }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' }, signal);
    speak(PAGE_LINES[root.dataset.page] || 'Salom!', 1800);
    await animate(flip, [
      { transform: 'rotate(0deg)' }, { transform: 'rotate(14deg)', offset: 0.25 }, { transform: 'rotate(-12deg)', offset: 0.5 },
      { transform: 'rotate(8deg)', offset: 0.75 }, { transform: 'rotate(0deg)' }
    ], { duration: 1500, easing: 'ease-in-out' }, signal);
    flip.style.transform = '';
    stage.dataset.hang = '';
    robot.dataset.pose = 'tuck';
    const floor = a.point(x);
    await animate(robotPosition, [{ transform: at(robotPoint) }, { transform: at(floor) }], { duration: Math.max(380, (floor.y - robotPoint.y) * 1.3), easing: 'cubic-bezier(.55,0,1,.45)' }, signal);
    robotPoint = floor;
    robot.dataset.pose = 'squat';
    burst(robotHead().x, robotPoint.y + 205 * s, 'dust', 8, 44);
    await sleep(260, signal);
    robot.dataset.pose = 'cheer';
    await sleep(700, signal);
  }

  async function skateRide(positions, signal) {
    const s = positions.scale, a = arena(positions), width = positions.robotSize.width;
    if (Math.abs(robotPoint.y - a.y) > 40) await leap(a.point(robotPoint.x), 30, 520, signal);
    const deckW = 96 * s + 10, deckH = 22 * s + 6;
    const deckAt = p => ({ x: p.x + width / 2 - deckW / 2, y: p.y + 200 * s - 2 });
    show(skate, deckAt(robotPoint).x, deckAt(robotPoint).y + 40, deckW, deckH);
    await animate(skate, [{ transform: at({ ...deckAt(robotPoint), y: deckAt(robotPoint).y + 40 }), opacity: '0' }, { transform: at(deckAt(robotPoint)), opacity: '1' }], { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)' }, signal);
    robot.dataset.pose = 'tuck';
    await jumpTo({ x: robotPoint.x, y: robotPoint.y - 12 * s }, 20, 300, signal);
    robot.dataset.pose = 'skate';
    stage.dataset.activity = 'skate';
    const goal = a.point(Math.min(a.right - width, a.left + (a.right - a.left) * (0.55 + Math.random() * 0.25)));
    const ride = { x: goal.x, y: robotPoint.y };
    faceRobot(ride.x < robotPoint.x ? -1 : 1);
    speak(PAGE_LINES[root.dataset.page] || 'Vuuush!', 1800);
    const duration = Math.max(900, Math.abs(ride.x - robotPoint.x) * 3.2);
    const trail = setInterval(() => burst(robotHead().x - 40 * s * (Number(robot.style.getPropertyValue('--pg-facing')) || 1), robotPoint.y + 205 * s, 'dust', 1, 20), 120);
    try {
      await Promise.all([
        animate(robotPosition, [{ transform: at(robotPoint) }, { transform: at(ride) }], { duration, easing: 'cubic-bezier(.3,.1,.2,1)' }, signal),
        animate(skate, [{ transform: at(deckAt(robotPoint)) }, { transform: at(deckAt(ride)) }], { duration, easing: 'cubic-bezier(.3,.1,.2,1)' }, signal)
      ]);
    } finally { clearInterval(trail); }
    robotPoint = ride;
    stage.dataset.activity = '';
    robot.dataset.pose = 'tuck';
    // kickflip: the board spins away and vanishes
    await Promise.all([
      jumpTo(goal, 50, 520, signal),
      animate(skate, [{ transform: `${at(deckAt(ride))} rotate(0deg)`, opacity: '1' }, { transform: `${at({ x: deckAt(ride).x + 60, y: deckAt(ride).y - 50 })} rotate(540deg) scale(.6)`, opacity: '0' }], { duration: 600, easing: 'ease-out' }, signal)
    ]);
    skate.hidden = true;
    robot.dataset.pose = 'squat';
    await sleep(200, signal);
    robot.dataset.pose = 'cheer';
    await sleep(600, signal);
  }

  async function slideDown(positions, signal) {
    const s = positions.scale, a = arena(positions), width = positions.robotSize.width, hip = 142 * s;
    const right = a.right - 20, left = Math.max(a.left + 40, right - Math.min(420, (a.right - a.left) * 0.6));
    const header = document.querySelector('#shell>header')?.getBoundingClientRect();
    const topY = (header?.bottom || 64) + 60, bottomY = a.floor - 10;
    const len = Math.hypot(right - left, bottomY - topY), angle = Math.atan2(bottomY - topY, left - right) * 180 / Math.PI;
    slideEl.style.width = `${len}px`;
    slideEl.style.transformOrigin = '0 50%';
    slideEl.style.transform = `translate3d(${right}px,${topY}px,0) rotate(${angle}deg)`;
    slideEl.hidden = false;
    await animate(slideEl, [{ opacity: '0', clipPath: 'inset(0 100% 0 0)' }, { opacity: '1', clipPath: 'inset(0 0 0 0)' }], { duration: 500, easing: 'ease-out' }, signal);
    await portalOut(signal);
    const startPt = { x: right - width / 2 - 10, y: topY - hip - 4 };
    const endPt = { x: left - width / 2 + 10, y: bottomY - hip - 4 };
    flip.style.opacity = '';
    await portalIn(startPt, signal);
    faceRobot(-1);
    robot.dataset.pose = 'sit';
    speak('Uraaa!', 1400);
    await animate(robotPosition, [{ transform: at(startPt) }, { transform: at(endPt) }], { duration: 1300, easing: 'cubic-bezier(.5,0,.9,.6)' }, signal);
    robotPoint = endPt;
    burst(robotHead().x, bottomY, 'spark', 6, 40);
    await leap(a.point(Math.max(a.left, endPt.x - 90)), 50, 560, signal);
    speak(PAGE_LINES[root.dataset.page] || 'Keldik!', 1800);
    await animate(slideEl, [{ opacity: '1' }, { opacity: '0' }], { duration: 400 }, signal);
    slideEl.hidden = true;
  }

  async function portalHop(positions, signal) {
    const a = arena(positions);
    await portalOut(signal);
    await portalIn(a.point(a.left + (a.right - a.left) * (0.2 + Math.random() * 0.5) ), signal);
    robot.dataset.pose = 'wave';
    speak(PAGE_LINES[root.dataset.page] || 'Salom!', 1800);
    await sleep(900, signal);
  }

  function chooseTransition() {
    const side = document.getElementById('sidebar')?.getBoundingClientRect();
    if (innerWidth > 900 && side && side.width && robotPoint.x < side.right - 20 && Math.random() < 0.75) return menuHop;
    const high = robotPoint.y < innerHeight * 0.35;
    const options = high ? [hangDrop, hangDrop, slideDown, portalHop] : [skateRide, skateRide, slideDown, hangDrop, portalHop];
    return pick(options);
  }

  const ACTIVITIES = {
    drone: droneShow, lab: labExperiment, ball: ballGame, blocks: blockTower, trampoline, dance: danceParty, nap,
    perch: perchOnCard, push: pushCard, tug: tugCard, rocket: rocketLaunch, volcano, plane: paperPlane, bubbles, plant: plantGrow
  };

  function playlist(first) {
    const names = ['ball', 'dance', 'blocks', 'trampoline', 'lab', 'perch', 'push', 'tug', 'perch', 'rocket', 'volcano', 'plane', 'bubbles', 'plant'];
    if (root.dataset.theme === 'dark') names.push('nap');
    for (let i = names.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    names.splice(first ? 0 : 2, 0, 'drone');
    return names;
  }

  async function run(positions, signal, intro) {
    const limited = connections?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2);
    try {
      if (intro) {
        await intro(positions, signal);
      } else {
        robotPoint = fitScenePoint({ x: positions.home.x + 160, y: positions.home.y - 12 }, positions.viewport, positions.robotSize);
        place(robotPosition, robotPoint);
        await walk(positions.home, 2400, signal);
        faceRobot(-1);
        robot.dataset.pose = 'wave';
        speak('Salom! Men HALLAYM robotiman', 2600);
        await sleep(1800, signal);
      }
      let first = !intro;
      do {
        const list = playlist(first).slice(0, limited ? 2 : undefined);
        for (const name of list) {
          await ACTIVITIES[name](positions, signal);
          await walkTo(positions.home, signal);
          faceRobot(-1);
          robot.dataset.pose = Math.random() < 0.5 ? 'wave' : 'idle';
          await sleep(1600, signal);
          robot.dataset.pose = 'idle';
          await sleep(limited ? 0 : 4200, signal);
        }
        first = false;
      } while (!signal.aborted && !limited);
    } catch (error) {
      if (!signal.aborted) {
        console.warn('Campus animation stopped', error);
        stop();
        park(layout());
      }
    }
  }

  // ---- Interaction: poke the robot, greet on page change -------------------
  const POKE_LINES = ['Salom!', 'Qitiqlamang!', 'Bugun nima o‘qiymiz?', 'Bilim — kuch!', 'Darsga tayyormisiz?', 'Yana bir marta!', 'Men HALLAYM robotiman!'];
  const PAGE_LINES = {
    dashboard: 'Xush kelibsiz!', schedule: 'Jadvalni ko‘ramiz!', live: 'Jonli dars — oldinga!',
    courses: 'Vazifalar kutyapti!', library: 'Kitob — eng yaxshi do‘st!', grades: 'A’lo baholar sari!',
    analytics: 'Raqamlar gapiryapti!', lab: 'Tajriba vaqti!', videos: 'Videodarsni boshlaymiz!',
    history: 'O‘tgan darslarni eslaymiz', dailyAttendance: 'Hamma joyidami?', finalExams: 'Omad yor bo‘lsin!'
  };

  function hopOnce(height = 34) {
    hop.animate([
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(4px) scale(1.08,.9)', offset: 0.15 },
      { transform: `translateY(${-height}px) scale(.95,1.06)`, offset: 0.5 },
      { transform: 'translateY(0) scale(1,1)' }
    ], { duration: 620, easing: 'ease-out' });
  }

  hit.addEventListener('click', () => {
    if (stage.hidden || stage.dataset.paused === 'true') return;
    const now = performance.now();
    pokes = pokes.filter(time => now - time < 2500);
    pokes.push(now);
    const head = robotHead();
    if (pokes.length >= 5) {
      pokes = [];
      stage.dataset.dizzy = 'true';
      speak('Boshim aylandi...', 2200);
      burst(head.x, head.y, 'star', 8, 50);
      clearTimeout(dizzyTimer);
      dizzyTimer = setTimeout(() => { stage.dataset.dizzy = ''; }, 2400);
      return;
    }
    hopOnce();
    burst(head.x, head.y, 'heart', 7, 60);
    speak(pick(POKE_LINES), 1800);
  });

  // Other modules (achievements, tour) can make the robot speak and celebrate.
  window.addEventListener('hallaym:robot', event => {
    if (stage.hidden || stage.dataset.paused === 'true') return;
    const { text, kind } = event.detail || {};
    if (text) speak(String(text).slice(0, 90), 3400);
    hopOnce(40);
    const head = robotHead();
    burst(head.x, head.y, kind === 'heart' ? 'heart' : 'star', 12, 90);
  });

  let transitionTimer = null;
  new MutationObserver(() => {
    const page = root.dataset.page;
    if (stage.hidden || stage.dataset.paused === 'true' || page === 'lesson') return;
    if (document.getElementById('shell')?.classList.contains('hidden')) return;
    // travel into the new page, then carry on playing there
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => refresh(chooseTransition()), 120);
  }).observe(root, { attributes: true, attributeFilter: ['data-page'] });

  function refresh(intro) {
    const keepPlace = typeof intro === 'function';
    stop();
    const positions = layout();
    if (keepPlace) place(robotPosition, robotPoint);
    else park(positions);
    const accessible = root.classList.contains('a11y-contrast') || root.classList.contains('a11y-simple-layout');
    const reduced = reducedMotion.matches || root.classList.contains('a11y-reduce-motion');
    const isPaused = paused || reduced;
    stage.hidden = accessible || document.hidden || Boolean(document.fullscreenElement);
    stage.dataset.paused = String(isPaused);
    toggle.hidden = accessible || reduced;
    toggle.setAttribute('aria-pressed', String(paused));
    const label = paused ? 'Robot animatsiyasini yoqish' : 'Robot animatsiyasini to‘xtatish';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    if (stage.hidden || isPaused || !Element.prototype.animate) return;
    lifetime = new AbortController();
    void run(positions, lifetime.signal, keepPlace ? intro : null);
  }

  toggle.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('campus-motion-paused', paused ? '1' : '0'); } catch {}
    refresh();
  });
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('fullscreenchange', refresh);
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 160);
  });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', refresh);
  else reducedMotion.addListener(refresh);
  // Only accessibility switches change what the robot may do; other <html>
  // classes (scroll state, theme transitions) must not restart the show.
  const appearanceKey = () => ['a11y-contrast', 'a11y-simple-layout', 'a11y-reduce-motion'].map(name => root.classList.contains(name) ? 1 : 0).join('');
  let lastAppearance = appearanceKey();
  const appearance = new MutationObserver(() => {
    const key = appearanceKey();
    if (key === lastAppearance) return;
    lastAppearance = key;
    refresh();
  });
  appearance.observe(root, { attributes: true, attributeFilter: ['class'] });
  const auth = new MutationObserver(refresh);
  const shell = document.getElementById('shell');
  if (shell) auth.observe(shell, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', refresh);
  refresh();
}

if (typeof document !== 'undefined') createPlayground();
