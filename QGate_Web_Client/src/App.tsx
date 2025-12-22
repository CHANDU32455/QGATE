import { useState } from 'react';
import './App.css';
import QGateAuth from './components/QGateAuth';
import BankingDashboard from './components/BankingDashboard';
import { Landmark, Shield, Cpu, Lock } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState<any>(null);

  const handleAuthenticated = (token: string, userData: any) => {
    localStorage.setItem('bank_token', token);
    setUser(userData);
    setIsAuthenticated(true);
    setShowAuth(false);
  };

  const logout = () => {
    localStorage.removeItem('bank_token');
    setIsAuthenticated(false);
    setUser(null);
  };

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
