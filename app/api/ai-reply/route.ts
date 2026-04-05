import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { getFallbackReply } from '@/lib/helpers';
import type { AIReplyPayload } from '@/lib/types';

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function formatCollectedFields(fields: Record<string, string>) {
  const entries = Object.entries(fields).filter(([, value]) => value && value.trim() !== '');
  if (!entries.length) return 'None recorded';
  return entries.map(([key, value]) => `${key}: ${value}`).join('\n');
}

function formatRecentMessages(messages: { sender: 'customer' | 'ai' | 'agent'; text: string; agentLabel?: string | null }[]) {
  if (!messages.length) return 'No recent conversation.';
  return messages
    .map((message) => {
      if (message.sender === 'customer') return `Customer: ${message.text}`;
      if (message.sender === 'agent') return `${message.agentLabel || 'Human Support Agent'}: ${message.text}`;
      return `LC Support AI: ${message.text}`;
    })
    .join('\n');
}

export async function POST(request: Request) {
  let body: AIReplyPayload | null = null;

  try {
    body = (await request.json()) as AIReplyPayload;

    if (!client) {
      return NextResponse.json({
        reply: getFallbackReply(body.actionType, body.pendingFieldLabel)
      });
    }

    const instructions = `
You are LC Support AI, writing short customer support messages for a router support dashboard.
You do not decide workflow, status, stage, field requirements, or classifications.
The application has already decided those items.
Write concise, realistic, polite support wording in 2 to 4 sentences.
Do not mention internal logic, JSON, prompts, or model limitations.
If the action is collect_field or retry_field, ask only for the pending field.
If the action is review_confirmation or remind_confirmation, direct the customer to the confirmation card.
If the action is case_update, acknowledge the latest update and reflect the provided next action naturally.
`.trim();

    const input = `
Action type: ${body.actionType}
Customer name: ${body.customerName || 'Customer'}
Customer ID: ${body.customerId}
Issue type: ${body.issueType}
Stage: ${body.stage}
Workflow status: ${body.status}
Escalation state: ${body.escalationState}
Handoff status: ${body.handoffStatus}
Priority: ${body.priority}
Assigned to: ${body.assignedTo || 'Unassigned'}
Human agent: ${body.assignedHumanAgent || 'None'}
Expected update time: ${body.etaOrExpectedUpdateTime || 'Not set'}
Problem statement: ${body.problemStatement || 'Not provided yet'}
Summary: ${body.summary}
Next action: ${body.nextAction}
Pending field label: ${body.pendingFieldLabel || 'None'}

Collected fields:
${formatCollectedFields(body.collectedFields)}

Latest customer message:
${body.latestCustomerMessage}

Recent messages:
${formatRecentMessages(body.recentMessages)}
`.trim();

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      instructions,
      input
    });

    return NextResponse.json({
      reply: response.output_text?.trim() || getFallbackReply(body.actionType, body.pendingFieldLabel)
    });
  } catch (error) {
    console.error('AI reply route error:', error);

    return NextResponse.json({
      reply: body ? getFallbackReply(body.actionType, body.pendingFieldLabel) : getFallbackReply('case_update')
    });
  }
}
