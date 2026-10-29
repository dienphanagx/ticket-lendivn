// Wrapper duy nhất render icon (ESLint chặn import lucide-react ngoài file này và components/ui)
import type { ComponentProps } from 'react';
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  LoaderCircleIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  ReceiptIcon,
  TicketIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';

const ICONS = {
  calendar: CalendarIcon,
  'chevron-down': ChevronDownIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'circle-check': CircleCheckIcon,
  'circle-x': CircleXIcon,
  clock: ClockIcon,
  'loader-circle': LoaderCircleIcon,
  'map-pin': MapPinIcon,
  minus: MinusIcon,
  plus: PlusIcon,
  receipt: ReceiptIcon,
  ticket: TicketIcon,
  'triangle-alert': TriangleAlertIcon,
  x: XIcon,
} as const;

export type IconName = keyof typeof ICONS;

type IconProps = Omit<ComponentProps<typeof CalendarIcon>, 'ref'> & { name: IconName };

/** Icon trang trí mặc định `aria-hidden`; icon mang nghĩa → truyền `aria-label` + `aria-hidden={false}` */
export function Icon({ name, ...props }: IconProps) {
  const Component = ICONS[name];
  return <Component aria-hidden {...props} />;
}
