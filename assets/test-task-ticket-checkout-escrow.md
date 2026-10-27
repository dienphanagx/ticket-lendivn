# Test task: ticket checkout with escrow

## Context

We're building a resale marketplace for event tickets. This task is a thin slice of that: selling a ticket and accounting for the money correctly.

## Time

Workload is a day or two with heavy use of AI tools; deadline is 1 week. Any AI tools are allowed.

## What to build

Stack: TypeScript, a server-rendered React framework (Next.js or equivalent), a Node.js backend, PostgreSQL. It should start with `docker compose up`, plus whatever you need to receive gateway callbacks locally.

Where this task is unclear, make a judgement call. How you decide is part of what we're looking at.

### 1. Data

- Seed one or two events and several listings from at least two sellers. A listing has an event, a seller, a quantity, and a price per ticket in VND.
- Fees: the buyer pays the listing price plus a 10% service fee. The seller receives the listing price minus 5%. We keep the difference.
- No authentication needed for this test task. A dropdown to switch users is fine.

### 2. Checkout

- An event page, server-rendered, showing its listings with price and available quantity.
- The buyer picks a listing and a quantity.
- The pages should work well on a phone browser.

### 3. Payment

- Integrate a real payment gateway's sandbox, of your choice. Justify your decision.
- The buyer is redirected to the gateway, pays with test credentials, and comes back to a result page that shows the order's real status.
- The gateway's notification (IPN / webhook) must be handled correctly.

### 4. Escrow and ledger

- Record every money movement as double-entry. The accounts are up to you.
- Every balance must be derivable from the ledger.
- User's pending balance and their available balance should be seen in UI.
- A way to mark an event as completed, which releases its escrowed money to the sellers' available balances. No real payouts.

## Deliverables

- A Git repository shared with https://github.com/syn-mcj.
- A `.env.example`. Send your sandbox credentials to us separately, not in the repository.
- A README covering:
  - how to run it, including how gateway callbacks reach it locally;
  - which payment gateway you chose, and why;
  - the decisions you made where this brief is silent;
  - what is not production-ready, and what you would do next;
  - how you used AI, and how long it took.

## Follow-up

We may contact you to chat in zalo/messenger/telegram about your solution a bit.
