/* ==========================================================================
   ANJUM.PRO — LUXURY OBSIDIAN ENGINE SCRIPT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Fluid Mouse-Tracking Shimmer on Buttons
    const buttons = document.querySelectorAll('.btn-premium');
    buttons.forEach(btn => {
        btn.addEventListener('mousemove', e => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            btn.style.setProperty('--mouse-x', `${x}px`);
            btn.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // 2. Executive Console Telemetry Badge
    console.log(
        '%c ANJUM.PRO %c Luxury Obsidian Engine Active ',
        'background: #a855f7; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
        'background: #030206; color: #e9d5ff; padding: 4px 8px; border-radius: 0 4px 4px 0;'
    );

    // 3. Performance Optimization via IntersectionObserver
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.willChange = 'transform, opacity';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.glass-card').forEach(card => {
        observer.observe(card);
    });

    // 4. Outbound Link Click Telemetry (Optional Analytics Hook)
    document.querySelectorAll('a.btn-premium').forEach(link => {
        link.addEventListener('click', (e) => {
            const destination = link.getAttribute('href');
            console.log(`[Telemetry] Outbound navigation triggered to: ${destination}`);
        });
    });
});
