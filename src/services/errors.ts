export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const unauthorized = (msg = 'Your session has ended. Please sign in again.') => new ApiError(401, msg);
export const forbidden = (msg = 'You do not have permission to do this.') => new ApiError(403, msg);
export const notFound = (what = 'Record') => new ApiError(404, `${what} not found or outside your scope.`);
export const conflict = (msg: string) => new ApiError(409, msg);
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new ApiError(422, msg, fieldErrors);

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}
