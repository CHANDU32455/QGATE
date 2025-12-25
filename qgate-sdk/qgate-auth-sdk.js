/**
 * QGate Auth SDK - Lightweight Button & Modal
 * Usage:
 * <div id="qgate-auth-container"></div>
 * <script src="qgate-auth-sdk.js"></script>
 * <script>
 *   QGate.init({
 *     containerId: 'qgate-auth-container',
 *     backendUrl: 'http://localhost:5000',
 *     onSuccess: (token) => { console.log('Auth Success!', token); },
 *     onFailure: (err) => { console.error('Auth Failed', err); }
 *   });
 * </script>
 */

const QGate = (() => {
    let config = {
        backendUrl: 'http://localhost:5000',
        onSuccess: null,
        onFailure: null,
    };

    const styles = `
        .qgate-btn {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 12px;
            font-family: 'Inter', sans-serif;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
        }
        .qgate-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
        }
        .qgate-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(8px);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        }
        .qgate-modal {
            background: #111;
            border: 1px solid #333;
            border-radius: 24px;
            padding: 40px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            color: white;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .qgate-qr-container {
            background: white;
            padding: 20px;
            border-radius: 16px;
            margin: 24px auto;
            width: 200px;
            height: 200px;
        }
        .qgate-loader {
            border: 3px solid #333;
            border-top: 3px solid #6366f1;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
            display: inline-block;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;

    const injectStyles = () => {
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
    };

    const createModal = () => {
        const overlay = document.createElement('div');
        overlay.className = 'qgate-modal-overlay';
        overlay.id = 'qgate-overlay';
        overlay.innerHTML = `
            <div class="qgate-modal">
                <h2 style="margin-top: 0; background: linear-gradient(to right, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Quantum Auth</h2>
                <p style="color: #888;">Scan this code with your QGate App</p>
                <div id="qgate-qr-target" class="qgate-qr-container">
                    <div class="qgate-loader" style="margin-top: 85px;"></div>
                </div>
                <div id="qgate-status" style="margin-top: 15px; color: #10B981; font-size: 14px;">
                    Waiting for QGate app...
                </div>
                <button onclick="QGate.close()" style="margin-top: 30px; background: transparent; border: 1px solid #333; color: #888; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Cancel</button>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    };

    let socket = null;

    const init = (userConfig) => {
        config = { ...config, ...userConfig };
        injectStyles();

        const container = document.getElementById(config.containerId);
        if (!container) return;

        container.innerHTML = `
            <button class="qgate-btn" onclick="QGate.open()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Auth With QGate
            </button>
        `;
    };

    const open = async () => {
        const overlay = document.getElementById('qgate-overlay') || createModal();
        overlay.style.display = 'flex';

        try {
            // 1. Initiate Generic Session
            const resp = await fetch(`${config.backendUrl}/api/auth/initiate-generic`, { method: 'POST' });
            const { sessionId, nonce } = await resp.json();

            // 2. Generate QR Code (using a public CDN for qrcode.js for simplicity in this demo)
            if (!window.QRCode) {
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
            }

            const qrTarget = document.getElementById('qgate-qr-target');
            qrTarget.innerHTML = '';
            new QRCode(qrTarget, {
                text: JSON.stringify({ sessionId, nonce }),
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            // 3. Setup Socket.io
            if (!window.io) {
                await loadScript('https://cdn.socket.io/4.7.2/socket.io.min.js');
            }

            socket = io(config.backendUrl);
            socket.on('connect', () => {
                socket.emit('join', sessionId);
            });

            socket.on('authenticated', (token) => {
                document.getElementById('qgate-status').innerText = '✅ Authenticated!';
                document.getElementById('qgate-status').style.color = '#10B981';
                setTimeout(() => {
                    close();
                    if (config.onSuccess) config.onSuccess(token);
                }, 1000);
            });

        } catch (err) {
            console.error('QGate Error:', err);
            if (config.onFailure) config.onFailure(err);
        }
    };

    const close = () => {
        const overlay = document.getElementById('qgate-overlay');
        if (overlay) overlay.style.display = 'none';
        if (socket) {
            socket.disconnect();
            socket = null;
        }
    };

    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    return { init, open, close };
})();

window.QGate = QGate;
