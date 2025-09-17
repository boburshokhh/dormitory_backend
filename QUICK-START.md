# 🚀 Быстрый запуск HikCentral API Client

## ✅ Готово к использованию!

Приложение настроено с вашими учетными данными и готово к работе.

**Статус:** ✅ Все исправлено - приложение работает с реальным HikCentral API

## 🎯 Способы запуска

### Способ 1: PowerShell скрипт (рекомендуется)
```powershell
.\start-with-credentials.ps1
```

### Способ 2: Обычный запуск
```bash
npm start
```

### Способ 3: npm скрипт
```bash
npm run start:prod
```

## 📱 Доступ к приложению

После запуска откройте в браузере:
**http://localhost:3000**

## 🔧 Настроенные учетные данные

- **PARTNER_KEY:** 28896788
- **PARTNER_SECRET:** 53KH1HXUrMmIu1lKb9CT  
- **ARTEMIS_HOST:** 192.168.1.112

## 📋 Примеры запросов

### Получение списка устройств
```json
{
  "url": "/artemis/api/resource/v1/acs/device/list",
  "method": "POST",
  "data": {
    "pageNo": 1,
    "pageSize": 10
  }
}
```

### Добавление пользователя
```json
{
  "url": "/artemis/api/resource/v1/person/single/add",
  "method": "POST",
  "data": {
    "personInfo": {
      "personName": "Новый пользователь",
      "orgIndexCode": "1"
    }
  }
}
```

## 🛠️ Устранение неполадок

### Если сервер не запускается:
1. Остановите все процессы Node.js:
   ```powershell
   taskkill /F /IM node.exe
   ```
2. Запустите заново:
   ```powershell
   .\start-with-credentials.ps1
   ```

### Если порт 3000 занят:
1. Найдите процесс, использующий порт:
   ```powershell
   netstat -ano | findstr :3000
   ```
2. Остановите процесс по PID:
   ```powershell
   taskkill /F /PID <номер_процесса>
   ```

## ✅ Готово!

Приложение готово к работе с реальным HikCentral API. Все учетные данные настроены автоматически.
