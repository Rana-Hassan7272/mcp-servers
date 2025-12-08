# Forex Trading Assistant

A comprehensive Forex trading assistant application that helps traders track trades, analyze performance, and manage risk using AI-powered insights.

## 🌟 Overview

This project consists of:
- **FastMCP Server**: Backend API providing trading tools (save trades, log results, get insights, check risk alerts)
- **React Frontend**: Web application with chatbot interface, trade forms, dashboard, and risk alerts
- **Groq LLM Integration**: Natural language processing for conversational trade management

### What It Does

- ✅ **Save Trades**: Record trade entries with entry price, take profit, stop loss, lot size, timeframe, strategy, etc.
- ✅ **Log Results**: Automatically calculate profit/loss when logging WIN/LOSS outcomes
- ✅ **Get Insights**: Comprehensive analytics including win rate, best timeframes, best strategies, risk:reward analysis
- ✅ **Risk Alerts**: Monitor trading patterns for consecutive losses, revenge trading, overtrading, drawdown, etc.
- ✅ **User Authentication**: Secure login/registration with password hashing
- ✅ **Chatbot Interface**: Natural language interaction using Groq LLM
- ✅ **Persistent Storage**: SQLite database for all trading data

---

## 🚀 FastMCP Server

### Production Server URL

**Live Server**: `https://forex-trade-assistant.fastmcp.app/mcp`

This is a publicly accessible MCP server that anyone can use to interact with the trading tools.

### How to Use the FastMCP Server

#### Option 1: Direct HTTP Requests (JSON-RPC 2.0)

You can call the server directly using HTTP POST requests:

```bash
curl -X POST https://forex-trade-assistant.fastmcp.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

#### Option 2: From Your Application

**JavaScript/TypeScript:**
```javascript
const response = await fetch('https://forex-trade-assistant.fastmcp.app/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'save_trade',
      arguments: {
        user_id: 'your_user_id',
        entry_price: 2000,
        lot_size: 0.01,
        balance: 1000,
        trade_type: 'BUY',
        take_profit: 2010,
        stop_loss: 1990,
        timeframe: '1h',
        trade_style: 'scalp',
        strategy: 'SMC'
      }
    }
  })
});
```

**Python:**
```python
import requests

response = requests.post(
    'https://forex-trade-assistant.fastmcp.app/mcp',
    headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
    },
    json={
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'tools/call',
        'params': {
            'name': 'get_trade_insights',
            'arguments': {
                'user_id': 'your_user_id'
            }
        }
    }
)
```

### Available Tools

1. **`save_trade`**: Save a new trade entry
   - Required: `user_id`, `entry_price`, `lot_size`, `balance`, `trade_type`
   - Optional: `take_profit`, `stop_loss`, `timeframe`, `trade_style`, `strategy`, `notes`

2. **`log_trade_result`**: Log trade outcome (WIN/LOSS)
   - Required: `user_id`, `trade_id`, `result` (WIN or LOSS)
   - Automatically calculates profit/loss based on saved trade details

3. **`get_trade_insights`**: Get comprehensive trading analytics
   - Required: `user_id`
   - Optional filters: `currency_pair`, `timeframe`, `strategy`, `date_filter` (today, this_week, this_month)
   - Returns: win rate, best timeframes, best strategies, risk:reward analysis, etc.

4. **`check_risk_alerts`**: Check for trading risk patterns
   - Required: `user_id`
   - Optional: `recent_trades_count`, `consecutive_loss_threshold`, etc.
   - Returns: List of risk alerts with recommendations

5. **`register_user`**: Register a new user account
   - Required: `username`, `password`

6. **`verify_user_login`**: Verify user login credentials
   - Required: `username`, `password`
   - Returns: `user_id` and `username` if valid

### Response Format

The server uses **JSON-RPC 2.0** over **Server-Sent Events (SSE)**:

```
event: message
data: {"jsonrpc":"2.0","id":1,"result":{"content":[...],"structuredContent":{...}}}
```

Parse the `data:` line to extract the JSON response.

---

## 📁 Project Structure

```
forex_trading_assistant/
├── server/                 # FastMCP backend server
│   ├── main.py            # Main server file with all tools
│   └── ...
├── database/              # Database initialization and schema
│   ├── init_db.py        # Database connection and initialization
│   ├── schema.sql        # SQL schema definitions
│   └── migrate_*.py      # Database migration scripts
├── client/                # React frontend application
│   ├── src/
│   │   ├── components/   # React components (Chatbot, Login, etc.)
│   │   ├── services/     # API clients (mcpClient, groqClient)
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
└── README.md             # This file
```

---

## 🛠️ Setup & Installation

### Prerequisites

- Python 3.10+
- Node.js 18+
- SQLite (included with Python)

### Backend Setup

1. **Install dependencies:**
```bash
pip install fastmcp aiosqlite python-dotenv
```

2. **Set environment variables:**
```bash
# .env file
DATABASE_PATH=/tmp/forex_trading.db  # or local path
```

3. **Run the server locally:**
```bash
python server/main.py --local
# Server runs on http://127.0.0.1:8000/mcp
```

4. **Deploy to FastMCP Cloud:**
   - Push code to GitHub
   - Connect repository to FastMCP Cloud
   - Server will be available at: `https://forex-trade-assistant.fastmcp.app/mcp`

### Frontend Setup

1. **Navigate to client directory:**
```bash
cd client
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set environment variables:**
```bash
# client/.env file
VITE_MCP_SERVER_URL=https://forex-trade-assistant.fastmcp.app/mcp
VITE_GROQ_API_KEY=your_groq_api_key_here
```

4. **Run development server:**
```bash
npm run dev
# App runs on http://localhost:5173
```

---

## 🔧 How the Client Works

### Architecture

1. **React Frontend** (`client/`)
   - User interface with tabs: Chatbot, Trade Form, Dashboard, Risk Alerts
   - Login/Registration system
   - Chat history persistence (localStorage)

2. **MCP Client** (`client/src/services/mcpClient.js`)
   - Handles HTTP communication with FastMCP server
   - JSON-RPC 2.0 protocol
   - Parses SSE responses

3. **Groq LLM Client** (`client/src/services/groqClient.js`)
   - Integrates Groq LLM for natural language understanding
   - Tool calling: LLM decides which tools to call based on user messages
   - Tool execution: Executes MCP tools and formats responses

4. **Flow:**
   ```
   User Message → Groq LLM → Tool Call Decision → MCP Client → FastMCP Server → Database
                                                                    ↓
   User sees response ← Groq formats result ← Tool Result ←────────┘
   ```

### Key Features

- **Conversational Interface**: Natural language interaction (e.g., "I take new trade, entry 2000...")
- **Intelligent Field Collection**: LLM asks for missing trade details systematically
- **Automatic Calculations**: Profit/loss calculated automatically from trade details
- **Date/Time Awareness**: LLM can answer questions about trades by date ("how many trades yesterday?")
- **Full Chat History**: All conversations persisted in localStorage per user

---

## 📊 Database Schema

- **`users`**: User accounts with password hashing
- **`trade_tracker`**: All trade entries with timestamps
- **`trade_results`**: Trade outcomes (WIN/LOSS) with calculated profit/loss
- **`risk_monitor`**: Risk alerts and patterns
- **`analytics`**: Precomputed analytics (optional)

All tables include `user_id` for data isolation.

---

## 🔐 Security

- **Password Hashing**: SHA-256 with salt
- **User Isolation**: All queries filtered by `user_id`
- **API Keys**: Stored in environment variables (never committed)

---

## 🌐 Deployment

### FastMCP Server (Backend)

1. Push code to GitHub
2. Connect to FastMCP Cloud
3. Server automatically deploys at: `https://forex-trade-assistant.fastmcp.app/mcp`

### React Frontend

Deploy to Vercel, Netlify, or any static hosting:

```bash
cd client
npm run build
# Deploy dist/ folder
```

Update `VITE_MCP_SERVER_URL` in production environment.

---

## 📝 API Examples

### Save a Trade

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "save_trade",
    "arguments": {
      "user_id": "john_doe",
      "entry_price": 2000,
      "lot_size": 0.01,
      "balance": 1000,
      "trade_type": "BUY",
      "take_profit": 2010,
      "stop_loss": 1990,
      "timeframe": "1h",
      "trade_style": "scalp",
      "strategy": "SMC"
    }
  }
}
```

### Get Trade Insights

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_trade_insights",
    "arguments": {
      "user_id": "john_doe",
      "date_filter": "today"
    }
  }
}
```

### Check Risk Alerts

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "check_risk_alerts",
    "arguments": {
      "user_id": "john_doe",
      "recent_trades_count": 10
    }
  }
}
```

---

## 🤝 Contributing

This is a personal project, but feel free to fork and adapt for your own use.

---

## 📄 License

This project is for personal/educational use.

---

## 🔗 Links

- **FastMCP Server**: https://forex-trade-assistant.fastmcp.app/mcp
- **FastMCP Documentation**: https://gofastmcp.com
- **Groq API**: https://console.groq.com

---

## 💡 Tips for Using the Server

1. **User ID Format**: User IDs are generated from usernames (lowercase, spaces → underscores)
   - Username: "John Doe" → user_id: "john_doe"

2. **Date Filters**: Use `date_filter: "today"`, `"this_week"`, or `"this_month"` in `get_trade_insights`

3. **Lot Size Calculation**: For XAU/USD, lot size determines profit per $1 move
   - 0.01 lot = $1 per $1 move
   - 0.1 lot = $10 per $1 move
   - Formula: `Profit = (Price Move) × (Lot Size × 100)`

4. **Error Handling**: Always check for `error` field in responses

5. **Rate Limiting**: Be mindful of API rate limits when making multiple requests

---

## 🐛 Troubleshooting

**Server not responding:**
- Check if server is running: `curl https://forex-trade-assistant.fastmcp.app/mcp`
- Verify JSON-RPC format is correct
- Check `Accept` header includes `text/event-stream`

**Database errors:**
- Ensure `DATABASE_PATH` is writable
- Check database file permissions
- Run migration scripts if needed

**Frontend issues:**
- Verify `VITE_MCP_SERVER_URL` is set correctly
- Check browser console for CORS errors
- Ensure Groq API key is valid

---

## 📞 Support

For issues or questions, check the code comments or review the FastMCP documentation.

