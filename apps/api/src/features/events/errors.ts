export const EVENT_ERRORS = {
  NOT_FOUND: { code: 'EVENT_NOT_FOUND', message: 'Event not found', httpStatus: 404 },
  NOT_ON_SALE: { code: 'EVENT_NOT_ON_SALE', message: 'Event is not on sale', httpStatus: 409 },
} as const;
