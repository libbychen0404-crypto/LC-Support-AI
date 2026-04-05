import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { buildSummary } from '@/lib/caseLogic';
import { getFallbackReply } from '@/lib/helpers';
import type { AICaseInsights, AICaseInsightsPayload, CustomerProfile } from '@/lib/types';

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

function getFallbackInsights(payload: AICaseInsightsPayload): AICaseInsights {
  const profile: CustomerProfile = {
    customerId: payload.customerId,
    name: payload.customerName,
    phone: '',
    email: '',
    lastSeenAt: new Date().toISOString()
  };

  return {
    summary: buildSummary(profile, {
      caseId: 'fallback',
      issueType: payload.issueType === 'Router Activation' || payload.issueType === 'Router Repair' ? payload.issueType : null,
      status: payload.status,
      stage: payload.stage,
      escalationState: payload.escalationState,
      handoffStatus: payload.handoffStatus,
      assignedHumanAgent: payload.assignedHumanAgent,
      handoffRequestedAt: null,
      handoffContactMethod: null,
      handoffCallbackWindow: '',
      handoffUrgencyReason: '',
      handoffAdditionalDetails: '',
      priority: payload.priority,
      assignedTo: payload.assignedTo,
      etaOrExpectedUpdateTime: payload.etaOrExpectedUpdateTime,
      internalNote: payload.internalNote,
      resolutionNote: payload.resolutionNote,
      caseNote: '',
      customerUpdate: '',
      problemStatement: payload.problemStatement,
      summary: payload.summary,
      nextAction: payload.nextAction,
      confirmed: true,
      requiredFields: [],
      pendingField: null,
      collectedFields: payload.collectedFields,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      timeline: [],
      isOpen: payload.status !== 'Closed'
    }),
    caseNote: payload.internalNote || `Case note: ${payload.problemStatement || payload.summary}`.trim(),
    customerUpdate:
      payload.handoffStatus !== 'Not Requested'
        ? 'We have captured your case details for human support so you will not need to repeat everything.'
        : payload.status === 'Resolved' || payload.status === 'Closed'
          ? payload.resolutionNote || 'Your case has been completed.'
          : getFallbackReply('progress_update')
  };
}

export async function POST(request: Request) {
  let body: AICaseInsightsPayload | null = null;

  try {
    body = (await request.json()) as AICaseInsightsPayload;

    if (!client) {
      return NextResponse.json(getFallbackInsights(body));
    }

    const instructions = `
You are LC Support AI helping a router support platform sound polished and helpful.
You do not change workflow, escalation, handoff state, or business rules.
Return JSON with keys: summary, caseNote, customerUpdate.
- summary: one short customer-friendly case summary
- caseNote: one concise internal support note compressing the recent conversation
- customerUpdate: a short progress update the customer can read in the portal
Keep each field concise, customer-friendly, and operationally realistic.
`.trim();

    const input = `
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
Current summary: ${body.summary}
Next action: ${body.nextAction}
Resolution note: ${body.resolutionNote || 'None'}
Internal note: ${body.internalNote || 'None'}

Collected fields:
${formatCollectedFields(body.collectedFields)}

Recent messages:
${formatRecentMessages(body.recentMessages)}
`.trim();

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      instructions,
      input,
      text: {
        format: {
          type: 'json_schema',
          name: 'case_insights',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              caseNote: { type: 'string' },
              customerUpdate: { type: 'string' }
            },
            required: ['summary', 'caseNote', 'customerUpdate']
          }
        }
      }
    });

    const outputText = response.output_text?.trim();
    if (!outputText) {
      return NextResponse.json(getFallbackInsights(body));
    }

    return NextResponse.json(JSON.parse(outputText) as AICaseInsights);
  } catch (error) {
    console.error('AI case insights route error:', error);
    return NextResponse.json(body ? getFallbackInsights(body) : { summary: '', caseNote: '', customerUpdate: '' });
  }
}
