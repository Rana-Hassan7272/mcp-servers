import { useState } from 'react'
import { saveTrade } from '../services/mcpClient'
import './TradeForm.css'

function TradeForm({ userId }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  
  const [formData, setFormData] = useState({
    entry_price: '',
    take_profit: '',
    stop_loss: '',
    lot_size: '',
    balance: '',
    trade_type: 'BUY',
    currency_pair: 'XAU/USD',
    timeframe: '',
    trade_style: '',
    strategy: '',
    notes: ''
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const tradeData = {
        entry_price: parseFloat(formData.entry_price),
        take_profit: formData.take_profit ? parseFloat(formData.take_profit) : null,
        stop_loss: formData.stop_loss ? parseFloat(formData.stop_loss) : null,
        lot_size: parseFloat(formData.lot_size),
        balance: parseFloat(formData.balance),
        trade_type: formData.trade_type,
        currency_pair: formData.currency_pair,
        timeframe: formData.timeframe || null,
        trade_style: formData.trade_style || null,
        strategy: formData.strategy || null,
        notes: formData.notes || null
      }

      const response = await saveTrade(tradeData, userId)
      console.log('Save trade response:', response) // Debug log
      
      // Check if response contains an error (could be string or object)
      if (typeof response === 'string') {
        if (response.includes('Error') || response.includes('error')) {
          throw new Error(response)
        }
      }
      if (response && response.error) {
        throw new Error(response.error)
      }
      // Check if response is an error message string
      if (response && typeof response === 'string' && (response.toLowerCase().includes('readonly') || response.toLowerCase().includes('read-only'))) {
        throw new Error(response)
      }
      
      // Only set result if we have a valid trade_id
      if (response && response.trade_id) {
        setResult(response)
      } else {
        throw new Error('Failed to save trade: Invalid response from server')
      }
      
      // Reset form on success
      setFormData({
        entry_price: '',
        take_profit: '',
        stop_loss: '',
        lot_size: '',
        balance: '',
        trade_type: 'BUY',
        currency_pair: 'XAU/USD',
        timeframe: '',
        trade_style: '',
        strategy: '',
        notes: ''
      })
    } catch (err) {
      setError(err.message || 'Failed to save trade')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="trade-form-container">
      <h2>📊 Save New Trade</h2>
      
      <form onSubmit={handleSubmit} className="trade-form">
        <div className="form-row">
          <div className="form-group">
            <label>Entry Price *</label>
            <input
              type="number"
              step="0.01"
              name="entry_price"
              value={formData.entry_price}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Take Profit</label>
            <input
              type="number"
              step="0.01"
              name="take_profit"
              value={formData.take_profit}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Stop Loss</label>
            <input
              type="number"
              step="0.01"
              name="stop_loss"
              value={formData.stop_loss}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Lot Size *</label>
            <input
              type="number"
              step="0.01"
              name="lot_size"
              value={formData.lot_size}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Balance *</label>
            <input
              type="number"
              step="0.01"
              name="balance"
              value={formData.balance}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Trade Type *</label>
            <select
              name="trade_type"
              value={formData.trade_type}
              onChange={handleChange}
              required
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Currency Pair</label>
            <input
              type="text"
              name="currency_pair"
              value={formData.currency_pair}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Timeframe</label>
            <select
              name="timeframe"
              value={formData.timeframe}
              onChange={handleChange}
            >
              <option value="">Select timeframe</option>
              <option value="1m">1m</option>
              <option value="3m">3m</option>
              <option value="5m">5m</option>
              <option value="10m">10m</option>
              <option value="15m">15m</option>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="2h">2h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>

          <div className="form-group">
            <label>Trade Style</label>
            <select
              name="trade_style"
              value={formData.trade_style}
              onChange={handleChange}
            >
              <option value="">Select style</option>
              <option value="swing">Swing</option>
              <option value="day trade">Day Trade</option>
              <option value="scalp">Scalp</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Strategy</label>
          <input
            type="text"
            name="strategy"
            value={formData.strategy}
            onChange={handleChange}
            placeholder="e.g., SMC, Fundamental, Mirror, etc."
          />
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows="3"
            placeholder="Optional notes about this trade"
          />
        </div>

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Saving...' : 'Save Trade'}
        </button>
      </form>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="success-message">
          <h3>✅ Trade Saved Successfully!</h3>
          <p><strong>Trade ID:</strong> {result.trade_id || result.tradeId || 'N/A'}</p>
          <p><strong>Status:</strong> {result.status || 'N/A'}</p>
          <p><strong>Message:</strong> {result.message || 'Trade saved'}</p>
          {result.risk_reward_ratio && (
            <p><strong>Risk:Reward:</strong> {result.risk_reward_ratio}</p>
          )}
          {result.potential_profit !== undefined && result.potential_profit !== null && (
            <p><strong>Potential Profit:</strong> ${result.potential_profit.toFixed(2)}</p>
          )}
          {result.potential_loss !== undefined && result.potential_loss !== null && (
            <p><strong>Potential Loss:</strong> ${result.potential_loss.toFixed(2)}</p>
          )}
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: '#666' }}>View Full Response</summary>
            <pre style={{ marginTop: '0.5rem', fontSize: '0.85rem', background: '#f5f5f5', padding: '0.5rem', borderRadius: '4px', overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}

export default TradeForm

