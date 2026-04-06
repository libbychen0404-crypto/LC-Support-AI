import { NextResponse } from 'next/server';
import { requireCustomerAuthContext, resolveRequestAuthContext } from '@/lib/auth';
import { classifyCustomerRouteError, createCustomerRouteExecutionResolver } from '@/lib/customerRouteExecution';
import { getClientVisibleErrorDetail } from '@/lib/security';
import { toCustomerVisibleFile } from '@/lib/serializers';
import { validateProfileInput } from '@/lib/validation';
import type { CustomerFile, CustomerProfile, CustomerVisibleFile } from '@/lib/types';

type RequestBody = {
  action: 'load' | 'save' | 'reset' | 'start-new' | 'load-case';
  customerId?: string;
  caseId?: string;
  profileUpdates?: Partial<CustomerProfile>;
  file?: CustomerFile;
};

const customerRouteExecutionResolver = createCustomerRouteExecutionResolver();

export async function POST(request: Request) {
  try {
    const authContext = requireCustomerAuthContext(resolveRequestAuthContext(request));

    const body = (await request.json()) as RequestBody;
    const profileError =
      body.profileUpdates &&
      validateProfileInput({
        email: body.profileUpdates.email ?? '',
        phone: body.profileUpdates.phone ?? ''
      });

    if (profileError) {
      return NextResponse.json({ error: profileError }, { status: 400 });
    }

    if (body.action === 'load') {
      const { service, effectiveAuthContext, effectiveCustomerId } =
        await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const result = await service.loadCustomerWorkspace(
        effectiveAuthContext,
        body.profileUpdates,
        effectiveCustomerId
      );
      return NextResponse.json({
        ...result,
        file: toCustomerVisibleFile(result.file)
      } satisfies { file: CustomerVisibleFile; existed: boolean });
    }

    if (body.action === 'save') {
      if (!body.file) {
        return NextResponse.json({ error: 'file is required.' }, { status: 400 });
      }

      const saveProfileError = validateProfileInput({
        email: body.file.profile.email,
        phone: body.file.profile.phone
      });

      if (saveProfileError) {
        return NextResponse.json({ error: saveProfileError }, { status: 400 });
      }

      const { service, effectiveAuthContext, effectiveCustomerId } =
        await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const file = await service.saveCustomerWorkspace(
        {
          ...body.file,
          profile: {
            ...body.file.profile,
            customerId: effectiveCustomerId
          }
        },
        effectiveAuthContext
      );
      return NextResponse.json({ file: toCustomerVisibleFile(file) } satisfies { file: CustomerVisibleFile });
    }

    if (body.action === 'reset') {
      const { service, effectiveAuthContext, effectiveCustomerId } =
        await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const result = await service.resetCustomerWorkspace(
        effectiveAuthContext,
        body.profileUpdates,
        effectiveCustomerId
      );
      return NextResponse.json({
        ...result,
        file: toCustomerVisibleFile(result.file)
      } satisfies { file: CustomerVisibleFile; existed: boolean });
    }

    if (body.action === 'start-new') {
      const { service, effectiveAuthContext, effectiveCustomerId } =
        await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const file = await service.startNewCase(
        effectiveAuthContext,
        body.profileUpdates,
        effectiveCustomerId
      );
      return NextResponse.json({ file: toCustomerVisibleFile(file) } satisfies { file: CustomerVisibleFile });
    }

    if (body.action === 'load-case') {
      if (!body.caseId) {
        return NextResponse.json({ error: 'caseId is required.' }, { status: 400 });
      }

      const { service, effectiveAuthContext, effectiveCustomerId } =
        await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const result = await service.loadCustomerCase(body.caseId, effectiveAuthContext, effectiveCustomerId);
      return NextResponse.json({
        ...result,
        file: toCustomerVisibleFile(result.file)
      } satisfies { file: CustomerVisibleFile; existed: boolean });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('support-workspace route error:', error);
    const classified = classifyCustomerRouteError(error, {
      defaultMessage: 'Unable to load or save the support workspace right now.',
      schemaMessage:
        'Your Supabase schema does not match the current app. Run the latest support workspace migrations, including the cleanup and handoff support upgrades.'
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
