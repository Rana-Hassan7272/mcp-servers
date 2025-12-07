import { useState, useEffect } from 'react'
import { getTradeInsights } from '../services/mcpClient'
import './Dashboard.css'

function Dashboard({ userId }) {
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadInsights = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getTradeInsights({}, userId)
      setInsights(data)
    } catch (err) {
      setError(err.message || 'Failed to load insights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInsights()
  }, [])

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading insights...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error-message">Error: {error}</div>
        <button onClick={loadInsights} className="retry-btn">Retry</button>
      </div>
    )
  }

  if (!insights) {
    return (
      <div className="dashboard-container">
        <div className="no-data">No trading data available</div>
      </div>
    )
  }

  const { summary, performance_metrics, best_performing_side, timeframe_performance, strategy_performance, best_combinations } = insights

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>📈 Trading Analytics Dashboard</h2>
        <button onClick={loadInsights} className="refresh-btn">🔄 Refresh</button>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="stat-card">
          <div className="stat-label">Total Trades</div>
          <div className="stat-value">{summary.total_trades}</div>
          <div className="stat-detail">Open: {summary.open_trades} | Closed: {summary.closed_trades}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Win Rate</div>
          <div className="stat-value">{summary.win_rate.toFixed(1)}%</div>
          <div className="stat-detail">Wins: {summary.wins} | Losses: {summary.losses}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total P/L</div>
          <div className={`stat-value ${summary.total_profit_loss >= 0 ? 'positive' : 'negative'}`}>
            ${summary.total_profit_loss.toFixed(2)}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Profit Factor</div>
          <div className="stat-value">
            {performance_metrics.profit_factor ? performance_metrics.profit_factor.toFixed(2) : 'N/A'}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="metrics-section">
        <h3>Performance Metrics</h3>
        <div className="metrics-grid">
          <div className="metric-item">
            <span className="metric-label">Avg Profit per Win:</span>
            <span className="metric-value positive">${performance_metrics.average_profit_per_win.toFixed(2)}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Avg Loss per Loss:</span>
            <span className="metric-value negative">${performance_metrics.average_loss_per_loss.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Best Performing Side */}
      {best_performing_side && (
        <div className="section">
          <h3>Best Performing Side: {best_performing_side.side}</h3>
          <div className="side-stats">
            <div className="side-stat">
              <strong>BUY:</strong> {best_performing_side.buy_stats.win_rate.toFixed(1)}% win rate 
              ({best_performing_side.buy_stats.wins}/{best_performing_side.buy_stats.total} trades)
            </div>
            <div className="side-stat">
              <strong>SELL:</strong> {best_performing_side.sell_stats.win_rate.toFixed(1)}% win rate 
              ({best_performing_side.sell_stats.wins}/{best_performing_side.sell_stats.total} trades)
            </div>
          </div>
        </div>
      )}

      {/* Best Timeframe */}
      {timeframe_performance && timeframe_performance.best_timeframe && (
        <div className="section">
          <h3>Best Timeframe: {timeframe_performance.best_timeframe}</h3>
          {timeframe_performance.all_timeframes && timeframe_performance.all_timeframes.length > 0 && (
            <div className="performance-list">
              {timeframe_performance.all_timeframes.map((tf, idx) => (
                <div key={idx} className="performance-item">
                  <span className="item-name">{tf.timeframe}</span>
                  <span className="item-stats">
                    {tf.win_rate.toFixed(1)}% win rate | {tf.total_trades} trades | 
                    ${tf.total_pl.toFixed(2)} P/L
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Best Strategy */}
      {strategy_performance && strategy_performance.best_strategy && (
        <div className="section">
          <h3>Best Strategy: {strategy_performance.best_strategy}</h3>
          {strategy_performance.all_strategies && strategy_performance.all_strategies.length > 0 && (
            <div className="performance-list">
              {strategy_performance.all_strategies.map((strat, idx) => (
                <div key={idx} className="performance-item">
                  <span className="item-name">{strat.strategy}</span>
                  <span className="item-stats">
                    {strat.win_rate.toFixed(1)}% win rate | {strat.total_trades} trades | 
                    ${strat.total_pl.toFixed(2)} P/L
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Best Combinations */}
      {best_combinations && best_combinations.top_5_timeframe_strategy_combos && best_combinations.top_5_timeframe_strategy_combos.length > 0 && (
        <div className="section">
          <h3>Top Trading Combinations</h3>
          <div className="combinations-list">
            {best_combinations.top_5_timeframe_strategy_combos.map((combo, idx) => (
              <div key={idx} className="combination-item">
                <div className="combo-header">
                  <span className="combo-name">{combo.timeframe} + {combo.strategy}</span>
                  <span className="combo-winrate">{combo.win_rate.toFixed(1)}% win rate</span>
                </div>
                <div className="combo-details">
                  {combo.total_trades} trades | ${combo.total_pl.toFixed(2)} total P/L
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard

