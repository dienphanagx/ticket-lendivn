import { Badge } from '@/components/ui/badge';
import { EVENT_MESSAGES } from '@/constants/messages';

import { EVENT_STATUS, type EventStatus } from '../types';

interface EventStatusBadgeProps {
  status: EventStatus;
}

export function EventStatusBadge({ status }: EventStatusBadgeProps) {
  return status === EVENT_STATUS.ON_SALE ? (
    <Badge>{EVENT_MESSAGES.STATUS_ON_SALE}</Badge>
  ) : (
    <Badge variant="secondary">{EVENT_MESSAGES.STATUS_COMPLETED}</Badge>
  );
}
