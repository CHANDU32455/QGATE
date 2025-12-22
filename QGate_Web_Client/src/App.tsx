import { useState, useEffect, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import axios from 'axios';
import './App.css';
import QGateAuth from './components/QGateAuth';
import BankingDashboard from './components/BankingDashboard';
import { Landmark, Shield, Cpu, Lock } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  // Persistence: Hydrate session on mount
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('bank_token');
      const savedUser = localStorage.getItem('bank_user');

      if (savedToken && savedUser) {
        try {
          // Verify token is still valid with backend
          const resp = await axios.get(`${BACKEND_URL}/api/me`, {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          setUser(resp.data);
          setIsAuthenticated(true);
        } catch (err) {
          console.error('Session hydration failed:', err);
          localStorage.removeItem('bank_token');
          localStorage.removeItem('bank_user');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Socket management for real-time revocation
  useEffect(() => {
    if (isAuthenticated && user) {
      if (!socketRef.current) {
        const socket = io(BACKEND_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[Socket] Connected, joining user room:', user.userId);
          socket.emit('joinUser', user.userId);
        });

        socket.on('sessions_updated', async () => {
          console.log('[Socket] Sessions updated, verifying current session...');
          const token = localStorage.getItem('bank_token');
          if (!token) return;

          try {
            await axios.get(`${BACKEND_URL}/api/me`, {
              headers: { Authorization: `Bearer ${token}` }
            });
          } catch (err) {
            console.warn('[Socket] Session no longer valid, logging out');
            logout();
          }
        });

        socket.on('disconnect', () => {
          console.log('[Socket] Disconnected');
        });
      }
    } else {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated, user]);

  const handleAuthenticated = (token: string, userData: any) => {
    localStorage.setItem('bank_token', token);
    localStorage.setItem('bank_user', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
    setShowAuth(false);
  };

  const logout = useCallback(async () => {
    const token = localStorage.getItem('bank_token');
    if (token) {
      try {
        await axios.post(`${BACKEND_URL}/api/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.error('Remote logout failed:', err);
      }
    }

    localStorage.removeItem('bank_token');
    localStorage.removeItem('bank_user');
    setIsAuthenticated(false);
    setUser(null);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  if (isLoading) {
    return (
      <div className="premium-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Lock className="accent-text animate-pulse" size={48} style={{ marginBottom: '1rem' }} />
          <p style={{ color: '#888' }}>Securing Connection...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <BankingDashboard user={user} onLogout={logout} />;
  }

  if (showAuth) {
    return (
      <div className="premium-container">
        <QGateAuth onAuthenticated={handleAuthenticated} onCancel={() => setShowAuth(false)} />
      </div>
    );
  }

  return (
    <div className="premium-container fade-in">
      <nav style={{ display: 'flex', justifyContent: 'center', marginBottom: '4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Landmark size={40} className="accent-text" />
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', margin: 0 }}>Quantum Trust Bank</h1>
        </div>
      </nav>

      <main className="glass-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>The Future of Secure Banking</h2>
        <p style={{ color: '#aaa', fontSize: '1.1rem', marginBottom: '3rem', maxWidth: '600px', marginInline: 'auto' }}>
          Experience the world's most secure financial platform. Powered by Post-Quantum Cryptography and Hardware Attestation.
        </p>

        <div className="dashboard-stats" style={{ textAlign: 'left', marginBottom: '3rem' }}>
          <div className="stat-item">
            <Lock className="accent-text" size={24} style={{ marginBottom: '1rem' }} />
            <div className="stat-label">Quantum Proof</div>
            <div style={{ fontSize: '0.9rem' }}>Dilithium ML-DSA signatures ensure your assets are safe from quantum computer threats.</div>
          </div>
          <div className="stat-item">
            <Shield className="accent-text" size={24} style={{ marginBottom: '1rem' }} />
            <div className="stat-label">Device Bound</div>
            <div style={{ fontSize: '0.9rem' }}>Your private keys never leave your phone's Secure Enclave, verified by Play Integrity.</div>
          </div>
          <div className="stat-item">
            <Cpu className="accent-text" size={24} style={{ marginBottom: '1rem' }} />
            <div className="stat-label">Hardware Verified</div>
            <div style={{ fontSize: '0.9rem' }}>Real-time hardware attestation prevents login from compromised or emulated devices.</div>
          </div>
        </div>

        <button onClick={() => setShowAuth(true)} className="btn-primary" style={{ margin: '0 auto', fontSize: '1.2rem', padding: '1rem 3rem' }}>
          Enter Banking Portal
        </button>

        <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#555' }}>
          Requires <strong>Q-GATE</strong> mobile wallet for authentication.
        </p>
      </main>

      <footer style={{ marginTop: '4rem', opacity: 0.5, fontSize: '0.8rem' }}>
        &copy; 2025 Quantum Trust Solutions. All rights reserved.
      </footer>
    </div>
  );
}

export default App;
