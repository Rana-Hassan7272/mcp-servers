import { useState, useEffect } from 'react'
import { checkRiskAlerts } from '../services/mcpClient'
import './RiskAlerts.css'

function RiskAlerts({ userId }) {
  const [alerts, setAlerts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAlerts = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await checkRiskAlerts({}, userId)
      setAlerts(data)
    } catch (err) {
      setError(err.message || 'Failed to load risk alerts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlerts()
  }, [])

  const getRiskLevelClass = (level) => {
    switch (level) {
      case 'CRITICAL':
        return 'critical'
      case 'HIGH':
        return 'high'
      case 'MEDIUM':
        return 'medium'
      case 'LOW':
        return 'low'
      default:
        return 'low'
    }
  }

  const getRiskIcon = (level) => {
    switch (level) {
      case 'CRITICAL':
        return '🚨'
      case 'HIGH':
        return '⚠️'
      case 'MEDIUM':
        return '⚡'
      case 'LOW':
        return 'ℹ️'
      default:
        return 'ℹ️'
    }
  }

  if (loading) {
    return (
      <div className="risk-alerts-container">
        <div className="loading">Analyzing risk patterns...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="risk-alerts-container">
        <div className="error-message">Error: {error}</div>
        <button onClick={loadAlerts} className="retry-btn">Retry</button>
      </div>
    )
  }

  if (!alerts || !alerts.alerts || alerts.alerts.length === 0) {
    return (
      <div className="risk-alerts-container">
        <div className="no-alerts">
          <h3>✅ No Risk Alerts</h3>
          <p>Your trading patterns look healthy!</p>
          <button onClick={loadAlerts} className="refresh-btn">Refresh Analysis</button>
        </div>
      </div>
    )
  }

  return (
    <div className="risk-alerts-container">
      <div className="alerts-header">
        <h2>⚠️ Risk Alerts</h2>
        <button onClick={loadAlerts} className="refresh-btn">🔄 Refresh</button>
      </div>

      <div className="alerts-summary">
        <div className="summary-item critical">
          <span className="summary-count">{alerts.critical_alerts || 0}</span>
          <span className="summary-label">Critical</span>
        </div>
        <div className="summary-item high">
          <span className="summary-count">{alerts.high_alerts || 0}</span>
          <span className="summary-label">High</span>
        </div>
        <div className="summary-item medium">
          <span className="summary-count">{alerts.medium_alerts || 0}</span>
          <span className="summary-label">Medium</span>
        </div>
        <div className="summary-item low">
          <span className="summary-count">{alerts.low_alerts || 0}</span>
          <span className="summary-label">Low</span>
        </div>
      </div>

      <div className="alerts-list">
        {alerts.alerts.map((alert, idx) => (
          <div key={idx} className={`alert-card ${getRiskLevelClass(alert.risk_level)}`}>
            <div className="alert-header">
              <span className="alert-icon">{getRiskIcon(alert.risk_level)}</span>
              <span className="alert-level">{alert.risk_level}</span>
              <span className="alert-type">{alert.alert_type.replace(/_/g, ' ')}</span>
            </div>
            <div className="alert-message">{alert.message}</div>
            {alert.details && (
              <div className="alert-details">
                <pre>{JSON.stringify(alert.details, null, 2)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {alerts.message && (
        <div className="alerts-footer">
          <p>{alerts.message}</p>
        </div>
      )}
    </div>
  )
}

export default RiskAlerts

