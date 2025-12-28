import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AdminLogin: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin1234') {
      localStorage.setItem('admin_auth', 'true');
      navigate('/admin/dashboard');
    } else {
      alert('Invalid credentials');
    }
  };

  return (
    <div className="container" style={{maxWidth: '400px', marginTop: '10vh'}}>
      <div className="card">
        <h2 className="text-center">Admin Login</h2>
        <form onSubmit={handleLogin} style={{marginTop: '1rem'}}>
          <div className="input-group">
            <label className="label">Username</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{width: '100%'}}>Login</button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
