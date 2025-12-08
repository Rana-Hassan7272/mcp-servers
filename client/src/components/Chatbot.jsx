import { useState, useRef, useEffect } from 'react'
import { processUserMessage } from '../services/groqClient'
import './Chatbot.css'

const CHAT_HISTORY_KEY = 'forex_chat_history'

function Chatbot({ userId }) {
  // Load chat history from localStorage on mount
  const loadChatHistory = () => {
    try {
      const saved = localStorage.getItem(`${CHAT_HISTORY_KEY}_${userId || 'default'}`)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
    }
    // Default welcome message
    return [
      {
        role: 'assistant',
        content: 'Hello! I\'m your Forex Trading Assistant. I can help you:\n\n' +
                 '• Save trades (e.g., "Save trade: entry 2000, TP 2010, SL 1990, lot 0.1, balance 1000, BUY")\n' +
                 '• Log results (e.g., "Trade #5 was a win")\n' +
                 '• Get insights (e.g., "Show me my win rate")\n' +
                 '• Check risk alerts (e.g., "Check my risk alerts")\n\n' +
                 'How can I help you today?'
      }
    ]
  }

  // Initialize with greeting if no history exists
  const initialMessages = loadChatHistory()
  const hasHistory = initialMessages.length > 1 || (initialMessages.length === 1 && initialMessages[0].content.length > 200)
  
  const [messages, setMessages] = useState(hasHistory ? initialMessages : [
    {
      role: 'assistant',
      content: 'Hello! I\'m your Forex Trading Assistant. I help you track your trades, analyze performance, and manage risk.\n\nI can:\n• Save and log your trades\n• Provide insights and analytics\n• Check for risk alerts\n\nHow can I assist you today?'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  // Save chat history to localStorage whenever messages change
  useEffect(() => {
    try {
      localStorage.setItem(`${CHAT_HISTORY_KEY}_${userId || 'default'}`, JSON.stringify(messages))
    } catch (error) {
      console.error('Error saving chat history:', error)
    }
  }, [messages, userId])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    
    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // Build conversation history - use ALL messages for full context
      // This ensures the LLM remembers all previous conversations
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // Process message with Groq LLM
      const response = await processUserMessage(userMessage, conversationHistory, userId)
      
      // Add assistant response
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (error) {
      console.error('Chatbot error:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `❌ Sorry, I encountered an error: ${error.message}\n\n` +
                 `Make sure your Groq API key is set in the .env file (VITE_GROQ_API_KEY).`
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chatbot-container">
      <div className="chatbot-header">
        <h3>💬 Trading Assistant Chat</h3>
        <p>Ask me anything about your trades</p>
      </div>
      
      <div className="chatbot-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-content">
              <span className="typing-indicator">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chatbot-input-form" onSubmit={handleSend}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
          className="chatbot-input"
        />
        <button type="submit" disabled={loading || !input.trim()} className="chatbot-send-btn">
          Send
        </button>
      </form>
    </div>
  )
}

export default Chatbot

