import { NextResponse } from 'next/server';
import { requireCustomerAuthContext, resolveAuthorizedCustomerId, resolveRequestAuthContext } from '@/lib/auth';
import { classifyCustomerRouteError, createCustomerRouteExecutionResolver } from '@/lib/customerRouteExecution';
import { getClientVisibleErrorDetail } from '@/lib/security';
import { toCustomerVisibleFile } from '@/lib/serializers';
import type { ContactMethod, CustomerVisibleFile } from '@/lib/types';

const customerRouteExecutionResolver = createCustomerRouteExecutionResolver();

export async function POST(request: Request) {
  try {
    const authContext = requireCustomerAuthContext(resolveRequestAuthContext(request));
    const body = (await request.json()) as {
      customerId?: string;
      caseId?: string;
      preferredContactMethod?: ContactMethod;
      callbackTimeWindow?: string;
      urgencyReason?: string;
      additionalDetails?: string;
    };
    resolveAuthorizedCustomerId(authContext, body.customerId);

    if (!body.caseId) {
      return NextResponse.json({ error: 'Select a case before requesting human support.' }, { status: 400 });
    }

    if (!body.preferredContactMethod || !body.callbackTimeWindow || !body.urgencyReason) {
      return NextResponse.json(
        {
          error:
            'Please choose a contact method, a callback window, and a short reason for requesting human support.'
        },
        { status: 400 }
      );
    }

    const { service } = await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
      request,
      authContext
    );

    const result = await service.submitHandoffRequest({
      caseId: body.caseId,
      handoff: {
        preferredContactMethod: body.preferredContactMethod,
        callbackTimeWindow: body.callbackTimeWindow,
        urgencyReason: body.urgencyReason,
        additionalDetails: body.additionalDetails ?? ''
      },
      authContext
    });

    return NextResponse.json({
      ...result,
      file: toCustomerVisibleFile(result.file)
    } satisfies { file: CustomerVisibleFile; existed: boolean });
  } catch (error) {
    console.error('handoff route error:', error);
    const classified = classifyCustomerRouteError(error, {
      defaultMessage: 'Unable to submit the human support request right now.',
      schemaMessage:
        'Your Supabase schema is missing the human handoff fields required by this page. Run the latest support workspace migrations, including 0005_handoff_support_upgrade.sql.'
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
