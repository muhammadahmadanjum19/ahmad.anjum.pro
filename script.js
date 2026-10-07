/* ==========================================================================
   anjum.pro
   Engine: startup screen, width-warping name, scroll-lit statement,
   velocity ticker, ledger spotlight, theme reveal.
   Everything degrades: reduced motion -> static, no JS -> plain, fully
   readable HTML.
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

    /* Split an element's text into words and letters (letters are .wm-l). */
    function splitLetters(el) {
        const words = el.textContent.trim().split(/\s+/);
        const out = [];
        el.textContent = '';
        words.forEach((word, wi) => {
            const w = doc.createElement('span');
            w.className = 'wd';
            Array.from(word).forEach((ch) => {
                const l = doc.createElement('span');
                l.className = 'wm-l';
                l.textContent = ch;
                l.style.setProperty('--i', String(out.length));
                w.appendChild(l);
                out.push(l);
            });
            el.appendChild(w);
            if (wi < words.length - 1) el.appendChild(doc.createTextNode(' '));
        });
        return out;
    }

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
            const avail = wide ? Math.min(innerWidth * 0.72, 1100) : innerWidth - pad * 2;
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
        const LIGHT = '#d9d8e4', DARK = '#030307';
        const current = () => root.getAttribute('data-theme') || 'dark';

        function apply(theme) {
            root.setAttribute('data-theme', theme);
            local.set('anjum_pro_theme', theme);
            btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
            if (meta) meta.setAttribute('content', theme === 'dark' ? DARK : LIGHT);
        }
        // Reflect the theme that was set before first paint.
        btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        if (meta) meta.setAttribute('content', current() === 'dark' ? DARK : LIGHT);

        btn.addEventListener('click', () => {
            const next = current() === 'dark' ? 'light' : 'dark';
            if (doc.startViewTransition && !reduce) {
                const r = btn.getBoundingClientRect();
                const x = r.left + r.width / 2, y = r.top + r.height / 2;
                const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
                const vt = doc.startViewTransition(() => apply(next));
                vt.ready.then(() => {
                    root.animate(
                        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
                        { duration: 850, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
                    );
                }).catch(() => {});
            } else {
                apply(next);
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
        const wm = $('#footName');
        if (!wm) return;
        splitLetters(wm);
        if (reduce || !('IntersectionObserver' in window)) { wm.classList.add('in'); return; }
        const io = new IntersectionObserver((es) => {
            if (es[0].isIntersecting) { wm.classList.add('in'); io.disconnect(); }
        }, { threshold: 0.35 });
        io.observe(wm);
    }

    /* ======================================================================
       BOOT — the name lights up while a counter runs, then the page opens
       ====================================================================== */
    async function boot() {
        const loader = $('#loader');
        const num = $('#loaderNum');
        const nameEl = $('#loaderName');
        const letters = splitLetters(nameEl);
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
            root.classList.add('is-ready');
            session.set('anjum_pro_seen', '1');
        };

        if (reduce) {
            await fontsReady;
            Name.fit();
            finish();
            return;
        }

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
                letters.forEach((l, i) => l.classList.toggle('on', eased * letters.length * 1.05 > i + 0.2));
                if (p < 1 || !fontsDone) requestAnimationFrame(step);
                else resolve();
            })(t0);
        });

        Name.fit();
        num.textContent = '100';
        letters.forEach((l) => l.classList.add('on'));
        await sleep(seen ? 80 : 260);

        // Open: fade the startup screen out and reveal the page.
        const openMs = seen ? 500 : 800;
        loader.classList.add('is-leaving');
        setTimeout(() => root.classList.add('is-ready'), openMs * 0.3);
        setTimeout(() => { Name.decode().then(() => Name.startWarp()); }, openMs * 0.4);
        await sleep(openMs);
        finish();
    }

    /* ======================================================================
       INIT
       ====================================================================== */
    function init() {
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

    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})();
