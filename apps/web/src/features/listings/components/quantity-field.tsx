'use client';

import type { KeyboardEvent } from 'react';

import { NumberInput } from '@/components/custom/number-input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { TICKET_MESSAGES } from '@/constants/messages';

import { QUANTITY_MIN } from '../quantity';

const FIELD_ID = 'ticket-quantity';
const ERROR_ID = `${FIELD_ID}-error`;
// `type="number"` vẫn nhận e, +, -, dấu thập phân; spec chỉ nhận ký tự 0-9
const NON_DIGIT_KEYS = new Set(['e', 'E', '+', '-', '.', ',']);

interface QuantityFieldProps {
  value: number | null;
  max: number;
  error: string | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}

export function QuantityField({ value, max, error, disabled, onChange }: QuantityFieldProps) {
  const blockNonDigit = (e: KeyboardEvent<HTMLInputElement>) => {
    if (NON_DIGIT_KEYS.has(e.key)) e.preventDefault();
  };
  return (
    <Field data-invalid={error !== null}>
      <FieldLabel htmlFor={FIELD_ID}>{TICKET_MESSAGES.QUANTITY}</FieldLabel>
      <NumberInput
        id={FIELD_ID}
        value={value}
        min={QUANTITY_MIN}
        max={max}
        disabled={disabled}
        onChange={onChange}
        onKeyDown={blockNonDigit}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? ERROR_ID : undefined}
      />
      {error !== null && <FieldError id={ERROR_ID}>{error}</FieldError>}
    </Field>
  );
}
