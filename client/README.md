# Forex Trading Assistant - React Client

React frontend for the Forex Trading Assistant application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file in `client/` directory:
```
VITE_MCP_SERVER_URL=https://forex-trade-assistant.fastmcp.app/mcp
VITE_GROQ_API_KEY=your_groq_api_key_here
```

3. Run development server:
```bash
npm run dev
```

## Project Structure

```
client/
├── src/
│   ├── services/
│   │   ├── mcpClient.js      # MCP server communication
│   │   └── groqClient.js     # Groq LLM integration
│   ├── components/           # React components (to be added)
│   ├── App.jsx              # Main app component
│   ├── main.jsx             # Entry point
│   └── index.css            # Global styles
├── package.json
└── vite.config.js
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

