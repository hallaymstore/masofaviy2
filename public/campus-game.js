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
    <div class="pg-robot-position"><div class="pg-robot-scale"><div class="pg-robot" data-pose="idle">
      ${limb('left', 'leg')}${limb('right', 'leg')}
      ${limb('left', 'arm')}
      <i class="pg-part pg-hips"></i><i class="pg-part pg-torso"></i>
      <span class="pg-head-joint"><i class="pg-part pg-head"></i><i class="pg-eye-blink"></i></span>
      ${limb('right', 'arm')}
      <i class="pg-held-remote"></i><i class="pg-robot-splat"></i>
    </div></div></div>
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
    </div>`;
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

  async function sequence(positions, signal) {
    const { bench: table, viewport, robotSize, dronePad } = positions;
    const point = (x, y) => fitScenePoint({ x, y }, viewport, robotSize);
    robotPoint = point(positions.home.x + 160, positions.home.y - 12);
    place(robotPosition, robotPoint);
    await walk(positions.home, 2400, signal);
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
    await walk(positions.home, 4600, signal);
    lab.hidden = true;
    stage.dataset.experiment = '';
    robot.dataset.pose = 'wave';
    await sleep(2400, signal);
    robot.dataset.pose = 'idle';
    await sleep(10000, signal);
  }

  async function run(positions, signal) {
    const limited = connections?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2);
    try {
      do { await sequence(positions, signal); } while (!signal.aborted && !limited);
    } catch (error) {
      if (!signal.aborted) {
        console.warn('Campus animation stopped', error);
        stop();
        park(layout());
      }
    }
  }

  function refresh() {
    stop();
    const positions = layout();
    park(positions);
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
    void run(positions, lifetime.signal);
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
  const appearance = new MutationObserver(refresh);
  appearance.observe(root, { attributes: true, attributeFilter: ['class'] });
  const auth = new MutationObserver(refresh);
  const shell = document.getElementById('shell');
  if (shell) auth.observe(shell, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', refresh);
  refresh();
}

if (typeof document !== 'undefined') createPlayground();
