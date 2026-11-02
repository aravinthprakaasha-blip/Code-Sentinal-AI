/**
 * @file src/components/AssistantView.tsx
 * Conversational AI Code Review Assistant grounded on active scan results.
 */

import React, { useState } from 'react';
import { MessageSquareCode, Send, Sparkles, User, Bot } from 'lucide-react';
import { ScanResult, ChatMessage } from '../types';
import { askAssistantQuestion } from '../services/geminiService';

interface AssistantViewProps {
  currentScan: ScanResult | null;
}

export const AssistantView: React.FC<AssistantViewProps> = ({ currentScan }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: currentScan
        ? `Hello! I have loaded the scan results for **${currentScan.repo_name}**. I can explain specific findings, compute risk factors, or break down the ML prediction. What would you like to explore?`
        : 'Welcome! Scan a repository to enable grounded security inquiries and conversational code reviews.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const suggestedQuestions = [
    'Which file is riskiest?',
    'How many security vulnerabilities were found?',
    'Explain the Code Quality formula',
    'How is the rule-based risk score calculated?',
  ];

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      if (!currentScan) {
        setMessages(prev => [
          ...prev,
          {
            id: `msg-${Date.now()}-bot`,
            role: 'assistant',
            content: 'Please run or load a scan from the Scanner or Overview tab first so I have repository metrics to answer your questions accurately.',
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        return;
      }

      const reply = await askAssistantQuestion(query, currentScan);
      setMessages(prev => [
        ...prev,
        {
          id: `msg-${Date.now()}-bot`,
          role: 'assistant',
          content: reply,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `msg-${Date.now()}-bot`,
          role: 'assistant',
          content: `Unable to process question: ${err?.message || 'Unknown error'}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col justify-between space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
          <MessageSquareCode className="w-5 h-5 text-cyan-400" />
          <span>AI Review Assistant</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Ask questions grounded in this scan. Gemini responses are generated on the secure backend when configured.
        </p>
      </div>

      {/* Suggested Chips */}
      {currentScan && (
        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              onClick={() => handleSend(q)}
              disabled={isSending}
              className="text-xs px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-cyan-700/60 transition-all cursor-pointer disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-inner">
        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div key={m.id} className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isUser
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'bg-cyan-950 border border-cyan-800 text-cyan-400'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
                    : 'bg-slate-950 border border-slate-800 text-slate-200'
                }`}
              >
                <div className="prose prose-invert prose-xs max-w-none whitespace-pre-line">
                  {m.content}
                </div>
                <div className={`text-[9px] mt-1 text-right ${isUser ? 'text-blue-100' : 'text-slate-500'}`}>
                  {m.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-center space-x-2 text-xs text-slate-400 italic pl-11">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            <span>Analyzing repository context...</span>
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={currentScan ? 'Ask a question about this repository...' : 'Scan a repository first to ask questions...'}
          disabled={isSending || !currentScan}
          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <button
          onClick={() => handleSend()}
          disabled={isSending || !input.trim() || !currentScan}
          className="p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white disabled:opacity-50 shadow-md shadow-cyan-600/20 cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
