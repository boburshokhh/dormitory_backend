# Исправление ошибки восстановления пароля

## Проблема

```
❌ SQL Error: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

## Причина

В таблице `verification_codes` отсутствует уникальный индекс по полям `(contact, type)`, который необходим для корректной работы `ON CONFLICT` в запросах.

## Решение

### 1. Применить миграцию

Выполните SQL-миграцию для создания уникального индекса:

```bash
# Подключитесь к БД PostgreSQL и выполните:
psql -h 192.168.1.253 -U postgres -d gubkin_dormitory -f migrations/fix_verification_codes_unique_constraint.sql
```

Или вручную:

```sql
-- 1. Удаляем дубликаты если есть
DELETE FROM verification_codes
WHERE id NOT IN (
    SELECT DISTINCT ON (contact, type) id
    FROM verification_codes
    ORDER BY contact, type, created_at DESC
);

-- 2. Создаем уникальный индекс
CREATE UNIQUE INDEX IF NOT EXISTS verification_codes_contact_type_unique
ON verification_codes (contact, type);
```

### 2. Перезапустить сервер

```bash
# Остановить сервер (Ctrl+C)
# Запустить заново
npm start
```

### 3. Проверить работу

- Попробуйте восстановление пароля через форму
- Email должен отправляться, код должен сохраняться в БД без ошибок

## Что изменилось в коде

### Backend (новые эндпоинты):

- `GET /auth/check-email?email=...` - проверка существования email
- `POST /auth/forgot-password { email }` - запрос кода восстановления (без аутентификации)
- `POST /auth/reset-password-by-code { code, email }` - подтверждение кода и сброс пароля (без аутентификации)

### Frontend:

- Упрощена модалка восстановления пароля: email → код → успех
- Добавлена проверка существования email перед отправкой
- Правильная обработка ошибок с сервера

## Логика работы

### 1. Проверка email:

- Пользователь вводит email
- Система проверяет существование через `GET /auth/check-email`
- Если email не найден → ошибка "Пользователь с таким email не найден"
- Если email найден → переходим к отправке кода

### 2. Отправка кода:

- Система отправляет код на email через `POST /auth/forgot-password`
- Код сохраняется в БД с типом `password_reset`
- Пользователь получает уведомление об отправке

### 3. Подтверждение кода:

- Пользователь вводит 6-значный код
- Система проверяет код через `POST /auth/reset-password-by-code`
- При успехе: генерируется новый пароль, отправляется на email, код удаляется из БД

## Логи успешной работы

```
✅ Email найден: user@example.com
📧 Код восстановления пароля отправлен на user@example.com
🔢 Код в письме: 123456
✅ Пароль успешно сброшен для пользователя user@example.com
```
