import { useState, useEffect } from 'react'
import './App.css'
import Login from './components/Login'
import Chatbot from './components/Chatbot'
import TradeForm from './components/TradeForm'
import Dashboard from './components/Dashboard'
import RiskAlerts from './components/RiskAlerts'

function App() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('chatbot')

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('forex_user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch (error) {
        console.error('Error loading user:', error)
      }
    }
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    localStorage.setItem('forex_user', JSON.stringify(userData))
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('forex_user')
    // Clear chat history for this user
    if (user?.userId) {
      localStorage.removeItem(`forex_chat_history_${user.userId}`)
    }
  }

  // Show login if not authenticated
  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="App">
      <header className="app-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h1>Forex Trading Assistant</h1>
            <p>Your intelligent trading companion • Logged in as: {user.username}</p>
          </div>
          <button onClick={handleLogout} className="logout-btn" style={{
            padding: '0.5rem 1rem',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}>
            Logout
          </button>
        </div>
      </header>
      
      <main className="app-main">
        <nav className="main-nav">
          <button 
            className={`nav-btn ${activeTab === 'chatbot' ? 'active' : ''}`}
            onClick={() => setActiveTab('chatbot')}
          >
            💬 Chat
          </button>
          <button 
            className={`nav-btn ${activeTab === 'trade' ? 'active' : ''}`}
            onClick={() => setActiveTab('trade')}
          >
            📊 Save Trade
          </button>
          <button 
            className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📈 Dashboard
          </button>
          <button 
            className={`nav-btn ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveTab('alerts')}
          >
            ⚠️ Risk Alerts
          </button>
        </nav>

        <div className="content-area">
          {activeTab === 'chatbot' && <Chatbot userId={user.userId} />}
          {activeTab === 'trade' && <TradeForm userId={user.userId} />}
          {activeTab === 'dashboard' && <Dashboard userId={user.userId} />}
          {activeTab === 'alerts' && <RiskAlerts userId={user.userId} />}
        </div>
      </main>
    </div>
  )
}

export default App

