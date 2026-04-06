import { NextResponse } from 'next/server';
import { resolveRequestAuthContext } from '@/lib/auth';
import { toSafeAuthSessionSummary } from '@/lib/realAuth';

export async function GET(request: Request) {
  return NextResponse.json(toSafeAuthSessionSummary(resolveRequestAuthContext(request)));
}
