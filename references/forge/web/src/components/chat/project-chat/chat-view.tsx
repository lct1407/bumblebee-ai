'use client';

import { ChevronLeft, X } from 'lucide-react';
import { ChatInput } from '../chat-input';
import { ChatMessages } from '../chat-messages';
import type { ChatMessageData } from '../chat-message';

interface ChatViewProps {
  messages: ChatMessageData[];
  sessionTitle: string;
  sending: boolean;
  onSend: (text: string, files: File[]) => void;
  onBack: () => void;
  onClose: () => void;
}

export function ChatView({ messages, sessionTitle, sending, onSend, onBack, onClose }: ChatViewProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="shrink-0 p-2.5 text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-sm font-semibold truncate">{sessionTitle}</h3>
        </div>
        <button onClick={onClose} className="shrink-0 p-2.5 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <ChatMessages messages={messages} />

      {/* Input */}
      <ChatInput onSend={onSend} disabled={sending} />
    </div>
  );
}
