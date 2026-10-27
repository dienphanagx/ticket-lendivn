-- Chạy tự động bởi image postgres (mount vào /docker-entrypoint-initdb.d/) chỉ khi volume `pgdata` còn trống.
-- Tạo DB `ticket_test` cho service `api-test` (profile `test`); DB dev `ticket` do POSTGRES_DB tạo.
-- Volume đã có từ trước (chưa có `ticket_test`): script này không chạy lại, tạo tay bằng
--   docker compose exec db psql -U ticket -d ticket -c "CREATE DATABASE ticket_test"
CREATE DATABASE ticket_test;
