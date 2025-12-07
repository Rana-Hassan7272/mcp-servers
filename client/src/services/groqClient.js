/**
 * Groq LLM Client Service
 * Handles communication with Groq API for intelligent tool calling
 */

import Groq from 'groq-sdk';
import { saveTrade, logTradeResult, getTradeInsights, checkRiskAlerts } from './mcpClient';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.warn('VITE_GROQ_API_KEY not found in environment variables');
}

// Note: dangerouslyAllowBrowser is set to true for client-side usage
// In production, consider using a backend proxy to protect your API key
const groq = GROQ_API_KEY ? new Groq({ 
  apiKey: GROQ_API_KEY,
  dangerouslyAllowBrowser: true 
}) : null;

/**
 * Tool definitions for Groq function calling
 */
const TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'save_trade',
      description: 'Save a new trade entry. REQUIRED fields: entry_price, lot_size, balance, trade_type (BUY or SELL). Optional: take_profit, stop_loss, currency_pair (default XAU/USD), timeframe, trade_style, strategy, notes.',
      parameters: {
        type: 'object',
        properties: {
          entry_price: { type: 'number', description: 'Entry price of the trade (required)' },
          take_profit: { type: 'number', description: 'Take profit price (optional)' },
          stop_loss: { type: 'number', description: 'Stop loss price (optional)' },
          lot_size: { type: 'number', description: 'Lot size - any positive number (required)' },
          balance: { type: 'number', description: 'Current account balance (required)' },
          trade_type: { type: 'string', enum: ['BUY', 'SELL'], description: 'Trade type - BUY or SELL (required)' },
          currency_pair: { type: 'string', description: 'Currency pair (default: XAU/USD)' },
          timeframe: { type: 'string', enum: ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d'], description: 'Chart timeframe' },
          trade_style: { type: 'string', enum: ['swing', 'day trade', 'scalp'], description: 'Trading style' },
          strategy: { type: 'string', description: 'Trading strategy/technique description' },
          notes: { type: 'string', description: 'Additional notes about the trade' }
        },
        required: ['entry_price', 'lot_size', 'balance', 'trade_type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_trade_result',
      description: 'Log the result of a completed trade (WIN or LOSS). Automatically calculates profit/loss based on saved trade details.',
      parameters: {
        type: 'object',
        properties: {
          trade_id: { type: 'number', description: 'ID of the trade to log result for (required)' },
          result: { type: 'string', enum: ['WIN', 'LOSS'], description: 'Trade result - WIN or LOSS (required)' },
          notes: { type: 'string', description: 'Optional notes about the result' }
        },
        required: ['trade_id', 'result']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_trade_insights',
      description: 'Get comprehensive analytics and insights from all saved trades including win rate, best strategies, timeframes, etc.',
      parameters: {
        type: 'object',
        properties: {
          currency_pair: { type: 'string', description: 'Filter by currency pair (optional)' },
          timeframe: { type: 'string', description: 'Filter by timeframe (optional)' },
          strategy: { type: 'string', description: 'Filter by strategy (optional)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_risk_alerts',
      description: 'Check for risk alerts based on trading patterns - consecutive losses, revenge trading, overconfidence, etc.',
      parameters: {
        type: 'object',
        properties: {
          recent_trades_count: { type: 'number', description: 'Number of recent trades to analyze (default: 10)' },
          consecutive_loss_threshold: { type: 'number', description: 'Threshold for consecutive losses alert (default: 3)' },
          max_trades_per_hour: { type: 'number', description: 'Maximum trades per hour before overtrading alert (default: 5)' },
          max_risk_per_trade_percent: { type: 'number', description: 'Maximum risk per trade percentage (default: 2.0)' },
          drawdown_threshold_percent: { type: 'number', description: 'Drawdown threshold percentage (default: 10.0)' }
        }
      }
    }
  }
];

/**
 * Process user message with Groq LLM and execute tool calls
 */
export async function processUserMessage(userMessage, conversationHistory = [], userId = null) {
  if (!groq) {
    throw new Error('Groq API key not configured. Please set VITE_GROQ_API_KEY in your .env file.');
  }

  // Build conversation messages
  const messages = [
    {
      role: 'system',
      content: `You are a helpful Forex Trading Assistant. You ONLY help with trading-related tasks:
1. Saving trades when users provide trade details
2. Logging trade results (WIN/LOSS) when users tell you about outcomes
3. Providing insights when users ask about trading performance
4. Checking risk alerts when users want to monitor trading patterns

IMPORTANT: If the user asks something NOT related to trading (like their name, weather, etc.), politely redirect them: "I'm your Forex Trading Assistant. I can help you save trades, log results, get insights, or check risk alerts. How can I help with your trading today?"

IMPORTANT RULES FOR EXTRACTING TRADE DATA:
- When user says "entry price was 3000" → extract entry_price: 3000
- When user says "lot size 0.01" → extract lot_size: 0.01
- When user says "current balance 400" → extract balance: 400
- When user says "trade type sell" or "SELL" → extract trade_type: "SELL" (must be uppercase "BUY" or "SELL")
- When user says "take profit 3010" or "TP 3010" → extract take_profit: 3010
- When user says "stop loss 2990" or "SL 2990" → extract stop_loss: 2990
- When user says "i won trade 1" or "trade 1 was a win" → extract trade_id: 1, result: "WIN"

REQUIRED FIELDS for save_trade:
- entry_price (number): The entry price
- lot_size (number): Lot size (any positive number)
- balance (number): Current account balance
- trade_type (string): Must be "BUY" or "SELL" (uppercase)

OPTIONAL FIELDS:
- take_profit, stop_loss, currency_pair, timeframe, trade_style, strategy, notes

CRITICAL: If user provides incomplete REQUIRED data, DO NOT call the tool. Instead, ask them nicely in a friendly way like "I need one more detail to save your trade: Please provide the [missing field name]." Never show technical validation errors to the user.

For get_trade_insights: If user asks for specific information (e.g., "only timeframe", "just tell me timeframe", "which timeframe suits me"), call the tool but the system will filter the response to show only that information.

After calling a tool, summarize the result in natural language.`
    },
    ...conversationHistory,
    {
      role: 'user',
      content: userMessage
    }
  ];

  try {
    // Call Groq with function calling enabled
    let response;
    try {
      response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant', // Currently supported model with function calling
        messages: messages,
        tools: TOOLS_DEFINITIONS,
        tool_choice: 'auto', // Let LLM decide when to call tools
        temperature: 0.3, // Lower temperature for more consistent function calling
        max_tokens: 2048
      });
    } catch (groqError) {
      // Handle Groq API errors, especially function calling errors
      if (groqError.error && groqError.error.code === 'tool_use_failed') {
        // If function calling failed, try to understand user intent without tools
        const userIntent = userMessage.toLowerCase();
        
        // Check if it's a trading-related query
        if (userIntent.includes('timeframe') || userIntent.includes('strategy') || 
            userIntent.includes('win rate') || userIntent.includes('insight') ||
            userIntent.includes('trade') || userIntent.includes('save') ||
            userIntent.includes('log') || userIntent.includes('risk')) {
          // Retry without function calling, let LLM respond naturally
          const fallbackResponse = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful Forex Trading Assistant. If the user asks about trades, insights, or wants to save/log trades, acknowledge their request but explain that you need to use specific tools. For non-trading questions, respond naturally.'
              },
              ...conversationHistory,
              { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 512
          });
          return fallbackResponse.choices[0].message.content;
        } else {
          // Non-trading query, respond naturally
          return "I'm your Forex Trading Assistant focused on trading. I can help you save trades, log results, get insights, and check risk alerts. How can I help with your trading today?";
        }
      }
      throw groqError;
    }

    const message = response.choices[0].message;

    // If no tool calls and there's content, return it (LLM responded directly)
    if (!message.tool_calls && message.content) {
      return message.content;
    }

    // Check if LLM wants to call a tool
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const toolName = toolCall.function.name;
      
      // Parse tool arguments safely
      let toolArgs = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch (parseError) {
        console.error('Error parsing tool arguments:', parseError);
        return `❌ Error parsing your request. Please try rephrasing your message.`;
      }

      console.log('Tool call:', toolName, 'Args:', toolArgs); // Debug

      // Execute the tool call
      let toolResult;
      try {
        switch (toolName) {
          case 'save_trade':
            // Validate required fields before calling
            const missingFields = [];
            if (!toolArgs.entry_price && toolArgs.entry_price !== 0) missingFields.push('entry_price');
            if (!toolArgs.lot_size && toolArgs.lot_size !== 0) missingFields.push('lot_size');
            if (!toolArgs.balance && toolArgs.balance !== 0) missingFields.push('balance');
            if (!toolArgs.trade_type) missingFields.push('trade_type');

            if (missingFields.length > 0) {
              return `I need a few more details to save your trade:\n${missingFields.map(f => `- ${f.replace(/_/g, ' ')}`).join('\n')}\n\nPlease provide these missing required fields.`;
            }

            // Ensure trade_type is uppercase
            if (toolArgs.trade_type) {
              toolArgs.trade_type = toolArgs.trade_type.toUpperCase();
            }

            console.log('Calling saveTrade with:', toolArgs); // Debug
            toolResult = await saveTrade(toolArgs);
            console.log('saveTrade result:', toolResult); // Debug

            if (!toolResult) {
              return `❌ No response from server. Please try again.`;
            }

            // Check if result is a string (error message)
            if (typeof toolResult === 'string') {
              if (toolResult.includes('Error') || toolResult.includes('error')) {
                // Parse validation errors and ask nicely
                if (toolResult.includes('required property')) {
                  const missingField = toolResult.match(/'(\w+)' is a required property/)?.[1];
                  if (missingField) {
                    const fieldName = missingField.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    return `I need one more detail to save your trade:\n\nPlease provide the ${fieldName}.`;
                  }
                }
                return `❌ Error saving trade: ${toolResult}`;
              }
            }

            if (toolResult.error) {
              // Handle validation errors nicely
              const errorMsg = toolResult.error;
              if (errorMsg.includes('required property') || errorMsg.includes('required')) {
                const missingField = errorMsg.match(/'(\w+)' is a required property/)?.[1] || 
                                   errorMsg.match(/required.*?(\w+)/i)?.[1];
                if (missingField) {
                  const fieldName = missingField.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  return `I need one more detail to save your trade:\n\nPlease provide the ${fieldName}.`;
                }
              }
              return `❌ Error saving trade: ${errorMsg}`;
            }

            // Handle different response formats - check nested structures
            let resultData = toolResult;
            if (toolResult.result) {
              resultData = toolResult.result;
            }
            if (resultData.structuredContent) {
              resultData = resultData.structuredContent;
            }

            const tradeId = resultData.trade_id || resultData.tradeId || toolResult.trade_id || toolResult.tradeId;
            const entryPrice = resultData.entry_price || resultData.entryPrice || toolResult.entry_price || toolResult.entryPrice;
            const takeProfit = resultData.take_profit || resultData.takeProfit || toolResult.take_profit || toolResult.takeProfit;
            const stopLoss = resultData.stop_loss || resultData.stopLoss || toolResult.stop_loss || toolResult.stopLoss;
            const lotSize = resultData.lot_size || resultData.lotSize || toolResult.lot_size || toolResult.lotSize;
            const tradeType = resultData.trade_type || resultData.tradeType || toolResult.trade_type || toolResult.tradeType;
            const riskReward = resultData.risk_reward_ratio || resultData.riskRewardRatio || toolResult.risk_reward_ratio || toolResult.riskRewardRatio;
            const status = resultData.status || toolResult.status;

            return `✅ Trade #${tradeId} saved successfully!\n` +
                   `Entry: ${entryPrice}, TP: ${takeProfit || 'Not set'}, SL: ${stopLoss || 'Not set'}\n` +
                   `Lot Size: ${lotSize}, Type: ${tradeType}\n` +
                   (riskReward ? `Risk:Reward: ${riskReward}\n` : '') +
                   `Status: ${status}`;

          case 'log_trade_result':
            if (!toolArgs.trade_id || !toolArgs.result) {
              return 'I need the trade ID and result (WIN or LOSS) to log this trade.';
            }
            if (!userId) {
              return `❌ Error: User session not found. Please log in again.`;
            }
            
            toolResult = await logTradeResult(toolArgs.trade_id, toolArgs.result, toolArgs.notes, userId);
            if (toolResult.error) {
              return `❌ Error: ${toolResult.error}`;
            }
            return `✅ Trade #${toolResult.trade_id} logged as ${toolResult.result}!\n` +
                   `Profit/Loss: $${toolResult.profit_loss.toFixed(2)}\n` +
                   `Previous Balance: $${toolResult.previous_balance.toFixed(2)}\n` +
                   `New Balance: $${toolResult.new_balance.toFixed(2)}`;

          case 'get_trade_insights':
            if (!userId) {
              return `❌ Error: User session not found. Please log in again.`;
            }
            
            // Extract date filter from user message
            const userMsgLower = userMessage.toLowerCase();
            let dateFilter = null;
            if (userMsgLower.includes('today') || userMsgLower.includes("today's")) {
              dateFilter = 'today';
            } else if (userMsgLower.includes('this week') || userMsgLower.includes("this week's")) {
              dateFilter = 'this_week';
            } else if (userMsgLower.includes('this month') || userMsgLower.includes("this month's")) {
              dateFilter = 'this_month';
            }
            
            toolResult = await getTradeInsights({...toolArgs, date_filter: dateFilter}, userId);
            if (toolResult.error) {
              return `❌ Error: ${toolResult.error}`;
            }
            
            // Check if user asked for specific information only
            const userMessageLower = userMessage.toLowerCase();
            const askedForTimeframe = (userMessageLower.includes('timeframe') || userMessageLower.includes('which timeframe suits')) && 
                                    (userMessageLower.includes('only') || 
                                     userMessageLower.includes('just') ||
                                     userMessageLower.includes('tell me') ||
                                     userMessageLower.includes('which timeframe') ||
                                     userMessageLower.includes('suits me'));
            const askedForStrategy = userMessageLower.includes('strategy') && 
                                   (userMessageLower.includes('only') || 
                                    userMessageLower.includes('just') ||
                                    userMessageLower.includes('tell me'));
            const askedForWinRate = userMessageLower.includes('win rate') && 
                                  (userMessageLower.includes('only') || 
                                   userMessageLower.includes('just'));
            
            // If user asked for specific info, return only that
            if (askedForTimeframe) {
              const bestTimeframe = toolResult.timeframe_performance?.best_timeframe || 'N/A';
              const allTimeframes = toolResult.timeframe_performance?.all_timeframes || [];
              
              if (allTimeframes.length > 0) {
                let response = `📊 Best Timeframe: ${bestTimeframe}\n\n`;
                response += `Timeframe Performance:\n`;
                allTimeframes.forEach(tf => {
                  response += `• ${tf.timeframe}: ${tf.win_rate.toFixed(2)}% Win Rate (${tf.total_trades} trades, P/L: $${tf.total_pl.toFixed(2)})\n`;
                });
                return response;
              }
              return `📊 Best Timeframe: ${bestTimeframe}`;
            }
            
            if (askedForStrategy) {
              const bestStrategy = toolResult.strategy_performance?.best_strategy || 'N/A';
              const allStrategies = toolResult.strategy_performance?.all_strategies || [];
              
              if (allStrategies.length > 0) {
                let response = `📊 Best Strategy: ${bestStrategy}\n\n`;
                response += `Strategy Performance:\n`;
                allStrategies.forEach(strat => {
                  response += `• ${strat.strategy}: ${strat.win_rate.toFixed(2)}% Win Rate (${strat.total_trades} trades, P/L: $${strat.total_pl.toFixed(2)})\n`;
                });
                return response;
              }
              return `📊 Best Strategy: ${bestStrategy}`;
            }
            
            if (askedForWinRate) {
              const summary = toolResult.summary || {};
              return `📊 Win Rate: ${summary.win_rate ? summary.win_rate.toFixed(2) + '%' : 'N/A'}\n` +
                     `Wins: ${summary.wins || 0}\n` +
                     `Losses: ${summary.losses || 0}\n` +
                     `Total Trades: ${summary.total_trades || 0}`;
            }
            
            // Default: return full insights
            const summary = toolResult.summary || {};
            const metrics = toolResult.performance_metrics || {};
            return `📊 Trading Insights:\n\n` +
                   `Total Trades: ${summary.total_trades || 0}\n` +
                   `Win Rate: ${summary.win_rate ? summary.win_rate.toFixed(2) + '%' : 'N/A'}\n` +
                   `Total P/L: $${summary.total_profit_loss ? summary.total_profit_loss.toFixed(2) : '0.00'}\n` +
                   `Average Profit per Win: $${metrics.average_profit_per_win ? metrics.average_profit_per_win.toFixed(2) : '0.00'}\n` +
                   `Best Side: ${toolResult.best_performing_side?.side || 'N/A'}\n` +
                   `Best Timeframe: ${toolResult.timeframe_performance?.best_timeframe || 'N/A'}\n` +
                   `Best Strategy: ${toolResult.strategy_performance?.best_strategy || 'N/A'}`;

          case 'check_risk_alerts':
            if (!userId) {
              return `❌ Error: User session not found. Please log in again.`;
            }
            
            toolResult = await checkRiskAlerts(toolArgs, userId);
            if (toolResult.error) {
              return `❌ Error: ${toolResult.error}`;
            }
            if (!toolResult.alerts || toolResult.alerts.length === 0) {
              return '✅ No risk alerts detected. Your trading looks good!';
            }
            let alertMessage = `🚨 Risk Alerts (${toolResult.total_alerts} total):\n\n`;
            toolResult.alerts.slice(0, 5).forEach((alert, idx) => {
              alertMessage += `${idx + 1}. [${alert.risk_level}] ${alert.alert_type.replace(/_/g, ' ')}\n`;
              alertMessage += `   ${alert.message}\n`;
              if (alert.recommendation) {
                alertMessage += `   💡 ${alert.recommendation}\n`;
              }
              alertMessage += '\n';
            });
            return alertMessage;

          default:
            return `Unknown tool: ${toolName}`;
        }
      } catch (error) {
        return `❌ Error executing ${toolName}: ${error.message}`;
      }
    }

    // If no tool call, return the LLM's text response
    return message.content || 'I understand, but I need more information to help you. Try asking me to save a trade, log a result, get insights, or check risk alerts.';

  } catch (error) {
    console.error('Groq API error:', error);
    throw new Error(`Failed to process message: ${error.message}`);
  }
}

export default {
  processUserMessage,
  TOOLS_DEFINITIONS
};

