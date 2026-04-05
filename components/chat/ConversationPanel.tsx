'use client';

import Link from 'next/link';
import { formatTime } from '@/lib/helpers';
import type { Message } from '@/lib/types';

type ConversationPanelProps = {
  messages: Message[];
  input: string;
  isReplying: boolean;
  isReadonly?: boolean;
  humanSupportHref?: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onDemoMessage: (value: string) => void;
};

export function ConversationPanel({
  messages,
  input,
  isReplying,
  isReadonly = false,
  humanSupportHref,
  onInputChange,
  onSend,
  onDemoMessage
}: ConversationPanelProps) {
  return (
    <>
      <section className="panel conversation-panel">
        <div className="panel-heading">
          <p className="eyebrow">AI Conversation Panel</p>
          <h2>Keep the customer conversation tied to the active support case.</h2>
        </div>

        <div className="message-stack">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message-bubble ${
                message.sender === 'customer'
                  ? 'message-customer'
                  : message.sender === 'agent'
                    ? 'message-agent'
                    : 'message-ai'
              }`}
            >
              <div className="message-meta">
                <strong>
                  {message.sender === 'customer'
                    ? 'Customer'
                    : message.sender === 'agent'
                      ? message.agentLabel || 'Human Support Agent'
                      : 'LC Support AI'}
                </strong>
                <span>{formatTime(message.createdAt)}</span>
              </div>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <p className="eyebrow">Reply Composer</p>
          <h2>Send the next customer update into the deterministic support workflow.</h2>
          <p className="muted-copy">Use the quick prompts for demos, or write the customer&apos;s next message manually.</p>
        </div>

        <textarea
          rows={5}
          value={input}
          disabled={isReadonly}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={isReadonly ? 'This case is closed or historical. Open the active case to continue the conversation.' : 'Type the customer\'s next message here...'}
        />

        <div className="button-row">
          <button className="primary-button" onClick={onSend} disabled={isReplying || isReadonly}>
            {isReplying ? 'Generating Reply...' : 'Send Message'}
          </button>
          <button
            className="secondary-button"
            disabled={isReadonly}
            onClick={() => onDemoMessage('Hi, my router still has not been activated.')}
          >
            Demo: Activation
          </button>
          <button
            className="secondary-button"
            disabled={isReadonly}
            onClick={() => onDemoMessage('Hello, my router has a red light and the internet is down.')}
          >
            Demo: Repair
          </button>
          <button
            className="secondary-button"
            disabled={isReadonly}
            onClick={() => onDemoMessage('I am still waiting and nobody has replied to my case.')}
          >
            Demo: Follow-up
          </button>
          <button className="secondary-button" disabled={isReadonly} onClick={() => onDemoMessage('Hi')}>
            Demo: Greeting
          </button>
          {humanSupportHref && (
            <Link href={humanSupportHref} className="secondary-button">
              Talk to a Human
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
