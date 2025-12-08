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
      description: 'Save a new trade entry. REQUIRED fields: entry_price, lot_size, balance, trade_type (BUY or SELL). IMPORTANT fields: take_profit, stop_loss. ALSO NEEDED fields: timeframe, trade_style (swing, day trade, scalp), strategy. Optional: currency_pair (default XAU/USD), notes. DO NOT call this tool if timeframe, trade_style, or strategy are missing - ask for them first.',
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
          timeframe: { type: 'string', enum: ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d'], description: 'Trading timeframe' },
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
      description: 'Get comprehensive analytics and insights from all saved trades including win rate, best strategies, timeframes, etc. For date filtering, use date_filter parameter with values: "today", "this_week", or "this_month". DO NOT use start_date or end_date - they are not supported.',
      parameters: {
        type: 'object',
        properties: {
          currency_pair: { type: 'string', description: 'Filter by currency pair (optional, e.g., "XAU/USD")' },
          timeframe: { type: 'string', description: 'Filter by timeframe (optional, e.g., "1h", "4h")' },
          strategy: { type: 'string', description: 'Filter by strategy (optional, e.g., "SMC", "trendline")' },
          date_filter: { 
            type: 'string', 
            enum: ['today', 'this_week', 'this_month'],
            description: 'Filter by date period. Use "today" for today\'s trades, "this_week" for last 7 days, "this_month" for current month. DO NOT use start_date or end_date.'
          }
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
      content: `You are a friendly and helpful Forex Trading Assistant. Your personality is conversational, professional, and supportive.

CRITICAL RULE: NEVER use the word "(optional)" when asking for trade details. All fields should be presented equally without labels.

MEMORY & CONTEXT:
- You have access to the FULL conversation history - ALL previous messages are available to you
- Every trade saved includes a timestamp (date and time)
- You can answer questions about past trades, dates, and time periods
- When user asks "how many trades yesterday?", "what trades did I take today?", "last week's performance", etc., you should call get_trade_insights tool
- Remember ALL previous conversations - if user saved trades 2 days ago, you should remember them

CONVERSATION FLOW:

1. GREETING: When user says "hi", "hello", or starts chatting, introduce yourself:
   "Hello! I'm your Forex Trading Assistant. I help you track your trades, analyze performance, and manage risk. How can I assist you today?"

2. SAVING A NEW TRADE:
   - When user says "i take new trade", "save trade", "new trade", or similar → Guide them through saving a trade
   - Ask for details systematically (NEVER mention "optional" for any field):
     "Great! Let's save your new trade. I'll need a few details:
     • Entry price?
     • Lot size?
     • Current balance?
     • Trade type (BUY or SELL)?
     • Take profit?
     • Stop loss?
     • Timeframe?
     • Trade style (swing, day trade, or scalp)?
     • Strategy?"
   - REQUIRED fields: entry_price, lot_size, balance, trade_type
   - IMPORTANT fields (should be provided): take_profit, stop_loss
   - ALSO NEEDED fields: timeframe, trade_style, strategy
   - If user provides some details but misses REQUIRED ones, ask for ONLY the missing required fields one by one
   - If user provides all REQUIRED fields but misses IMPORTANT ones (take_profit, stop_loss), ask: "I need your take profit and stop loss prices to complete the trade setup."
   - If user provides all REQUIRED and IMPORTANT fields but misses ALSO NEEDED ones (trade_style, strategy, timeframe), ask: "I have all the essential details. Please provide your trade style (swing, day trade, or scalp), strategy, and timeframe to complete the trade information."
   - CRITICAL: DO NOT call save_trade tool if trade_style, strategy, or timeframe are missing. Ask for them first.
   - Only call save_trade tool when you have collected ALL details including trade_style, strategy, and timeframe
   - After saving successfully, ALWAYS ask: "Trade saved! Was this trade a WIN or LOSS?"

3. LOGGING TRADE RESULT:
   - When user says "win", "loss", "it was a win", "it was a loss", or answers your question about trade outcome
   - Extract trade_id from context (the most recently saved trade)
   - Call log_trade_result tool
   - Show the result naturally: "Trade logged as [WIN/LOSS]. Profit/Loss: $X. New balance: $Y"

4. GETTING INSIGHTS:
   - When user asks "insights", "show me insights", "how am I doing", "my performance", "statistics", "analytics"
   - When user asks about specific time periods: "how many trades yesterday?", "today's trades", "last week", "this month", "how many wins today?", etc.
   - Call get_trade_insights tool
   - Display the results in a natural, conversational way with explanations
   - If user asks about a specific date/time period, mention it in your response (e.g., "Based on your trades today...", "Looking at yesterday's trades...")

5. RISK ALERTS & SUGGESTIONS:
   - When user asks "suggestions", "future plan", "what should I do", "advice", "recommendations", "alerts"
   - Call check_risk_alerts tool
   - Display alerts in a natural way with actionable advice

6. NON-TRADING QUERIES:
   - Politely redirect: "I'm your Forex Trading Assistant focused on trading. I can help you save trades, log results, get insights, or check risk alerts. How can I help with your trading today?"

IMPORTANT RULES:
- Be conversational and friendly, not robotic
- Ask for one thing at a time when collecting trade details
- After saving a trade, ALWAYS ask about the outcome (WIN/LOSS)
- Display tool results in natural language, not raw data
- Remember context - if user just saved trade #5, and says "it was a loss", they mean trade #5
- Remember ALL previous conversations - you have full chat history available
- When user asks about dates/times, use get_trade_insights to get the relevant data`
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
      const errorCode = groqError?.error?.code || groqError?.code;
      const errorMessage = groqError?.error?.message || groqError?.message || '';
      
      // Handle rate limiting
      if (errorCode === 'rate_limit_exceeded' || errorMessage.includes('Rate limit') || errorMessage.includes('rate_limit')) {
        const waitTime = errorMessage.match(/try again in ([\d.]+)s/)?.[1] || '10';
        return `⏳ Rate limit reached. Please wait ${waitTime} seconds and try again.\n\n💡 You can also:\n- Use the "Save Trade" form instead of chat\n- Upgrade your Groq plan for higher limits\n- Try again in a few moments`;
      }
      
      // Handle function calling errors
      if (errorCode === 'tool_use_failed' || errorMessage.includes('Failed to call a function')) {
        // If function calling failed, try to understand user intent without tools
        const userIntent = userMessage.toLowerCase();
        
        // Check if it's a trading-related query
        if (userIntent.includes('timeframe') || userIntent.includes('strategy') || 
            userIntent.includes('win rate') || userIntent.includes('insight') ||
            userIntent.includes('trade') || userIntent.includes('save') ||
            userIntent.includes('log') || userIntent.includes('risk')) {
          // Retry without function calling, let LLM respond naturally
          try {
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
          } catch (fallbackError) {
            return `I understand you want to ${userIntent.includes('save') ? 'save a trade' : userIntent.includes('log') ? 'log a trade result' : 'get insights'}. Please use the form buttons at the top, or try rephrasing your request with all details.`;
          }
        } else {
          // Non-trading query, respond naturally
          return "I'm your Forex Trading Assistant focused on trading. I can help you save trades, log results, get insights, and check risk alerts. How can I help with your trading today?";
        }
      }
      
      // Generic error handling
      console.error('Groq API error:', groqError);
      throw new Error(errorMessage || 'Failed to process message. Please try again.');
    }

    const message = response.choices[0].message;

    // If no tool calls and there's content, return it (LLM responded directly)
    if (!message.tool_calls && message.content) {
      return message.content;
    }

    // Check if LLM wants to call a tool
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Execute tool calls
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
            const missingRequired = [];
            const missingImportant = [];
            
            if (!toolArgs.entry_price && toolArgs.entry_price !== 0) missingRequired.push('entry price');
            if (!toolArgs.lot_size && toolArgs.lot_size !== 0) missingRequired.push('lot size');
            if (!toolArgs.balance && toolArgs.balance !== 0) missingRequired.push('balance');
            if (!toolArgs.trade_type) missingRequired.push('trade type (BUY or SELL)');
            
            // Check important fields (take_profit, stop_loss) - should be provided
            if (!toolArgs.take_profit && toolArgs.take_profit !== 0) missingImportant.push('take profit');
            if (!toolArgs.stop_loss && toolArgs.stop_loss !== 0) missingImportant.push('stop loss');

            // If missing required fields, ask for them
            if (missingRequired.length > 0) {
              if (missingRequired.length === 1) {
                return `I need one more detail to save your trade:\n\nPlease provide the ${missingRequired[0]}.`;
              } else {
                return `I need a few more details to save your trade:\n\n${missingRequired.map(f => `• ${f}`).join('\n')}\n\nPlease provide these details.`;
              }
            }
            
            // If missing important fields, ask for them
            if (missingImportant.length > 0) {
              return `I need your ${missingImportant.join(' and ')} ${missingImportant.length > 1 ? 'prices' : 'price'} to complete the trade setup.`;
            }
            
            // If missing optional fields (trade_style, strategy, timeframe), ask once before saving
            const missingOptional = [];
            // Check for empty strings, null, undefined, or whitespace-only strings
            if (!toolArgs.trade_style || (typeof toolArgs.trade_style === 'string' && toolArgs.trade_style.trim() === '')) {
              missingOptional.push('trade style (swing, day trade, or scalp)');
            }
            if (!toolArgs.strategy || (typeof toolArgs.strategy === 'string' && toolArgs.strategy.trim() === '')) {
              missingOptional.push('strategy');
            }
            if (!toolArgs.timeframe || (typeof toolArgs.timeframe === 'string' && toolArgs.timeframe.trim() === '')) {
              missingOptional.push('timeframe');
            }
            
            if (missingOptional.length > 0) {
              return `I have all the essential details. Please provide your ${missingOptional.join(', ')} to complete the trade information.`;
            }

            // Ensure trade_type is uppercase
            if (toolArgs.trade_type) {
              toolArgs.trade_type = toolArgs.trade_type.toUpperCase();
            }
            
            // Normalize trade_style to lowercase (enum expects: "swing", "day trade", "scalp")
            if (toolArgs.trade_style) {
              const style = String(toolArgs.trade_style).toLowerCase().trim();
              if (style === 'scalp' || style.includes('scalp')) {
                toolArgs.trade_style = 'scalp';
              } else if (style.includes('day') || style === 'day trade' || style === 'daytrade') {
                toolArgs.trade_style = 'day trade';
              } else if (style === 'swing' || style.includes('swing')) {
                toolArgs.trade_style = 'swing';
              } else {
                // Default to scalp if unclear
                toolArgs.trade_style = 'scalp';
              }
            }

            // Automatically inject user_id - LLM doesn't need to provide it
            if (!userId) {
              return `❌ Error: User session not found. Please log in again.`;
            }
            
            // Add user_id to toolArgs (LLM doesn't know about this requirement)
            const tradeDataWithUserId = {
              ...toolArgs,
              user_id: userId
            };
            
            console.log('Calling saveTrade with:', tradeDataWithUserId); // Debug
            toolResult = await saveTrade(tradeDataWithUserId, userId);
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

            // After saving trade, ask about outcome
            return `✅ Trade #${tradeId} saved successfully!\n\n` +
                   `📊 Trade Details:\n` +
                   `Entry: ${entryPrice}\n` +
                   `Take Profit: ${takeProfit || 'Not set'}\n` +
                   `Stop Loss: ${stopLoss || 'Not set'}\n` +
                   `Lot Size: ${lotSize}\n` +
                   `Type: ${tradeType}\n` +
                   (riskReward ? `Risk:Reward: ${riskReward}\n` : '') +
                   `\n💬 Was this trade a WIN or LOSS?`;

          case 'log_trade_result':
            if (!toolArgs.trade_id || !toolArgs.result) {
              return 'I need the trade ID and result (WIN or LOSS) to log this trade.';
            }
            if (!userId) {
              return `❌ Error: User session not found. Please log in again.`;
            }
            
            // user_id is automatically passed to logTradeResult function
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
            
            // Clean toolArgs - remove any invalid parameters that LLM might have added
            const cleanArgs = { ...toolArgs };
            delete cleanArgs.start_date;  // Not supported by server
            delete cleanArgs.end_date;    // Not supported by server
            if (dateFilter) {
              cleanArgs.date_filter = dateFilter;
            }
            
            console.log('📊 Calling getTradeInsights with cleaned args:', cleanArgs);
            toolResult = await getTradeInsights(cleanArgs, userId);
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
              return `✅ Great news! No risk alerts detected. Your trading patterns look healthy. Keep up the good work! 💪`;
            }
            
            let alertMessage = `🚨 I've analyzed your trading patterns and found ${toolResult.total_alerts} risk alert${toolResult.total_alerts > 1 ? 's' : ''}:\n\n`;
            
            // Group by risk level
            const critical = toolResult.alerts.filter(a => a.risk_level === 'CRITICAL');
            const high = toolResult.alerts.filter(a => a.risk_level === 'HIGH');
            const medium = toolResult.alerts.filter(a => a.risk_level === 'MEDIUM');
            const low = toolResult.alerts.filter(a => a.risk_level === 'LOW');
            
            if (critical.length > 0) {
              alertMessage += `🔴 **CRITICAL ALERTS:**\n`;
              critical.forEach((alert, idx) => {
                alertMessage += `${idx + 1}. ${alert.message}\n`;
                if (alert.recommendation) {
                  alertMessage += `   💡 Recommendation: ${alert.recommendation}\n`;
                }
                alertMessage += '\n';
              });
            }
            
            if (high.length > 0) {
              alertMessage += `🟠 **HIGH PRIORITY:**\n`;
              high.slice(0, 3).forEach((alert, idx) => {
                alertMessage += `${idx + 1}. ${alert.message}\n`;
                if (alert.recommendation) {
                  alertMessage += `   💡 ${alert.recommendation}\n`;
                }
                alertMessage += '\n';
              });
            }
            
            if (medium.length > 0 && (critical.length + high.length) < 3) {
              alertMessage += `🟡 **MEDIUM PRIORITY:**\n`;
              medium.slice(0, 2).forEach((alert, idx) => {
                alertMessage += `${idx + 1}. ${alert.message}\n`;
                if (alert.recommendation) {
                  alertMessage += `   💡 ${alert.recommendation}\n`;
                }
                alertMessage += '\n';
              });
            }
            
            alertMessage += `\n💬 Would you like me to help you address any of these alerts?`;
            
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

