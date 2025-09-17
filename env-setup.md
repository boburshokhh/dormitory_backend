# Настройка переменных окружения

Для работы с HikCentral API необходимо настроить переменные окружения.

## Создание файла .env

Создайте файл `.env` в корневой директории проекта со следующим содержимым:

```env
# HikCentral API Configuration
PARTNER_KEY=ваш_ключ_партнера
PARTNER_SECRET=ваш_секретный_ключ
ARTEMIS_HOST=ваш_хост_artemis

# Server Configuration
PORT=3000
```

## Пример значений

```env
PARTNER_KEY=12345678-1234-1234-1234-123456789012
PARTNER_SECRET=your_secret_key_here
ARTEMIS_HOST=192.168.1.100:443
PORT=3000
```

## Альтернативный способ (через командную строку)

### Windows (PowerShell):
```powershell
$env:PARTNER_KEY="ваш_ключ_партнера"
$env:PARTNER_SECRET="ваш_секретный_ключ"
$env:ARTEMIS_HOST="ваш_хост_artemis"
npm start
```

### Windows (CMD):
```cmd
set PARTNER_KEY=ваш_ключ_партнера
set PARTNER_SECRET=ваш_секретный_ключ
set ARTEMIS_HOST=ваш_хост_artemis
npm start
```

### Linux/Mac:
```bash
export PARTNER_KEY="ваш_ключ_партнера"
export PARTNER_SECRET="ваш_секретный_ключ"
export ARTEMIS_HOST="ваш_хост_artemis"
npm start
```

## Проверка настроек

После настройки переменных окружения перезапустите сервер:

```bash
npm start
```

Если переменные настроены правильно, ошибка "The 'key' argument must be of type string" исчезнет.

## Безопасность

⚠️ **Важно**: Никогда не коммитьте файл `.env` в систему контроля версий. Добавьте его в `.gitignore`.
