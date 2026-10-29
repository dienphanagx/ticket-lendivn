import { sql, type Kysely } from 'kysely';

// Sổ cái kép (accounts / transactions / entries + view số dư), payment_transactions và các chốt bất biến
// ở DB (specs/database.md § Schema, § Các Quyết Định Kỹ Thuật). Forward-only: không có `down`.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TYPE payment_source AS ENUM ('IPN', 'RETURN_URL', 'QUERYDR');
    CREATE TYPE payment_disposition AS ENUM ('CAPTURED', 'REFUND_REQUIRED', 'FAILED');
    -- Thứ tự khai báo = thứ tự hiển thị của sổ cái (ORDER BY type)
    CREATE TYPE ledger_account_type AS ENUM (
      'GATEWAY_CASH', 'ESCROW_SELLER', 'ESCROW_FEE', 'SELLER_PAYABLE', 'BUYER_REFUND_PAYABLE', 'PLATFORM_FEE_REVENUE'
    );
    CREATE TYPE ledger_side AS ENUM ('DEBIT', 'CREDIT');
    CREATE TYPE ledger_txn_type AS ENUM ('PAYMENT_CAPTURED', 'PAYMENT_REFUND_REQUIRED', 'EVENT_RELEASE');

    CREATE TABLE ledger_accounts (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      type ledger_account_type NOT NULL,
      owner_user_id uuid REFERENCES users (id),
      event_id uuid REFERENCES events (id),
      normal_side ledger_side NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      -- Tài sản tăng bên nợ; nợ phải trả / doanh thu tăng bên có
      CONSTRAINT ledger_accounts_normal_side_ck CHECK (
        normal_side = CASE WHEN type = 'GATEWAY_CASH' THEN 'DEBIT'::ledger_side ELSE 'CREDIT'::ledger_side END
      ),
      CONSTRAINT ledger_accounts_owner_shape_ck CHECK (
        CASE type
          WHEN 'GATEWAY_CASH' THEN owner_user_id IS NULL AND event_id IS NULL
          WHEN 'PLATFORM_FEE_REVENUE' THEN owner_user_id IS NULL AND event_id IS NULL
          WHEN 'ESCROW_SELLER' THEN owner_user_id IS NOT NULL AND event_id IS NOT NULL
          WHEN 'ESCROW_FEE' THEN owner_user_id IS NULL AND event_id IS NOT NULL
          WHEN 'SELLER_PAYABLE' THEN owner_user_id IS NOT NULL AND event_id IS NULL
          WHEN 'BUYER_REFUND_PAYABLE' THEN owner_user_id IS NOT NULL AND event_id IS NULL
          ELSE false
        END
      ),
      -- NULL coi như bằng nhau: tài khoản sàn cũng chỉ có 1 dòng; đích của ON CONFLICT ON CONSTRAINT
      CONSTRAINT ledger_accounts_key_uq UNIQUE NULLS NOT DISTINCT (type, owner_user_id, event_id)
    );
    CREATE INDEX ledger_accounts_owner_user_id_idx ON ledger_accounts (owner_user_id);
    CREATE INDEX ledger_accounts_event_id_idx ON ledger_accounts (event_id);

    CREATE TABLE ledger_transactions (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      type ledger_txn_type NOT NULL,
      idempotency_key varchar(100) NOT NULL CONSTRAINT ledger_transactions_idempotency_key_uq UNIQUE,
      event_id uuid NOT NULL REFERENCES events (id),
      order_id varchar(20) REFERENCES orders (id),
      description varchar(255) NOT NULL,
      created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ledger_transactions_release_key_ck CHECK (
        (type = 'EVENT_RELEASE') = (idempotency_key LIKE 'EVENT_RELEASE:%')
      ),
      CONSTRAINT ledger_transactions_order_ck CHECK ((type = 'EVENT_RELEASE') = (order_id IS NULL))
    );
    CREATE INDEX ledger_transactions_created_at_id_idx ON ledger_transactions (created_at DESC, id DESC);
    CREATE INDEX ledger_transactions_event_created_at_idx ON ledger_transactions (event_id, created_at DESC);

    CREATE TABLE ledger_entries (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      transaction_id uuid NOT NULL REFERENCES ledger_transactions (id),
      account_id uuid NOT NULL REFERENCES ledger_accounts (id),
      direction ledger_side NOT NULL,
      -- Dòng 0 đồng không được ghi
      amount bigint NOT NULL CONSTRAINT ledger_entries_amount_ck CHECK (amount > 0),
      -- Trigger ledger_entry_guard chép từ giao dịch cha
      created_at timestamptz NOT NULL
    );
    CREATE INDEX ledger_entries_transaction_id_idx ON ledger_entries (transaction_id);
    CREATE INDEX ledger_entries_account_created_at_idx
      ON ledger_entries (account_id, created_at DESC, transaction_id DESC);

    CREATE TABLE payment_transactions (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      order_id varchar(20) NOT NULL REFERENCES orders (id),
      source payment_source NOT NULL,
      gateway_txn_no varchar(20) NOT NULL,
      response_code char(2) NOT NULL,
      transaction_status char(2) NOT NULL,
      is_success boolean NOT NULL,
      amount bigint NOT NULL CONSTRAINT payment_transactions_amount_ck CHECK (amount > 0),
      bank_code varchar(20),
      pay_date timestamptz,
      disposition payment_disposition NOT NULL,
      ledger_transaction_id uuid
        CONSTRAINT payment_transactions_ledger_transaction_id_uq UNIQUE
        REFERENCES ledger_transactions (id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT payment_transactions_is_success_ck CHECK (
        is_success = (response_code = '00' AND transaction_status = '00')
      ),
      CONSTRAINT payment_transactions_disposition_ck CHECK (is_success = (disposition <> 'FAILED')),
      -- Tiền đã xác nhận luôn có đúng 1 giao dịch sổ cái
      CONSTRAINT payment_transactions_ledger_ck CHECK ((ledger_transaction_id IS NOT NULL) = is_success)
    );
    -- Giao dịch thất bại không chịu UNIQUE: VNPay có thể trả cùng mã (vd 0)
    CREATE UNIQUE INDEX payment_transactions_success_txn_no_uq ON payment_transactions (gateway_txn_no)
      WHERE is_success;
    CREATE INDEX payment_transactions_order_id_idx ON payment_transactions (order_id);

    CREATE VIEW ledger_account_balances AS
    SELECT
      a.id AS account_id,
      a.type,
      a.owner_user_id,
      a.event_id,
      a.normal_side,
      COALESCE(sum(e.amount) FILTER (WHERE e.direction = 'DEBIT'), 0)::bigint AS total_debit,
      COALESCE(sum(e.amount) FILTER (WHERE e.direction = 'CREDIT'), 0)::bigint AS total_credit,
      (CASE a.normal_side
        WHEN 'DEBIT' THEN COALESCE(sum(e.amount) FILTER (WHERE e.direction = 'DEBIT'), 0)
                        - COALESCE(sum(e.amount) FILTER (WHERE e.direction = 'CREDIT'), 0)
        ELSE COALESCE(sum(e.amount) FILTER (WHERE e.direction = 'CREDIT'), 0)
           - COALESCE(sum(e.amount) FILTER (WHERE e.direction = 'DEBIT'), 0)
      END)::bigint AS balance
    FROM ledger_accounts a
    LEFT JOIN ledger_entries e ON e.account_id = a.id
    GROUP BY a.id;
  `.execute(db);

  await sql`
    -- Ghi lại transaction PostgreSQL tạo giao dịch sổ cái; chỉ transaction đó được thêm dòng
    CREATE FUNCTION ledger_txn_stamp() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      NEW.created_xid := pg_current_xact_id();
      NEW.created_at := now();
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER ledger_txn_stamp
      BEFORE INSERT ON ledger_transactions
      FOR EACH ROW EXECUTE FUNCTION ledger_txn_stamp();

    -- Chặn thêm dòng vào giao dịch đã commit (cặp dòng cân thêm sau vẫn qua kiểm cân bằng nhưng sửa lịch sử)
    CREATE FUNCTION ledger_entry_guard() RETURNS trigger
    LANGUAGE plpgsql AS $$
    DECLARE
      parent_xid xid8;
      parent_created_at timestamptz;
    BEGIN
      SELECT t.created_xid, t.created_at
        INTO parent_xid, parent_created_at
        FROM ledger_transactions t
       WHERE t.id = NEW.transaction_id;

      IF NOT FOUND THEN
        -- FK transaction_id từ chối dòng này
        RETURN NEW;
      END IF;

      IF parent_xid <> pg_current_xact_id() THEN
        RAISE EXCEPTION 'LEDGER_TRANSACTION_CLOSED'
          USING ERRCODE = 'check_violation',
                DETAIL = format('ledger transaction %s was created by another database transaction', NEW.transaction_id);
      END IF;

      NEW.created_at := parent_created_at;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER ledger_entry_guard
      BEFORE INSERT ON ledger_entries
      FOR EACH ROW EXECUTE FUNCTION ledger_entry_guard();

    -- Giao dịch phải có >= 2 dòng và tổng nợ = tổng có
    CREATE FUNCTION ledger_assert_balanced(p_transaction_id uuid) RETURNS void
    LANGUAGE plpgsql AS $$
    DECLARE
      entry_count bigint;
      debit_total numeric;
      credit_total numeric;
    BEGIN
      SELECT count(*),
             COALESCE(sum(amount) FILTER (WHERE direction = 'DEBIT'), 0),
             COALESCE(sum(amount) FILTER (WHERE direction = 'CREDIT'), 0)
        INTO entry_count, debit_total, credit_total
        FROM ledger_entries
       WHERE transaction_id = p_transaction_id;

      IF entry_count < 2 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'LEDGER_UNBALANCED'
          USING ERRCODE = 'check_violation',
                DETAIL = format('ledger transaction %s: %s entries, debit %s, credit %s',
                                p_transaction_id, entry_count, debit_total, credit_total);
      END IF;
    END;
    $$;

    CREATE FUNCTION ledger_entries_check_balanced() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM ledger_assert_balanced(NEW.transaction_id);
      RETURN NULL;
    END;
    $$;

    CREATE FUNCTION ledger_transactions_check_balanced() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM ledger_assert_balanced(NEW.id);
      RETURN NULL;
    END;
    $$;

    -- Deferred: chạy lúc COMMIT, sau khi mọi dòng đã chèn; lệch → cả transaction rollback
    CREATE CONSTRAINT TRIGGER ledger_entries_balanced
      AFTER INSERT ON ledger_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION ledger_entries_check_balanced();

    -- Bắt giao dịch không có dòng nào (trigger trên entries không bao giờ chạy)
    CREATE CONSTRAINT TRIGGER ledger_transactions_balanced
      AFTER INSERT ON ledger_transactions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION ledger_transactions_check_balanced();

    -- Append-only: sửa sai bằng giao dịch bù. TRUNCATE / DDL của owner không bị chặn (reset DB test)
    CREATE FUNCTION ledger_reject_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'LEDGER_IMMUTABLE'
        USING ERRCODE = 'restrict_violation',
              DETAIL = format('%s on %s is not allowed', TG_OP, TG_TABLE_NAME);
    END;
    $$;

    CREATE TRIGGER ledger_reject_mutation
      BEFORE UPDATE OR DELETE ON ledger_transactions
      FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();
    CREATE TRIGGER ledger_reject_mutation
      BEFORE UPDATE OR DELETE ON ledger_entries
      FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();
    CREATE TRIGGER ledger_reject_mutation
      BEFORE UPDATE OR DELETE ON payment_transactions
      FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();
  `.execute(db);

  // Dữ liệu nền: 2 tài khoản sàn; code vẫn upsert nên thiếu cũng tự tạo lại
  await sql`
    INSERT INTO ledger_accounts (type, normal_side)
    VALUES ('GATEWAY_CASH', 'DEBIT'), ('PLATFORM_FEE_REVENUE', 'CREDIT')
    ON CONFLICT ON CONSTRAINT ledger_accounts_key_uq DO NOTHING
  `.execute(db);
}
