import { NextResponse } from 'next/server';
import { requireAgentAuthContext, resolveRequestAuthContext } from '@/lib/auth';
import { classifyAdminRouteExecutionError, createAdminRouteExecutionResolver } from '@/lib/adminRouteExecution';
import { getClientVisibleErrorDetail } from '@/lib/security';
import { ArchiveEligibilityError } from '@/lib/supportService';
import type { CasePriority, CaseStatus, EscalationState, HandoffStatus } from '@/lib/types';

const adminRouteExecutionResolver = createAdminRouteExecutionResolver();

function getAdminPostErrorMessages(action?: 'update' | 'take-over' | 'archive') {
  if (action === 'archive') {
    return {
      defaultMessage: 'We could not archive this case right now. Refresh the dashboard and try again.',
      schemaMessage:
        'Your Supabase schema is missing the archive foundation required by the admin archive workflow. Run 0010_archive_foundation.sql and try again.'
    };
  }

  return action === 'take-over'
    ? {
        defaultMessage: 'We could not assign this case to you right now. Refresh the dashboard and try again.',
        schemaMessage:
          'Your Supabase schema is missing the support operations columns required by the take-over workflow. Run the latest support workspace migrations, including 0004_support_ops_upgrade.sql and the handoff support upgrade.'
      }
    : {
        defaultMessage: 'We could not save this case update right now. Refresh the dashboard and try again.',
        schemaMessage:
          'Your Supabase schema is missing the support operations columns required by the admin panel. Run the latest support workspace migrations, including 0004_support_ops_upgrade.sql and the handoff support upgrade.'
      };
}

export async function GET(request: Request) {
  try {
    const authContext = requireAgentAuthContext(resolveRequestAuthContext(request));
    const { service } = await adminRouteExecutionResolver.resolveRequestAdminRouteExecutionContext(
      request,
      authContext
    );
    const dashboard = await service.loadAdminDashboard(authContext);
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error('admin-support route error:', error);
    const classified = classifyAdminRouteExecutionError(error, {
      defaultMessage: 'Unable to load the admin support dashboard right now.',
      schemaMessage:
        'Your Supabase schema is missing the support operations columns required by the admin panel. Run the latest support workspace migrations, including 0004_support_ops_upgrade.sql and the handoff support upgrade.'
    });

    return NextResponse.json(
      {
        error: classified.error,
        errorCode: classified.errorCode,
        ...(getClientVisibleErrorDetail(classified.detail)
          ? { detail: getClientVisibleErrorDetail(classified.detail) }
          : {})
      },
      { status: classified.status }
    );
  }
}

export async function POST(request: Request) {
  let action: 'update' | 'take-over' | 'archive' | undefined;

  try {
    const authContext = requireAgentAuthContext(resolveRequestAuthContext(request));
    const body = (await request.json()) as {
      customerId?: string;
      caseId?: string;
      status?: CaseStatus;
      assignedTo?: string | null;
      assignedHumanAgent?: string | null;
      priority?: CasePriority;
      etaOrExpectedUpdateTime?: string | null;
      internalNote?: string;
      resolutionNote?: string;
      customerUpdate?: string;
      caseNote?: string;
      escalationState?: EscalationState;
      handoffStatus?: HandoffStatus;
      action?: 'update' | 'take-over' | 'archive';
      agentName?: string;
    };
    action = body.action;

    if (!body.customerId || !body.caseId) {
      return NextResponse.json(
        { error: 'Choose a case before saving an admin update or taking ownership.' },
        { status: 400 }
      );
    }

    const { service } = await adminRouteExecutionResolver.resolveRequestAdminRouteExecutionContext(
      request,
      authContext
    );

    const result =
      body.action === 'take-over'
        ? await service.takeOverCase({
            customerId: body.customerId,
            caseId: body.caseId,
            agentName: body.agentName || body.assignedHumanAgent || 'Human Support Agent',
            authContext
          })
        : body.action === 'archive'
          ? await service.archiveCase({
              customerId: body.customerId,
              caseId: body.caseId,
              authContext
            })
        : await service.updateCaseOperations({
            customerId: body.customerId,
            caseId: body.caseId,
            status: body.status,
            assignedTo: body.assignedTo,
            assignedHumanAgent: body.assignedHumanAgent,
            priority: body.priority,
            etaOrExpectedUpdateTime: body.etaOrExpectedUpdateTime,
            internalNote: body.internalNote,
            resolutionNote: body.resolutionNote,
            customerUpdate: body.customerUpdate,
            caseNote: body.caseNote,
            escalationState: body.escalationState,
            handoffStatus: body.handoffStatus,
            authContext
          });

    return NextResponse.json(result);
  } catch (error) {
    console.error('admin-support update error:', error);

    if (error instanceof ArchiveEligibilityError) {
      return NextResponse.json(
        {
          error: error.message,
          errorCode: error.code
        },
        { status: 400 }
      );
    }

    const classified = classifyAdminRouteExecutionError(error, getAdminPostErrorMessages(action));

    return NextResponse.json(
      {
        error: classified.error,
        errorCode: classified.errorCode,
        ...(getClientVisibleErrorDetail(classified.detail)
          ? { detail: getClientVisibleErrorDetail(classified.detail) }
          : {})
      },
      { status: classified.status }
    );
  }
}
