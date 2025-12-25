import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import io, { Socket } from 'socket.io-client';
import axios from 'axios';
import { Shield, QrCode, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';

const rawUrl = import.meta.env.VITE_BACKEND_URL || '';
// Sanitize: remove leading/trailing quotes and trailing semicolons
const BACKEND_URL = rawUrl.replace(/^['"]|['"]$/g, '').replace(/;$/, '');

console.log('[Web] Backend URL configured as:', BACKEND_URL);

interface QGateAuthProps {
    onAuthenticated: (token: string, user: any) => void;
    onCancel: () => void;
}

type Step = 'input' | 'qr' | 'success';

const QGateAuth: React.FC<QGateAuthProps> = ({ onAuthenticated, onCancel }) => {
    const [step, setStep] = useState<Step>('input');
    const [identifier, setIdentifier] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [qrData, setQrData] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(120);
    const socketRef = useRef<Socket | null>(null);
    const timerRef = useRef<any>(null);

    useEffect(() => {
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    useEffect(() => {
        if (step === 'qr' && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            handleTimeout();
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [step, timeLeft]);

    const handleTimeout = () => {
        setError('Authentication session expired. Please try again.');
        setStep('input');
        if (socketRef.current) socketRef.current.disconnect();
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const handleInitiate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!identifier.trim()) {
            setError('Please enter your username');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const resp = await axios.post(`${BACKEND_URL}/api/initiate`, { regUserId: identifier });
            const { sessionId, nonce } = resp.data;
            setQrData(JSON.stringify({ sessionId, nonce }));
            setTimeLeft(120);

            const socket = io(BACKEND_URL);
            socketRef.current = socket;

            socket.on('connect', () => {
                socket.emit('join', sessionId);
            });

            socket.on('authenticated', async (token: string) => {
                // Fetch user data after token
                try {
                    const userResp = await axios.get(`${BACKEND_URL}/api/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setStep('success');
                    setTimeout(() => {
                        onAuthenticated(token, userResp.data);
                    }, 1500);
                } catch (e) {
                    setError('Auth succeeded but failed to fetch profile');
                }
            });

            setStep('qr');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to connect to QGate');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card fade-in" style={{ maxWidth: '400px', margin: '2rem auto' }}>
            {step === 'input' && (
                <form onSubmit={handleInitiate}>
                    <Shield className="accent-text" size={48} style={{ marginBottom: '1.5rem' }} />
                    <h2 className="gradient-text">QGate Secure Login</h2>
                    <p style={{ color: '#888', marginBottom: '2rem' }}>
                        Quantum-secure authentication via your mobile device.
                    </p>

                    <input
                        type="text"
                        className="input-field"
                        placeholder="Username or QID"
                        value={identifier}
                        onChange={(e) => {
                            setIdentifier(e.target.value);
                            setError(null);
                        }}
                        autoFocus
                    />

                    {error && <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>}

                    <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
                        {loading ? <Loader2 className="animate-spin" /> : <><QrCode size={20} /> Generate QR Challenge</>}
                    </button>

                    <button type="button" onClick={onCancel} className="btn-secondary" style={{ width: '100%', marginTop: '1rem' }}>
                        Cancel
                    </button>
                </form>
            )}

            {step === 'qr' && qrData && (
                <div className="fade-in">
                    <h2 className="gradient-text">Scan Challenge</h2>
                    <p style={{ color: '#888' }}>Open QGATE app on your phone and scan the code below.</p>

                    <div className="qr-frame">
                        <QRCodeSVG value={qrData} size={200} level="H" includeMargin={false} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10B981' }}>
                            <Loader2 className="animate-spin" size={16} />
                            <span>Waiting for signature...</span>
                        </div>

                        <div className="timer-badge">
                            Expires in: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                        </div>
                    </div>

                    <button onClick={() => {
                        setStep('input');
                        if (socketRef.current) socketRef.current.disconnect();
                    }} className="btn-secondary" style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '8px', marginInline: 'auto' }}>
                        <ArrowLeft size={16} /> Back
                    </button>
                </div>
            )}

            {step === 'success' && (
                <div className="fade-in">
                    <CheckCircle size={64} color="#10B981" style={{ marginBottom: '1rem' }} />
                    <h2 style={{ color: '#10B981' }}>Quantum Verified</h2>
                    <p style={{ color: '#888' }}>Identity confirmed. Accessing your banking dashboard...</p>
                </div>
            )}
        </div>
    );
};

export default QGateAuth;
