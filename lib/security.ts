import { requireAgentAuthContext, resolveRequestAuthContext } from './auth';

export function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

export function getClientVisibleErrorDetail(detail?: string) {
  return isProductionRuntime() ? undefined : detail;
}

export function requireProductionSetupAccess(request: Request) {
  if (!isProductionRuntime()) {
    return;
  }

  requireAgentAuthContext(resolveRequestAuthContext(request));
}
