import { NextResponse } from 'next/server';
import { requireAgentAuthContext, resolveRequestAuthContext } from '@/lib/auth';
import { classifyAdminRouteExecutionError, createAdminRouteExecutionResolver } from '@/lib/adminRouteExecution';
import { listAuditLogsForCase } from '@/lib/auditStorageSupabase';
import { formatAdminAuditTimelineEvent } from '@/lib/auditViewer';
import { getClientVisibleErrorDetail } from '@/lib/security';

const adminRouteExecutionResolver = createAdminRouteExecutionResolver();

export async function GET(request: Request) {
  try {
    const authContext = requireAgentAuthContext(resolveRequestAuthContext(request));
    const caseId = new URL(request.url).searchParams.get('caseId')?.trim();

    if (!caseId) {
      return NextResponse.json({ error: 'Choose a case before opening its audit history.' }, { status: 400 });
    }

    const execution = await adminRouteExecutionResolver.resolveRequestAdminRouteExecutionContext(request, authContext);
    const auditLogs = await listAuditLogsForCase(caseId, execution.userScopedContext.supabase);

    return NextResponse.json({
      caseId,
      events: auditLogs.map(formatAdminAuditTimelineEvent)
    });
  } catch (error) {
    console.error('admin-support audit route error:', error);
    const classified = classifyAdminRouteExecutionError(error, {
      defaultMessage: 'We could not load the audit history for this case right now.',
      schemaMessage:
        'Your Supabase schema is missing the audit log table required by the admin audit viewer. Run 0008_audit_log_foundation.sql and try again.'
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
