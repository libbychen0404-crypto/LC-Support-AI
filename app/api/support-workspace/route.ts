import { NextResponse } from 'next/server';
import { requireCustomerAuthContext, resolveAuthorizedCustomerId, resolveRequestAuthContext } from '@/lib/auth';
import { classifyCustomerRouteError, createCustomerRouteExecutionResolver } from '@/lib/customerRouteExecution';
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
      resolveAuthorizedCustomerId(authContext, body.customerId);
      const { service } = await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const result = await service.loadCustomerWorkspace(authContext, body.profileUpdates);
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

      const authorizedCustomerId = resolveAuthorizedCustomerId(authContext, body.file.profile.customerId);
      const { service } = await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const file = await service.saveCustomerWorkspace(
        {
          ...body.file,
          profile: {
            ...body.file.profile,
            customerId: authorizedCustomerId
          }
        },
        authContext
      );
      return NextResponse.json({ file: toCustomerVisibleFile(file) } satisfies { file: CustomerVisibleFile });
    }

    if (body.action === 'reset') {
      resolveAuthorizedCustomerId(authContext, body.customerId);
      const { service } = await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const result = await service.resetCustomerWorkspace(authContext, body.profileUpdates);
      return NextResponse.json({
        ...result,
        file: toCustomerVisibleFile(result.file)
      } satisfies { file: CustomerVisibleFile; existed: boolean });
    }

    if (body.action === 'start-new') {
      resolveAuthorizedCustomerId(authContext, body.customerId);
      const { service } = await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const file = await service.startNewCase(authContext, body.profileUpdates);
      return NextResponse.json({ file: toCustomerVisibleFile(file) } satisfies { file: CustomerVisibleFile });
    }

    if (body.action === 'load-case') {
      if (!body.caseId) {
        return NextResponse.json({ error: 'caseId is required.' }, { status: 400 });
      }

      resolveAuthorizedCustomerId(authContext, body.customerId);
      const { service } = await customerRouteExecutionResolver.resolveRequestCustomerRouteExecutionContext(
        request,
        authContext
      );
      const result = await service.loadCustomerCase(body.caseId, authContext);
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
        detail: classified.detail
      },
      { status: classified.status }
    );
  }
}
