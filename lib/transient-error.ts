// Geçici (yerel/sunucu tarafı) hatalar kaynak kısıtı değildir; 403/429/giriş/CAPTCHA kapıları buraya girmez.
export class TransientHttpError extends Error {
  constructor(readonly status: number, message = 'Source returned HTTP ' + status) { super(message); this.name = 'TransientHttpError'; }
}
export const transportErrorPattern = /net::ERR_(CONNECTION_CLOSED|CONNECTION_RESET|CONNECTION_TIMED_OUT|NETWORK_CHANGED)\b/;
export function isTransientTransportError(error: unknown) {
  return error instanceof TransientHttpError || (error instanceof Error && transportErrorPattern.test(error.message));
}
