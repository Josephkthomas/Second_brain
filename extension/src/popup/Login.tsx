import React, { useState } from 'react';
import { Brain, Loader2, AlertCircle } from 'lucide-react';
import { signIn } from '../lib/supabase';

interface LoginProps {
  onSuccess: (user: { id: string; email: string | undefined }) => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setIsLoading(true);

    try {
      const { user, error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message || 'Login failed');
        setIsLoading(false);
        return;
      }

      if (user) {
        onSuccess({ id: user.id, email: user.email });
      } else {
        setError('Login failed. Please try again.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="header">
        <Brain className="header-icon" size={28} />
        <div>
          <h1 className="header-title">Synapse</h1>
          <p className="header-subtitle">Knowledge Capture</p>
        </div>
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            disabled={isLoading}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            disabled={isLoading}
          />
        </div>

        {error && (
          <div className="error-message">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="btn-spinner" size={18} />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      <p className="login-footer">
        Use your Synapse account credentials
      </p>
    </div>
  );
};
