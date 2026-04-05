import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConversationPanel } from '../components/chat/ConversationPanel';
import { createMessage } from '../lib/helpers';

describe('ConversationPanel sender rendering', () => {
  it('renders customer, AI, and human agent labels distinctly', () => {
    const html = renderToStaticMarkup(
      createElement(ConversationPanel, {
        messages: [
          createMessage('customer', 'My router is still down.'),
          createMessage('ai', 'I have logged the latest update.'),
          createMessage('agent', 'I am taking over this case now.', 'Alex Chen')
        ],
        input: '',
        isReplying: false,
        onInputChange: () => undefined,
        onSend: () => undefined,
        onDemoMessage: () => undefined
      })
    );

    expect(html).toContain('Customer');
    expect(html).toContain('LC Support AI');
    expect(html).toContain('Alex Chen');
    expect(html).not.toContain('>Human Support Agent<');
  });
});
