'use client';

import { useState, useRef, useEffect } from 'react';
import { useAnalyst } from '@/hooks/useAnalyst';

const MAX_COLLAPSED_LENGTH = 500;

function ChatMessage({ content, role, timestamp }: { content: string; role: 'user' | 'assistant'; timestamp: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = content.length > MAX_COLLAPSED_LENGTH;
  const displayContent = isLong && !isExpanded ? content.slice(0, MAX_COLLAPSED_LENGTH) + '...' : content;

  return (
    <div
      className={`p-3 rounded-lg text-sm ${
        role === 'user'
          ? 'bg-primary text-primary-foreground ml-4'
          : 'bg-muted/50 mr-4'
      }`}
    >
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {displayContent}
      </div>

      {isLong && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`mt-2 text-xs font-medium ${
            role === 'user'
              ? 'text-primary-foreground/70 hover:text-primary-foreground'
              : 'text-primary hover:text-primary/80'
          }`}
        >
          {isExpanded ? 'Show less' : `Show more (${content.length} chars)`}
        </button>
      )}

      <div
        className={`text-xs mt-2 ${
          role === 'user'
            ? 'text-primary-foreground/60'
            : 'text-muted-foreground'
        }`}
      >
        {new Date(timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

export function AnalystChat() {
  const { chatMessages, isChatting, selectedRunId, sendChatMessage } = useAnalyst();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isChatting) return;

    sendChatMessage(input.trim());
    setInput('');
  };

  const suggestedQuestions = [
    'Why are fish stocks depleting?',
    'Is trade profitable enough?',
    'How can I improve growth?',
  ];

  return (
    <div className="bg-card border rounded-lg p-4 flex flex-col h-full">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Chat with Analyst
      </h3>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 min-h-0">
        {chatMessages.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            {selectedRunId ? (
              <>
                <p className="mb-3">Ask questions about the simulation</p>
                <div className="space-y-1">
                  {suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(q)}
                      className="block w-full text-left text-xs p-2 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              'Select a run to start chatting'
            )}
          </div>
        ) : (
          chatMessages.map((msg) => (
            <ChatMessage
              key={msg.id}
              content={msg.content}
              role={msg.role}
              timestamp={msg.timestamp}
            />
          ))
        )}
        {isChatting && (
          <div className="bg-muted/50 p-3 rounded-lg text-sm mr-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 flex-shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={selectedRunId ? 'Ask a question...' : 'Select a run first'}
          disabled={!selectedRunId || isChatting}
          className="flex-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || !selectedRunId || isChatting}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
