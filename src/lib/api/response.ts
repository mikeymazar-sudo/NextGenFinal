import { NextResponse } from 'next/server'

export type ApiError = {
  error: string
  code: string
  details?: unknown
}

export type ApiSuccess<T> = {
  data: T
  cached?: boolean
}

export function apiError(
  message: string,
  code: string,
  status: number,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code, details }, { status })
}

export function apiSuccess<T>(
  data: T,
  cached = false
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data, cached })
}

export const Errors = {
  unauthorized: () => apiError('Unauthorized', 'UNAUTHORIZED', 401),
  forbidden: (msg = 'Access denied') => apiError(msg, 'FORBIDDEN', 403),
  rateLimited: () => apiError('Rate limit exceeded. Try again later.', 'RATE_LIMITED', 429),
  badRequest: (msg: string) => apiError(msg, 'BAD_REQUEST', 400),
  notFound: (resource: string) => apiError(`${resource} not found`, 'NOT_FOUND', 404),
  externalApi: (service: string, details?: unknown) =>
    apiError(`${service} service unavailable`, 'EXTERNAL_API_ERROR', 502, details),
  internal: (details?: unknown) =>
    apiError('Internal server error', 'INTERNAL_ERROR', 500, details),
}
