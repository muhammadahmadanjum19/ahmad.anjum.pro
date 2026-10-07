/* ==========================================================================
   anjum.pro — BLACKOT
   Engine: lensed black hole (WebGL), boot sequence, width-warping name,
   scroll-lit statement, velocity ticker, ledger spotlight, theme reveal.
   Everything degrades: no WebGL -> CSS ring, reduced motion -> static,
   no JS -> plain, fully readable HTML.
   ========================================================================== */
(() => {
    'use strict';

    const doc = document;
    const root = doc.documentElement;
    const $ = (s, c = doc) => c.querySelector(s);
    const $$ = (s, c = doc) => Array.from(c.querySelectorAll(s));
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const outCubic = (t) => 1 - Math.pow(1 - t, 3);

    const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = reduceMQ.matches;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

    const safe = (kind) => ({
        get(k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
        set(k, v) { try { window[kind].setItem(k, v); } catch (e) { /* storage unavailable */ } },
    });
    const local = safe('localStorage');
    const session = safe('sessionStorage');

    /* ---------- Shared pointer + scroll state ---------- */
    const pointer = { x: innerWidth * 0.5, y: innerHeight * 0.5, nx: 0, ny: 0, active: false, last: 0 };
    const scroll = { y: window.scrollY, v: 0 };

    window.addEventListener('pointermove', (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.nx = (e.clientX / innerWidth) * 2 - 1;
        pointer.ny = -((e.clientY / innerHeight) * 2 - 1);
        pointer.active = true;
        pointer.last = performance.now();
    }, { passive: true });
    window.addEventListener('pointerleave', () => { pointer.active = false; });
    doc.addEventListener('mouseleave', () => { pointer.active = false; });
    window.addEventListener('scroll', () => { scroll.y = window.scrollY; }, { passive: true });

    /* ======================================================================
       VOID — lensed black hole with accretion disc (WebGL fragment shader)
       ====================================================================== */
    const Void = (() => {
        const canvas = $('#void');
        const fallback = $('#voidFallback');
        let gl = null, program = null, raf = 0, ok = false;
        let scale = 1;
        let W = 1, H = 1;
        const dprCap = 1.5;
        const L = { cx: 0, cy: 0, r: 80, wide: true };
        const S = { ignite: reduce ? 1 : 0, igniteFrom: 0, igniteDur: 0, light: 0, lightTarget: 0, tx: 0, ty: 0 };
        const U = {};
        let t0 = performance.now();
        let frames = 0, accDt = 0, lastNow = 0;

        const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
        const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_center;
uniform float u_radius;
uniform vec2  u_tilt;
uniform float u_ignite;
uniform float u_light;
uniform float u_fade;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}
vec3 ramp(float t){
    vec3 c0 = vec3(0.10, 0.06, 0.45);
    vec3 c1 = vec3(0.47, 0.24, 1.00);
    vec3 c2 = vec3(0.84, 0.70, 1.00);
    vec3 c3 = vec3(1.00, 0.97, 0.94);
    vec3 c = mix(c0, c1, smoothstep(0.0, 0.4, t));
    c = mix(c, c2, smoothstep(0.35, 0.75, t));
    return mix(c, c3, smoothstep(0.72, 1.0, t));
}
/* Differentially rotating turbulence. Two phases cross-fade so it never winds up. */
float swirl(vec2 d, float rho, float t){
    float T = 16.0;
    float w = 1.1 / pow(rho, 1.5);
    float ph1 = mod(t, T), ph2 = mod(t + T * 0.5, T);
    float a1 = ph1 * w, a2 = ph2 * w;
    vec2 p1 = vec2(cos(a1) * d.x - sin(a1) * d.y, sin(a1) * d.x + cos(a1) * d.y);
    vec2 p2 = vec2(cos(a2) * d.x - sin(a2) * d.y, sin(a2) * d.x + cos(a2) * d.y);
    float s = sin(3.14159265 * ph1 / T); s *= s;
    return mix(fbm(p2 * 2.4 + 7.3), fbm(p1 * 2.4), s);
}

void main(){
    vec2 frag = gl_FragCoord.xy;
    vec2 pc = (frag - u_center) / u_radius;
    float r = length(pc);

    float rot = -0.30 + 0.16 * u_tilt.x;
    float cr = cos(rot), sr = sin(rot);
    vec2 q = vec2(cr * pc.x - sr * pc.y, sr * pc.x + cr * pc.y);
    float inc = clamp(0.19 + 0.09 * u_tilt.y, 0.08, 0.4);

    float ig = smoothstep(0.0, 1.0, u_ignite);
    float grow = mix(0.25, 1.0, ig);
    vec3 E = vec3(0.0);

    /* Stars, bent outward around the hole */
    vec2 sp = frag + pc * u_radius * (1.1 / (r * r + 0.55));
    vec2 g = sp / 28.0; vec2 id = floor(g); vec2 f = fract(g);
    vec2 sc = vec2(hash(id + 3.1), hash(id + 7.7)) * 0.7 + 0.15;
    float h = hash(id);
    float st = smoothstep(0.075, 0.0, length(f - sc)) * step(0.80, h);
    st *= 0.55 + 0.45 * sin(u_time * (0.8 + h * 2.0) + h * 40.0);
    E += mix(vec3(0.65, 0.72, 1.0), vec3(1.0, 0.86, 0.95), hash(id + 9.0)) * st * smoothstep(1.05, 1.5, r) * 0.85 * ig;

    /* Primary accretion disc (flat ellipse; its near side crosses in front of the hole) */
    vec2 d = vec2(q.x, q.y / inc);
    float rho = length(d);
    float rin = 1.45;
    float rout = 5.0 * grow;
    float band = smoothstep(rin, rin + 0.25, rho) * (1.0 - smoothstep(rout * 0.55, rout, rho));
    if (band > 0.001) {
        float prof = pow(rin / rho, 2.0);
        float tex = swirl(d, rho, u_time + 3.0);
        float dop = clamp(1.0 + 0.8 * (-q.x / max(rho, 0.5)), 0.35, 1.9);
        float I = prof * (0.55 + 1.1 * tex) * dop * band;
        float T = clamp(1.15 * pow(rin / rho, 1.1) + 0.12 * (dop - 1.0), 0.0, 1.0);
        float vis = (q.y < 0.0) ? 1.0 : smoothstep(0.98, 1.04, r);
        E += ramp(T) * I * 2.6 * vis * ig;
    }

    /* Lensed far side of the disc, arching over and under the hole */
    float arc = exp(-pow((r - 1.0) / 0.55, 2.0)) * smoothstep(1.0, 1.06, r);
    float vert = pow(abs(q.y) / max(r, 0.001), 1.4);
    float beam = clamp(1.0 + 0.5 * (-q.x / max(r, 0.3)), 0.4, 1.6);
    float tex2 = 0.8 + 0.4 * noise(vec2(atan(q.y, q.x) * 2.0, r * 6.0 - u_time * 0.2));
    E += ramp(clamp(0.95 - (r - 1.0) * 0.9, 0.0, 1.0)) * arc * (0.25 + 1.5 * vert) * beam * tex2 * 1.9 * ig;

    /* Photon ring + soft halo */
    float ring = exp(-pow((r - 1.035) / 0.028, 2.0)) * smoothstep(0.98, 1.0, r);
    E += vec3(1.0, 0.96, 1.0) * ring * 1.6 * (0.85 + 0.15 * sin(u_time * 0.7)) * ig;
    float halo = exp(-max(r - 1.0, 0.0) * 0.9) * 0.10 * smoothstep(0.98, 1.02, r);
    float plane = exp(-abs(q.y) * 1.6) * exp(-abs(q.x) * 0.22) * 0.07;
    E += vec3(0.45, 0.25, 1.0) * (halo + plane) * ig;

    vec3 c = (1.0 - exp(-E * 1.25)) * u_fade;

    vec3 darkCol = vec3(0.0118, 0.0118, 0.0275) + c;

    float lum = max(max(c.r, c.g), c.b);
    float lt = clamp(lum * 1.2, 0.0, 1.0);
    vec3 bgL = vec3(0.949, 0.945, 0.973);
    vec3 base = mix(vec3(0.02, 0.012, 0.05), bgL, smoothstep(0.985, 1.0, r));
    vec3 inkc = mix(vec3(0.70, 0.58, 1.0), vec3(0.30, 0.14, 0.80), smoothstep(0.15, 0.55, lt));
    inkc = mix(inkc, vec3(0.05, 0.02, 0.14), smoothstep(0.55, 1.0, lt));
    vec3 lightCol = mix(base, inkc, smoothstep(0.06, 0.7, lt));

    vec3 col = mix(darkCol, lightCol, u_light);
    col += (hash(frag + u_time) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
}`;

        function compile(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.warn('[void] shader error:', gl.getShaderInfoLog(s));
                return null;
            }
            return s;
        }

        function init() {
            try {
                gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false })
                    || canvas.getContext('experimental-webgl');
                if (!gl) return false;
                const vs = compile(gl.VERTEX_SHADER, VERT);
                const fs = compile(gl.FRAGMENT_SHADER, FRAG);
                if (!vs || !fs) return false;
                program = gl.createProgram();
                gl.attachShader(program, vs);
                gl.attachShader(program, fs);
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
                gl.useProgram(program);
                const buf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
                const loc = gl.getAttribLocation(program, 'p');
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
                ['u_res', 'u_time', 'u_center', 'u_radius', 'u_tilt', 'u_ignite', 'u_light', 'u_fade']
                    .forEach((n) => { U[n] = gl.getUniformLocation(program, n); });
                canvas.addEventListener('webglcontextlost', (e) => {
                    e.preventDefault();
                    ok = false;
                    cancelAnimationFrame(raf);
                    root.classList.add('no-webgl');
                });
                ok = true;
                return true;
            } catch (err) {
                console.warn('[void] WebGL unavailable:', err);
                return false;
            }
        }

        function layout() {
            const w = innerWidth, h = innerHeight;
            L.wide = w >= 900;
            L.cx = L.wide ? w * 0.745 : w * 0.5;
            L.cy = L.wide ? h * 0.47 : h * 0.26;
            L.r = L.wide ? Math.min(w * 0.07, h * 0.15) : Math.min(w * 0.11, h * 0.08);
            if (fallback) {
                fallback.style.setProperty('--fx', L.cx + 'px');
                fallback.style.setProperty('--fy', L.cy + 'px');
                fallback.style.setProperty('--fs', L.r * 9 + 'px');
            }
        }

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, dprCap) * scale;
            W = Math.max(1, Math.round(innerWidth * dpr));
            H = Math.max(1, Math.round(innerHeight * dpr));
            if (canvas.width !== W || canvas.height !== H) {
                canvas.width = W;
                canvas.height = H;
            }
            if (gl) gl.viewport(0, 0, W, H);
        }

        function draw(now) {
            const t = reduce ? 9 : (now - t0) / 1000;
            if (S.igniteDur > 0) {
                S.ignite = clamp((now - S.igniteFrom) / S.igniteDur, 0, 1);
            }
            S.light = reduce ? S.lightTarget : lerp(S.light, S.lightTarget, 0.1);
            S.tx = lerp(S.tx, pointer.active ? pointer.nx : 0, 0.05);
            S.ty = lerp(S.ty, pointer.active ? pointer.ny : 0, 0.05);

            const prog = scroll.y / innerHeight;
            const fade = 1 - 0.8 * smooth(0.15, 1.3, prog);
            const k = 1 - 0.22 * clamp(prog, 0, 1);
            const sx = W / innerWidth, sy = H / innerHeight;
            const cx = (L.cx + S.tx * 14) * sx;
            const cy = H - (L.cy - scroll.y * 0.45 - S.ty * 10) * sy;

            gl.uniform2f(U.u_res, W, H);
            gl.uniform1f(U.u_time, t);
            gl.uniform2f(U.u_center, cx, cy);
            gl.uniform1f(U.u_radius, L.r * k * sx);
            gl.uniform2f(U.u_tilt, S.tx, S.ty);
            gl.uniform1f(U.u_ignite, S.ignite);
            gl.uniform1f(U.u_light, S.light);
            gl.uniform1f(U.u_fade, fade);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        function loop(now) {
            raf = requestAnimationFrame(loop);
            if (!ok || doc.hidden) { lastNow = now; return; }
            const dt = now - lastNow;
            lastNow = now;
            frames++;
            // Past the hero the effect is a faint backdrop: render every other frame.
            if (scroll.y > innerHeight * 1.3 && (frames & 1)) return;
            draw(now);
            // Adaptive resolution: keep the animation smooth on weak GPUs.
            if (frames > 40) {
                accDt += dt;
                if (frames % 45 === 0) {
                    const avg = accDt / 45;
                    accDt = 0;
                    if (avg > 26 && scale > 0.55) { scale = Math.max(0.55, scale * 0.8); resize(); }
                }
            }
        }

        function start() {
            if (!ok) return;
            resize();
            if (reduce) { draw(performance.now()); return; }
            lastNow = performance.now();
            raf = requestAnimationFrame(loop);
        }

        function redrawStatic() { if (ok && reduce) { resize(); draw(performance.now()); } }

        return {
            init, start, layout, redrawStatic,
            resize() { layout(); resize(); redrawStatic(); },
            center() { return { x: L.cx, y: L.cy, r: L.r }; },
            ignite(ms) { S.igniteFrom = performance.now(); S.igniteDur = ms; },
            setLight(isLight, instant) {
                S.lightTarget = isLight ? 1 : 0;
                if (instant) S.light = S.lightTarget;
                redrawStatic();
            },
            get ok() { return ok; },
        };
    })();

    /* ======================================================================
       NAME — letters bend toward the pointer, like light near a mass
       ====================================================================== */
    const Name = (() => {
        const h1 = $('#name');
        const lines = $$('.line', h1);
        const letters = [];
        const cur = [];
        const BASE = 100, MAX = 140, FIT = 120;
        const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=<>';
        let running = false, raf = 0, inView = true;

        function prepare() {
            h1.setAttribute('aria-label', lines.map((l) => l.textContent.trim()).join(' '));
            lines.forEach((line) => {
                const text = line.textContent.trim();
                line.textContent = '';
                line.setAttribute('aria-hidden', 'true');
                Array.from(text).forEach((ch) => {
                    const s = doc.createElement('span');
                    s.className = 'ch';
                    s.textContent = ch;
                    s.dataset.ch = ch;
                    line.appendChild(s);
                    letters.push(s);
                    cur.push(BASE);
                });
            });
        }

        function fit() {
            const wide = innerWidth >= 900;
            const hero = h1.closest('.hero');
            const pad = parseFloat(getComputedStyle(hero).paddingLeft) || 20;
            const avail = wide ? Math.min(innerWidth * 0.56, 940) : innerWidth - pad * 2;
            h1.style.setProperty('--name-fs', '100px');
            letters.forEach((l) => { l.style.fontStretch = FIT + '%'; });
            const need = Math.max(...lines.map((l) => l.getBoundingClientRect().width));
            letters.forEach((l, i) => { l.style.fontStretch = cur[i].toFixed(1) + '%'; });
            const byWidth = (100 * avail) / Math.max(need, 1);
            const byHeight = (innerHeight * 0.52) / (3 * 0.9);
            const fs = clamp(Math.min(byWidth, byHeight), 34, 190);
            h1.style.setProperty('--name-fs', fs.toFixed(1) + 'px');
        }

        function tick(now) {
            raf = requestAnimationFrame(tick);
            if (doc.hidden || !inView) return;
            const t = now / 1000;
            const idle = !pointer.active || now - pointer.last > 2200;
            const fs = parseFloat(getComputedStyle(h1).fontSize) || 120;
            const sig = Math.max(140, fs * 1.5);
            const rects = letters.map((l) => l.getBoundingClientRect());
            for (let i = 0; i < letters.length; i++) {
                const r = rects[i];
                let target;
                if (idle) {
                    target = BASE + 16 * (0.5 + 0.5 * Math.sin(t * 1.1 - i * 0.42));
                } else {
                    const dx = pointer.x - (r.left + r.width / 2);
                    const dy = pointer.y - (r.top + r.height / 2);
                    target = BASE + (MAX - BASE) * Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig));
                }
                cur[i] = lerp(cur[i], target, 0.13);
            }
            for (let i = 0; i < letters.length; i++) letters[i].style.fontStretch = cur[i].toFixed(1) + '%';
        }

        function startWarp() {
            if (reduce || running) return;
            running = true;
            new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { threshold: 0 }).observe(h1);
            raf = requestAnimationFrame(tick);
        }

        /* Decode: each letter resolves out of noise, left to right. */
        function decode() {
            return new Promise((resolve) => {
                if (reduce) { letters.forEach((l) => { l.style.opacity = ''; }); resolve(); return; }
                const t0 = performance.now();
                const meta = letters.map((l, i) => {
                    const w = l.getBoundingClientRect().width;
                    l.style.minWidth = w + 'px';
                    l.style.textAlign = 'center';
                    return { start: i * 48 + Math.random() * 90, dur: 520 + Math.random() * 380 };
                });
                (function step(now) {
                    const el = now - t0;
                    let done = 0;
                    letters.forEach((l, i) => {
                        const m = meta[i];
                        const p = (el - m.start) / m.dur;
                        if (p < 0) { l.style.opacity = '0'; return; }
                        l.style.opacity = '1';
                        if (p >= 1) { if (l.textContent !== l.dataset.ch) l.textContent = l.dataset.ch; done++; return; }
                        l.textContent = Math.random() < p * 0.85 ? l.dataset.ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
                    });
                    if (done < letters.length) requestAnimationFrame(step);
                    else {
                        letters.forEach((l) => { l.style.minWidth = ''; l.style.textAlign = ''; });
                        resolve();
                    }
                })(t0);
            });
        }

        function hide() { letters.forEach((l) => { l.style.opacity = '0'; }); }

        return { prepare, fit, decode, hide, startWarp };
    })();

    /* ======================================================================
       STATEMENT — words light up as you read down the page
       ====================================================================== */
    const Statement = (() => {
        const el = $('#statement');
        let words = [];
        function prepare() {
            const text = el.textContent.trim().split(/\s+/);
            el.textContent = '';
            words = text.map((w) => {
                const s = doc.createElement('span');
                s.className = 'w';
                s.textContent = w;
                el.appendChild(s);
                el.appendChild(doc.createTextNode(' '));
                return s;
            });
            update();
        }
        function update() {
            const r = el.getBoundingClientRect();
            const vh = innerHeight;
            const p = reduce ? 1 : clamp((vh * 0.88 - r.top) / (r.height + vh * 0.42), 0, 1);
            const lit = Math.round(p * words.length * 1.08);
            words.forEach((w, i) => w.classList.toggle('on', i < lit));
        }
        return { prepare, update };
    })();

    /* ======================================================================
       STRIP — ticker whose speed and direction follow your scrolling
       ====================================================================== */
    const Strip = (() => {
        const strip = $('#strip');
        const track = $('#stripTrack');
        const base = Array.from(track.children);
        let unit = 1, x = 0, dir = -1, last = 0, lastY = scroll.y, v = 0, inView = false, raf = 0;

        function build() {
            $$('[data-clone]', track).forEach((n) => n.remove());
            unit = track.scrollWidth;
            let guard = 0;
            while (track.scrollWidth < innerWidth * 2 + unit && guard++ < 8) {
                base.forEach((n) => {
                    const c = n.cloneNode(true);
                    c.setAttribute('data-clone', '');
                    track.appendChild(c);
                });
            }
            x = ((x % unit) + unit) % unit - unit;
            track.style.transform = `translate3d(${x}px,0,0)`;
        }

        function tick(now) {
            raf = requestAnimationFrame(tick);
            const dt = Math.min(64, now - last) / 1000;
            last = now;
            if (!inView || doc.hidden) return;
            const dy = scroll.y - lastY;
            lastY = scroll.y;
            v = lerp(v, dy / Math.max(dt, 0.001), 0.12);
            if (Math.abs(v) > 40) dir = v > 0 ? -1 : 1;
            const speed = 46 + Math.min(Math.abs(v) * 0.9, 1400);
            x += dir * speed * dt;
            if (x <= -unit * 2) x += unit;
            if (x >= -unit) x -= unit;
            track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        }

        function start() {
            if (reduce) return;
            new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(strip);
            last = performance.now();
            raf = requestAnimationFrame(tick);
        }
        return { build, start };
    })();

    /* ======================================================================
       UI — nav, theme, copy, ledger, magnets, cursor light, footer mark
       ====================================================================== */
    function initNav() {
        const nav = $('#nav');
        const links = $$('.nav__links a');
        const onScroll = () => nav.classList.toggle('is-stuck', scroll.y > 24);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        const targets = [$('#overview'), $('#channels')].filter(Boolean);
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (!e.isIntersecting) return;
                links.forEach((a) => a.classList.toggle('is-active', a.dataset.section === e.target.id));
            });
        }, { rootMargin: '-40% 0px -50% 0px' });
        targets.forEach((t) => io.observe(t));
    }

    function initTheme() {
        const btn = $('#themeBtn');
        const meta = $('meta[name="theme-color"]');
        const current = () => root.getAttribute('data-theme') || 'dark';

        function apply(theme, instant) {
            root.setAttribute('data-theme', theme);
            local.set('anjum_pro_theme', theme);
            btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
            if (meta) meta.setAttribute('content', theme === 'dark' ? '#030307' : '#f2f1f8');
            Void.setLight(theme === 'light', instant);
        }
        // Reflect the theme that was set before first paint.
        btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        if (meta) meta.setAttribute('content', current() === 'dark' ? '#030307' : '#f2f1f8');
        Void.setLight(current() === 'light', true);

        btn.addEventListener('click', () => {
            const next = current() === 'dark' ? 'light' : 'dark';
            if (doc.startViewTransition && !reduce) {
                const r = btn.getBoundingClientRect();
                const x = r.left + r.width / 2, y = r.top + r.height / 2;
                const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
                const vt = doc.startViewTransition(() => apply(next, true));
                vt.ready.then(() => {
                    root.animate(
                        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
                        { duration: 850, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
                    );
                }).catch(() => {});
            } else {
                apply(next, false);
            }
        });
    }

    function initCopy() {
        const btn = $('#copyEmail');
        const toast = $('#toast');
        const email = 'ahmad@anjum.pro';
        let timer = 0, back = 0;

        function say(msg) {
            toast.textContent = msg;
            toast.classList.add('show');
            clearTimeout(timer);
            timer = setTimeout(() => toast.classList.remove('show'), 2200);
        }
        async function copy() {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(email);
                } else {
                    const ta = doc.createElement('textarea');
                    ta.value = email;
                    ta.setAttribute('readonly', '');
                    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
                    doc.body.appendChild(ta);
                    ta.select();
                    const okCopy = doc.execCommand('copy');
                    ta.remove();
                    if (!okCopy) throw new Error('copy failed');
                }
                say('Email copied');
                const use = $('use', btn);
                use.setAttribute('href', '#i-check');
                clearTimeout(back);
                back = setTimeout(() => use.setAttribute('href', '#i-copy'), 1800);
            } catch (e) {
                say("Couldn't copy. The address is " + email);
            }
        }
        btn.addEventListener('click', copy);
    }

    function initLedger() {
        $$('.rows').forEach((rows) => {
            rows.addEventListener('pointermove', (e) => {
                const row = e.target.closest('.row');
                if (!row) return;
                const r = row.getBoundingClientRect();
                row.style.setProperty('--mx', e.clientX - r.left + 'px');
                row.style.setProperty('--my', e.clientY - r.top + 'px');
            }, { passive: true });
        });
        const items = $$('.rows li');
        if (reduce || !('IntersectionObserver' in window)) { items.forEach((li) => li.classList.add('in')); return; }
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (!e.isIntersecting) return;
                const idx = items.indexOf(e.target) - items.findIndex((li) => li.parentElement === e.target.parentElement);
                e.target.style.setProperty('transition-delay', idx * 90 + 'ms');
                e.target.classList.add('in');
                io.unobserve(e.target);
            });
        }, { threshold: 0.2 });
        items.forEach((li) => io.observe(li));
    }

    function initMagnets() {
        if (reduce || !finePointer) return;
        const mags = $$('[data-magnet]');
        let queued = false;
        window.addEventListener('pointermove', () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                mags.forEach((m) => {
                    const r = m.getBoundingClientRect();
                    const dx = pointer.x - (r.left + r.width / 2);
                    const dy = pointer.y - (r.top + r.height / 2);
                    const d = Math.hypot(dx, dy);
                    const reach = Math.max(r.width, r.height) * 0.9;
                    if (d < reach) {
                        m.style.setProperty('--bx', clamp(dx * 0.22, -10, 10).toFixed(1) + 'px');
                        m.style.setProperty('--by', clamp(dy * 0.28, -8, 8).toFixed(1) + 'px');
                    } else {
                        m.style.setProperty('--bx', '0px');
                        m.style.setProperty('--by', '0px');
                    }
                });
            });
        }, { passive: true });
    }

    function initGlow() {
        const glow = $('#glow');
        if (!glow || reduce || !finePointer) return;
        let gx = pointer.x, gy = pointer.y, raf = 0;
        function step() {
            gx = lerp(gx, pointer.x, 0.12);
            gy = lerp(gy, pointer.y, 0.12);
            glow.style.transform = `translate3d(${gx.toFixed(1)}px,${gy.toFixed(1)}px,0)`;
            if (Math.abs(gx - pointer.x) + Math.abs(gy - pointer.y) > 0.6) raf = requestAnimationFrame(step);
            else raf = 0;
        }
        window.addEventListener('pointermove', () => {
            glow.classList.add('on');
            if (!raf) raf = requestAnimationFrame(step);
        }, { passive: true });
    }

    function initFooterMark() {
        const wm = $('#footWm');
        if (!wm) return;
        if (reduce || !('IntersectionObserver' in window)) { wm.classList.add('in'); return; }
        const io = new IntersectionObserver((es) => {
            if (es[0].isIntersecting) { wm.classList.add('in'); io.disconnect(); }
        }, { threshold: 0.35 });
        io.observe(wm);
    }

    /* ======================================================================
       BOOT — count up, then the page opens out of the black hole
       ====================================================================== */
    async function boot() {
        const loader = $('#loader');
        const ring = $('#loaderRing');
        const num = $('#loaderNum');
        const letters = $$('.wm-l', loader);
        const seen = session.get('anjum_pro_seen') === '1';

        // Ask for the exact faces we measure with, so the name is fitted to the real font.
        const loadFonts = doc.fonts && doc.fonts.load
            ? Promise.all([
                doc.fonts.load('800 120px Anybody', 'Muhammad Ahmad Anjum'),
                doc.fonts.load('400 16px "Instrument Sans"', 'Overview'),
                doc.fonts.load('700 16px "Instrument Sans"', 'Overview'),
            ]).then(() => doc.fonts.ready).catch(() => {})
            : Promise.resolve();
        const fontsReady = Promise.race([loadFonts, sleep(2500)]);

        const finish = () => {
            loader.classList.add('is-done');
            ring.classList.add('is-done');
            root.classList.add('is-ready');
            session.set('anjum_pro_seen', '1');
        };

        if (reduce) {
            await fontsReady;
            Name.fit();
            Void.ignite(1);
            finish();
            return;
        }

        const c = Void.center();
        [loader, ring].forEach((el) => {
            el.style.setProperty('--hx', c.x + 'px');
            el.style.setProperty('--hy', c.y + 'px');
            el.style.setProperty('--hr', '0px');
        });
        ring.style.setProperty('--ro', '0');
        Name.hide();

        let skip = false;
        loader.addEventListener('pointerdown', () => { skip = true; });
        window.addEventListener('keydown', () => { skip = true; }, { once: true });

        // Count up. Hold at 99 until fonts are ready so the name fits correctly.
        const dur = seen ? 600 : 1700;
        const t0 = performance.now();
        let fontsDone = false;
        fontsReady.then(() => { fontsDone = true; });
        await new Promise((resolve) => {
            (function step(now) {
                let p = clamp((now - t0) / dur, 0, 1);
                if (skip) p = 1;
                const eased = outCubic(p);
                let n = Math.round(eased * 100);
                if (!fontsDone && n > 99) n = 99;
                num.textContent = String(n);
                letters.forEach((l, i) => l.classList.toggle('on', eased * 7.2 > i + 0.2));
                if (p < 1 || !fontsDone) requestAnimationFrame(step);
                else resolve();
            })(t0);
        });

        Name.fit();
        num.textContent = '100';
        letters.forEach((l) => l.classList.add('on'));
        await sleep(seen ? 80 : 220);

        // Open the hole. It starts exactly where the singularity will be.
        const far = Math.hypot(Math.max(c.x, innerWidth - c.x), Math.max(c.y, innerHeight - c.y)) + 80;
        const openMs = seen ? 700 : 1150;
        const o0 = performance.now();
        Void.ignite(seen ? 1100 : 2000);
        setTimeout(() => root.classList.add('is-ready'), openMs * 0.35);
        setTimeout(() => { Name.decode().then(() => Name.startWarp()); }, openMs * 0.4);

        await new Promise((resolve) => {
            (function step(now) {
                const p = clamp((now - o0) / openMs, 0, 1);
                const r = inOutCubic(p) * far;
                loader.style.setProperty('--hr', r.toFixed(1) + 'px');
                ring.style.setProperty('--hr', r.toFixed(1) + 'px');
                ring.style.setProperty('--ro', String(Math.min(1, p * 8) * (1 - smooth(0.7, 1, p))));
                if (p < 1) requestAnimationFrame(step); else resolve();
            })(o0);
        });
        finish();
    }

    /* ======================================================================
       INIT
       ====================================================================== */
    function init() {
        if (!Void.init()) root.classList.add('no-webgl');
        Void.layout();
        Void.start();

        Name.prepare();
        Statement.prepare();
        Strip.build();
        Strip.start();

        initNav();
        initTheme();
        initCopy();
        initLedger();
        initMagnets();
        initGlow();
        initFooterMark();

        let rz = 0;
        window.addEventListener('resize', () => {
            clearTimeout(rz);
            rz = setTimeout(() => {
                Void.resize();
                Name.fit();
                Strip.build();
                Statement.update();
            }, 120);
        });

        let sq = false;
        window.addEventListener('scroll', () => {
            if (sq) return;
            sq = true;
            requestAnimationFrame(() => { sq = false; Statement.update(); });
        }, { passive: true });

        if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', () => Name.fit());

        boot();

        if (window.console && console.log) {
            console.log('%c BLACKOT %c anjum.pro ', 'background:#9a6bff;color:#fff;font-weight:700;padding:3px 8px;border-radius:4px 0 0 4px', 'background:#06060c;color:#d8ccff;padding:3px 8px;border-radius:0 4px 4px 0');
        }
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})();
