/**
 * MCP Client Service
 * Handles all communication with the FastMCP server
 */

const MCP_SERVER_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://127.0.0.1:8000/mcp';

let requestId = 1;

/**
 * Make a JSON-RPC request to the MCP server
 */
async function mcpRequest(method, params = {}) {
  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId++,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  // Handle Server-Sent Events (SSE) response
  const text = await response.text();
  
  // Parse SSE format: event: message\ndata: {...}
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.substring(6));
        if (data.error) {
          const errorMsg = data.error.message || data.error.description || 'MCP server error';
          throw new Error(errorMsg);
        }
        // Extract result from content if it's structured
        if (data.result) {
          // Try to parse structured content first (preferred format)
          if (data.result.structuredContent) {
            return data.result.structuredContent;
          }
          // Otherwise parse text content if available
          if (data.result.content && Array.isArray(data.result.content) && data.result.content.length > 0) {
            const firstContent = data.result.content[0];
            if (firstContent && firstContent.text) {
              const textContent = firstContent.text;
              // Check if it's an error message
              if (typeof textContent === 'string' && (textContent.includes('Error') || textContent.includes('readonly') || textContent.includes('read-only'))) {
                throw new Error(textContent);
              }
              try {
                const parsed = JSON.parse(textContent);
                return parsed;
              } catch {
                // If not JSON, return as text
                return textContent;
              }
            }
            // If content exists but no text field, return the content array
            if (firstContent && typeof firstContent === 'object') {
              return firstContent;
            }
          }
          // If result is already an object with our expected fields, return it
          if (typeof data.result === 'object' && (data.result.trade_id || data.result.tradeId || data.result.alerts)) {
            return data.result;
          }
          // Return result as-is if no special parsing needed
          return data.result;
        }
        return data;
      } catch (parseError) {
        console.error('Error parsing SSE data:', parseError);
        throw new Error('Failed to parse MCP server response');
      }
    }
  }

  // Fallback: try parsing as direct JSON
  try {
    const data = JSON.parse(text);
    if (data.error) {
      throw new Error(data.error.message || 'MCP server error');
    }
    return data.result;
  } catch (e) {
    throw new Error('Failed to parse MCP server response: ' + e.message);
  }
}

/**
 * Get list of available tools
 */
export async function listTools() {
  return mcpRequest('tools/list', {});
}

/**
 * Call a specific tool
 */
export async function callTool(toolName, arguments_ = {}) {
  return mcpRequest('tools/call', {
    name: toolName,
    arguments: arguments_
  });
}

/**
 * Save a new trade
 */
export async function saveTrade(tradeData, userId) {
  const result = await callTool('save_trade', {
    user_id: userId,
    ...tradeData
  });
  // Result is already parsed by mcpRequest, return as-is
  return result;
}

/**
 * Log trade result
 */
export async function logTradeResult(tradeId, result, notes = null, userId) {
  const result_data = await callTool('log_trade_result', {
    user_id: userId,
    trade_id: tradeId,
    result,
    notes
  });
  // Result is already parsed by mcpRequest, return as-is
  return result_data;
}

/**
 * Get trade insights
 */
export async function getTradeInsights(filters = {}, userId) {
  const result = await callTool('get_trade_insights', {
    user_id: userId,
    ...filters
  });
  // Result is already parsed by mcpRequest, return as-is
  return result;
}

/**
 * Check risk alerts
 */
export async function checkRiskAlerts(options = {}, userId) {
  const result = await callTool('check_risk_alerts', {
    user_id: userId,
    ...options
  });
  // Result is already parsed by mcpRequest, return as-is
  return result;
}

export default {
  listTools,
  callTool,
  saveTrade,
  logTradeResult,
  getTradeInsights,
  checkRiskAlerts
};

