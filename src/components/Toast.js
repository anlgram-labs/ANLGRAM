export class Toast {
    static container = null;

    static init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        Object.assign(this.container.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: '9999'
        });
        document.body.appendChild(this.container);
    }

    static show(message, type = 'info') {
        this.init();
        const toast = document.createElement('div');
        const colors = {
            success: 'rgba(0, 255, 102, 0.9)',
            error: 'rgba(255, 0, 127, 0.9)',
            info: 'rgba(0, 240, 255, 0.9)',
            warning: 'rgba(255, 153, 0, 0.9)'
        };
        
        Object.assign(toast.style, {
            background: 'rgba(10, 15, 25, 0.95)',
            border: `1px solid ${colors[type]}`,
            borderLeft: `4px solid ${colors[type]}`,
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: `0 4px 15px rgba(0,0,0,0.5)`,
            fontSize: '14px',
            fontFamily: 'var(--font-primary, sans-serif)',
            fontWeight: '600',
            opacity: '0',
            transform: 'translateX(50px)',
            transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            backdropFilter: 'blur(10px)'
        });

        toast.innerText = message;
        this.container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        // Remove after 3s
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    static success(msg) { this.show(msg, 'success'); }
    static error(msg) { this.show(msg, 'error'); }
    static info(msg) { this.show(msg, 'info'); }
    static warning(msg) { this.show(msg, 'warning'); }
}
