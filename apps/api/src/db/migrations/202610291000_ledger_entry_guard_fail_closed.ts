import { sql, type Kysely } from 'kysely';

// ledger_entry_guard fail-closed: không thấy giao dịch cha cũng từ chối (specs/database.md § Các Quyết
// Định Kỹ Thuật → Không thêm dòng vào giao dịch đã commit). Transaction luôn thấy dòng chính nó chèn,
// nên "không thấy cha" = cha thuộc transaction khác chưa commit (khe race với FK) hoặc không tồn tại.
// Forward-only: không có `down`.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION ledger_entry_guard() RETURNS trigger
    LANGUAGE plpgsql AS $$
    DECLARE
      parent_xid xid8;
      parent_created_at timestamptz;
    BEGIN
      SELECT t.created_xid, t.created_at
        INTO parent_xid, parent_created_at
        FROM ledger_transactions t
       WHERE t.id = NEW.transaction_id;

      IF NOT FOUND OR parent_xid <> pg_current_xact_id() THEN
        RAISE EXCEPTION 'LEDGER_TRANSACTION_CLOSED'
          USING ERRCODE = 'check_violation',
                DETAIL = format('ledger transaction %s is not open in this database transaction',
                                NEW.transaction_id);
      END IF;

      NEW.created_at := parent_created_at;
      RETURN NEW;
    END;
    $$;
  `.execute(db);
}
