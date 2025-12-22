import React, { useState } from 'react';
import { Wallet, ArrowUpCircle, ArrowDownCircle, Landmark, LogOut, TrendingUp, Shield } from 'lucide-react';

interface BankingDashboardProps {
    user: any;
    onLogout: () => void;
}

const BankingDashboard: React.FC<BankingDashboardProps> = ({ user, onLogout }) => {
    const [balance, setBalance] = useState(25450.75);
    const [transactions, setTransactions] = useState([
        { id: 1, type: 'Credit', amount: 1500.00, date: '2025-12-21', desc: 'Monthly Salary' },
        { id: 2, type: 'Debit', amount: 45.20, date: '2025-12-20', desc: 'Starbucks Coffee' },
        { id: 3, type: 'Debit', amount: 120.00, date: '2025-12-19', desc: 'Utility Bill' },
    ]);

    const handleIncrement = () => {
        const amount = 500;
        setBalance(prev => prev + amount);
        setTransactions(prev => [{
            id: Date.now(),
            type: 'Credit',
            amount,
            date: new Date().toISOString().split('T')[0],
            desc: 'Quantum Reward'
        }, ...prev]);
    };

    const handleDecrement = () => {
        const amount = 200;
        if (balance < amount) return;
        setBalance(prev => prev - amount);
        setTransactions(prev => [{
            id: Date.now(),
            type: 'Debit',
            amount,
            date: new Date().toISOString().split('T')[0],
            desc: 'Secure Withdrawal'
        }, ...prev]);
    };

    return (
        <div className="premium-container fade-in" style={{ textAlign: 'left' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Landmark size={32} className="accent-text" />
                    <h1 className="gradient-text" style={{ margin: 0 }}>Quantum Trust Bank</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', color: '#10B981', fontSize: '0.8rem', fontWeight: 'bold' }}>
                            <Shield size={14} /> Quantum Secured
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>Welcome, {user.username}</div>
                    </div>
                    <button onClick={onLogout} className="btn-secondary" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '8px' }}>
                        <LogOut size={18} /> Logout
                    </button>
                </div>
            </header>

            <div className="dashboard-stats">
                <div className="glass-card stat-item">
                    <div className="stat-label">Total Balance</div>
                    <div className="stat-value" style={{ fontSize: '2.5rem' }}>${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                        <button onClick={handleIncrement} className="btn-primary" style={{ flex: 1, padding: '0.5rem' }}>
                            <ArrowUpCircle size={18} /> Add
                        </button>
                        <button onClick={handleDecrement} className="btn-secondary" style={{ flex: 1, padding: '0.5rem' }}>
                            <ArrowDownCircle size={18} /> Spend
                        </button>
                    </div>
                </div>

                <div className="glass-card stat-item">
                    <div className="stat-label">Identity Level</div>
                    <div className="stat-value" style={{ color: '#10B981' }}>PQC Level 3</div>
                    <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>Protected by ML-DSA (Dilithium)</p>
                    <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Wallet className="accent-text" size={20} />
                        <span style={{ fontSize: '0.9rem' }}>QID: {user.userId}</span>
                    </div>
                </div>

                <div className="glass-card stat-item">
                    <div className="stat-label">Market Status</div>
                    <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        Steady <TrendingUp color="#10B981" />
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>Quantum markets are resilient.</p>
                </div>
            </div>

            <div className="glass-card" style={{ padding: '2rem', marginTop: '2rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Recent Transactions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {transactions.map(tx => (
                        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                {tx.type === 'Credit' ? <ArrowUpCircle color="#10B981" /> : <ArrowDownCircle color="#ef4444" />}
                                <div>
                                    <div style={{ fontWeight: '600' }}>{tx.desc}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#666' }}>{tx.date}</div>
                                </div>
                            </div>
                            <div style={{ fontWeight: '700', color: tx.type === 'Credit' ? '#10B981' : '#fff' }}>
                                {tx.type === 'Credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default BankingDashboard;
