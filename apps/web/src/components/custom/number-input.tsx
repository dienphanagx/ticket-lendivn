'use client';

// Ô số có nút − / + shadcn (.claude/skills/_shared/number-input.md)
import { useEffect, useRef, useState, type ComponentProps } from 'react';

import { Icon } from '@/components/custom/icon';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { UI_MESSAGES } from '@/constants/messages';
import { stepNumber, toNumber, type StepOptions } from '@/lib/number';
import { cn } from '@/lib/utils';

type NumberInputProps = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'size'
> &
  StepOptions & {
    id: string;
    value?: number | null; // controlled, ô rỗng = null
    defaultValue?: number | string; // uncontrolled (Server Action)
    onChange?: (value: number | null) => void;
  };

function setNativeValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

type StepButtonProps = ComponentProps<typeof InputGroupButton> & { delta: 1 | -1 };

function StepButton({ delta, ...props }: StepButtonProps) {
  return (
    <InputGroupAddon align={delta < 0 ? 'inline-start' : 'inline-end'}>
      <InputGroupButton {...props} size="icon">
        <Icon name={delta < 0 ? 'minus' : 'plus'} className="size-4" />
      </InputGroupButton>
    </InputGroupAddon>
  );
}

export function NumberInput(props: NumberInputProps) {
  const { value, defaultValue, onChange, step = 1, min, max, className, ...rest } = props;
  const groupRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(() => toNumber(String(defaultValue ?? '')));
  const current = value !== undefined ? value : typed;

  useEffect(() => {
    const input = groupRef.current?.querySelector('input');
    const onReset = () => setTyped(toNumber(input?.defaultValue ?? ''));
    input?.form?.addEventListener('reset', onReset);
    return () => input?.form?.removeEventListener('reset', onReset);
  }, []);

  const bump = (delta: 1 | -1) => {
    const input = groupRef.current?.querySelector('input');
    if (!input) return;
    setNativeValue(input, String(stepNumber(toNumber(input.value), delta, { step, min, max })));
  };
  const locked = rest.disabled || rest.readOnly;
  const atMin = current !== null && min !== undefined && current <= min;
  const atMax = current !== null && max !== undefined && current >= max;
  const keypad = Number.isInteger(step) ? 'numeric' : 'decimal';

  return (
    <InputGroup ref={groupRef}>
      <StepButton
        delta={-1}
        aria-label={UI_MESSAGES.DECREASE}
        aria-controls={rest.id}
        disabled={locked || atMin}
        onClick={() => bump(-1)}
      />
      <InputGroupInput
        {...rest}
        type="number"
        inputMode={min !== undefined && min >= 0 ? keypad : undefined}
        {...{ step, min, max, defaultValue }}
        value={value === null ? '' : value}
        onChange={(e) => {
          const next = toNumber(e.target.value);
          setTyped(next);
          onChange?.(next);
        }}
        className={cn(
          '[appearance:textfield] text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          className,
        )}
      />
      <StepButton
        delta={1}
        aria-label={UI_MESSAGES.INCREASE}
        aria-controls={rest.id}
        disabled={locked || atMax}
        onClick={() => bump(1)}
      />
    </InputGroup>
  );
}
