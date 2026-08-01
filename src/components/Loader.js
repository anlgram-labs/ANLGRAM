export class Loader {
    static globalOverlay = null;

    static show(message = "Loading...") {
        if (!this.globalOverlay) {
            this.globalOverlay = document.createElement('div');
            Object.assign(this.globalOverlay.style, {
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(10px)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                zIndex: '99999', opacity: '0', transition: 'opacity 0.2s', color: '#fff'
            });

            this.globalOverlay.innerHTML = \`
                <div class="loader-spinner" style="
                    width: 40px; height: 40px; border: 3px solid rgba(0,240,255,0.2); 
                    border-top: 3px solid #00f0ff; border-radius: 50%; 
                    animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
                <div class="loader-text" style="font-size: 14px; font-weight: 600; letter-spacing: 1px;">\${message}</div>
                <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            \`;
            document.body.appendChild(this.globalOverlay);
        } else {
            this.globalOverlay.querySelector('.loader-text').innerText = message;
        }

        this.globalOverlay.style.display = 'flex';
        requestAnimationFrame(() => this.globalOverlay.style.opacity = '1');
    }

    static hide() {
        if (!this.globalOverlay) return;
        this.globalOverlay.style.opacity = '0';
        setTimeout(() => {
            this.globalOverlay.style.display = 'none';
        }, 200);
    }

    // Attaches a skeleton class to an element
    static skeletonize(elementId) {
        const el = document.getElementById(elementId);
        if(!el) return;
        el.classList.add('skeleton-loading');
    }

    static removeSkeleton(elementId) {
        const el = document.getElementById(elementId);
        if(!el) return;
        el.classList.remove('skeleton-loading');
    }
}
