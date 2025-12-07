import { useState } from 'react'
import { verifyUserLogin, registerUser } from '../services/mcpClient'
import './Login.css'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!username.trim()) {
        setError('Username is required')
        setLoading(false)
        return
      }

      if (!password.trim()) {
        setError('Password is required')
        setLoading(false)
        return
      }

      if (password.length < 6) {
        setError('Password must be at least 6 characters long')
        setLoading(false)
        return
      }

      let result
      if (isRegistering) {
        // Register new user
        result = await registerUser(username, password)
      } else {
        // Login existing user
        result = await verifyUserLogin(username, password)
      }

      if (result.success) {
        // Call onLogin with user info
        onLogin({ userId: result.user_id, username: result.username })
      } else {
        setError(result.error || 'Authentication failed')
      }
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>🔐 {isRegistering ? 'Register' : 'Login'} to Forex Trading Assistant</h2>
        <p>{isRegistering ? 'Create a new account' : 'Enter your credentials to access your trading data'}</p>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? (isRegistering ? 'Registering...' : 'Logging in...') : (isRegistering ? 'Register' : 'Login')}
          </button>
        </form>

        <div className="login-switch">
          <p>
            {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering)
                setError('')
                setPassword('')
              }}
              className="switch-btn"
              disabled={loading}
            >
              {isRegistering ? 'Login' : 'Register'}
            </button>
          </p>
        </div>

        <p className="login-note">
          💡 {isRegistering ? 'Choose a strong password (at least 6 characters).' : 'Your data is secure and encrypted.'}
        </p>
      </div>
    </div>
  )
}

export default Login

