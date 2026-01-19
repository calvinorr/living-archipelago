'use client';

import { useState, useRef, useEffect } from 'react';
import { useAnalyst } from '@/hooks/useAnalyst';

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
    'How can I improve population growth?',
  ];

  return (
    <div className="bg-card border rounded-lg p-4 flex flex-col h-[350px]">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Chat with Analyst
      </h3>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3">
        {chatMessages.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            {selectedRunId ? (
              <>
                <p className="mb-3">Ask questions about the simulation data</p>
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
            <div
              key={msg.id}
              className={`p-3 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-8'
                  : 'bg-muted/50 mr-8'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              <div
                className={`text-xs mt-1 ${
                  msg.role === 'user'
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                }`}
              >
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
        {isChatting && (
          <div className="bg-muted/50 p-3 rounded-lg text-sm mr-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
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
