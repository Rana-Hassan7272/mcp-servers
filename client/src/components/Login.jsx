import { useState } from 'react'
import './Login.css'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Simple authentication - in production, use proper backend authentication
      // For now, we'll use username as user_id
      if (!username.trim()) {
        setError('Username is required')
        setLoading(false)
        return
      }

      // Generate a simple user ID from username (in production, use proper auth)
      const userId = username.toLowerCase().replace(/\s+/g, '_')
      
      // Call onLogin with user info
      onLogin({ userId, username })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>🔐 Login to Forex Trading Assistant</h2>
        <p>Enter your username to access your trading data</p>
        
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

          {error && (
            <div className="error-message">{error}</div>
          )}

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="login-note">
          💡 Your username is your unique identifier. Use the same username to access your data.
        </p>
      </div>
    </div>
  )
}

export default Login

