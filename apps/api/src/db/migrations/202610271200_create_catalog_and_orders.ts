import { sql, type Kysely } from 'kysely';

// users, events, listings, orders + trigger chuyển trạng thái (specs/database.md § Schema, § Các Quyết Định Kỹ Thuật).
// Forward-only: không có `down`; sai schema → viết migration mới.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TYPE event_status AS ENUM ('ON_SALE', 'COMPLETED');
    CREATE TYPE order_status AS ENUM ('PENDING_PAYMENT', 'PAID', 'FAILED', 'EXPIRED', 'REFUND_REQUIRED');

    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      display_name varchar(100) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE events (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      slug varchar(100) NOT NULL
        CONSTRAINT events_slug_uq UNIQUE
        CONSTRAINT events_slug_format_ck CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
      name varchar(200) NOT NULL,
      description text NOT NULL DEFAULT '',
      venue varchar(200) NOT NULL,
      starts_at timestamptz NOT NULL,
      status event_status NOT NULL DEFAULT 'ON_SALE',
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT events_completed_at_ck CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
    );

    CREATE TABLE listings (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      event_id uuid NOT NULL REFERENCES events (id),
      seller_id uuid NOT NULL REFERENCES users (id),
      unit_price bigint NOT NULL CONSTRAINT listings_unit_price_ck CHECK (unit_price > 0),
      quantity_total integer NOT NULL CONSTRAINT listings_quantity_total_ck CHECK (quantity_total > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      -- Đích FK ghép của orders: snapshot sự kiện / người bán trên đơn luôn khớp tin bán
      CONSTRAINT listings_id_event_seller_uq UNIQUE (id, event_id, seller_id)
    );
    CREATE INDEX listings_event_id_idx ON listings (event_id);

    CREATE TABLE orders (
      id varchar(20) PRIMARY KEY CONSTRAINT orders_id_format_ck CHECK (id ~ '^[A-Z0-9]{16}$'),
      buyer_id uuid NOT NULL REFERENCES users (id),
      seller_id uuid NOT NULL,
      listing_id uuid NOT NULL,
      event_id uuid NOT NULL REFERENCES events (id),
      quantity integer NOT NULL CONSTRAINT orders_quantity_ck CHECK (quantity > 0),
      unit_price bigint NOT NULL CONSTRAINT orders_unit_price_ck CHECK (unit_price > 0),
      subtotal bigint NOT NULL,
      buyer_fee bigint NOT NULL,
      buyer_total bigint NOT NULL,
      seller_fee bigint NOT NULL,
      seller_net bigint NOT NULL,
      platform_fee bigint NOT NULL,
      status order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
      idempotency_key varchar(64) NOT NULL,
      hold_expires_at timestamptz NOT NULL,
      payment_url text,
      vnp_create_date char(14) CONSTRAINT orders_vnp_create_date_ck CHECK (vnp_create_date ~ '^[0-9]{14}$'),
      payment_url_created_at timestamptz,
      paid_at timestamptz,
      failed_at timestamptz,
      expired_at timestamptz,
      refund_required_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT orders_listing_fk FOREIGN KEY (listing_id, event_id, seller_id)
        REFERENCES listings (id, event_id, seller_id),
      CONSTRAINT orders_buyer_idempotency_key_uq UNIQUE (buyer_id, idempotency_key),
      CONSTRAINT orders_buyer_not_seller_ck CHECK (buyer_id <> seller_id),
      -- Công thức phí snapshot; chia nguyên của PostgreSQL = làm tròn xuống với số không âm
      CONSTRAINT orders_subtotal_ck CHECK (subtotal = unit_price * quantity),
      CONSTRAINT orders_buyer_fee_ck CHECK (buyer_fee = subtotal * 10 / 100),
      CONSTRAINT orders_buyer_total_ck CHECK (buyer_total = subtotal + buyer_fee),
      CONSTRAINT orders_seller_fee_ck CHECK (seller_fee = subtotal * 5 / 100),
      CONSTRAINT orders_seller_net_ck CHECK (seller_net = subtotal - seller_fee),
      CONSTRAINT orders_platform_fee_ck CHECK (platform_fee = buyer_total - seller_net),
      CONSTRAINT orders_hold_window_ck CHECK (hold_expires_at = created_at + interval '15 minutes'),
      CONSTRAINT orders_payment_url_ck CHECK (num_nulls(payment_url, vnp_create_date, payment_url_created_at) IN (0, 3)),
      CONSTRAINT orders_paid_at_ck CHECK (status <> 'PAID' OR paid_at IS NOT NULL),
      CONSTRAINT orders_failed_at_ck CHECK (status <> 'FAILED' OR failed_at IS NOT NULL),
      CONSTRAINT orders_expired_at_ck CHECK (status <> 'EXPIRED' OR expired_at IS NOT NULL),
      CONSTRAINT orders_refund_required_at_ck CHECK (status <> 'REFUND_REQUIRED' OR refund_required_at IS NOT NULL)
    );
    CREATE INDEX orders_listing_status_idx ON orders (listing_id, status) INCLUDE (quantity, hold_expires_at);
    CREATE INDEX orders_pending_hold_expires_idx ON orders (hold_expires_at) WHERE status = 'PENDING_PAYMENT';
    CREATE INDEX orders_pending_event_hold_expires_idx ON orders (event_id, hold_expires_at)
      WHERE status = 'PENDING_PAYMENT';
    CREATE INDEX orders_buyer_created_at_idx ON orders (buyer_id, created_at DESC);
    CREATE INDEX orders_created_at_idx ON orders (created_at DESC);
  `.execute(db);

  await sql`
    -- COMPLETED là một chiều
    CREATE FUNCTION event_guard_transition() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.status = 'COMPLETED' AND NEW.status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'EVENT_INVALID_TRANSITION'
          USING ERRCODE = 'check_violation',
                DETAIL = format('event %s: %s -> %s', OLD.id, OLD.status, NEW.status);
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER event_guard_transition
      BEFORE UPDATE ON events
      FOR EACH ROW EXECUTE FUNCTION event_guard_transition();

    -- Cạnh hợp lệ: PENDING_PAYMENT -> PAID / FAILED / EXPIRED / REFUND_REQUIRED;
    -- EXPIRED, FAILED -> PAID / REFUND_REQUIRED (tiền đến muộn); PAID, REFUND_REQUIRED là trạng thái cuối.
    -- Cột snapshot bất biến; payment_url / vnp_create_date chỉ ghi 1 lần.
    CREATE FUNCTION order_guard_transition() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.buyer_id, NEW.seller_id, NEW.listing_id, NEW.event_id, NEW.quantity,
          NEW.unit_price, NEW.subtotal, NEW.buyer_fee, NEW.buyer_total, NEW.seller_fee,
          NEW.seller_net, NEW.platform_fee, NEW.idempotency_key, NEW.hold_expires_at)
         IS DISTINCT FROM
         (OLD.buyer_id, OLD.seller_id, OLD.listing_id, OLD.event_id, OLD.quantity,
          OLD.unit_price, OLD.subtotal, OLD.buyer_fee, OLD.buyer_total, OLD.seller_fee,
          OLD.seller_net, OLD.platform_fee, OLD.idempotency_key, OLD.hold_expires_at)
         OR (OLD.payment_url IS NOT NULL AND NEW.payment_url IS DISTINCT FROM OLD.payment_url)
         OR (OLD.vnp_create_date IS NOT NULL AND NEW.vnp_create_date IS DISTINCT FROM OLD.vnp_create_date)
      THEN
        RAISE EXCEPTION 'ORDER_SNAPSHOT_IMMUTABLE'
          USING ERRCODE = 'check_violation', DETAIL = format('order %s', OLD.id);
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
           (OLD.status = 'PENDING_PAYMENT'
              AND NEW.status IN ('PAID', 'FAILED', 'EXPIRED', 'REFUND_REQUIRED'))
           OR (OLD.status IN ('EXPIRED', 'FAILED') AND NEW.status IN ('PAID', 'REFUND_REQUIRED'))
         )
      THEN
        RAISE EXCEPTION 'ORDER_INVALID_TRANSITION'
          USING ERRCODE = 'check_violation',
                DETAIL = format('order %s: %s -> %s', OLD.id, OLD.status, NEW.status);
      END IF;

      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER order_guard_transition
      BEFORE UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION order_guard_transition();
  `.execute(db);
}
