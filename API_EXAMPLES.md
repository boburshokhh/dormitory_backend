# 📚 Примеры использования API

Практические примеры работы с API системы управления общежитиями ГУБКИН.

## 🔐 Аутентификация

### Регистрация нового пользователя

```bash
# 1. Запрос кода подтверждения
curl -X POST http://localhost:3000/api/auth/register-request \
  -H "Content-Type: application/json" \
  -d '{
    "contact": "student@gubkin.ru"
  }'

# Ответ:
{
  "message": "Код подтверждения отправлен"
}

# 2. Регистрация с кодом
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "contact": "student@gubkin.ru",
    "code": "123456",
    "username": "student123",
    "password": "password123"
  }'

# Ответ:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "student123",
    "role": "student",
    "contact": "student@gubkin.ru"
  }
}
```

### Вход в систему

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "contact": "student@gubkin.ru",
    "password": "password123"
  }'

# Ответ:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "student123",
    "role": "student"
  }
}
```

### Обновление токена

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'

# Ответ:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "student123",
    "role": "student"
  }
}
```

## 🏢 Работа с общежитиями

### Получение списка общежитий

```bash
curl -X GET http://localhost:3000/api/dormitories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Ответ:
{
  "dormitories": [
    {
      "id": 1,
      "name": "ДПС-1",
      "type": "type_1",
      "address": "ул. Ленинская, 65",
      "maxFloors": 9,
      "description": "Общежитие для студентов 1 курса",
      "stats": {
        "totalFloors": 9,
        "totalRooms": 180,
        "totalBeds": 720,
        "occupiedBeds": 650,
        "availableBeds": 70
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": 2,
      "name": "ДПС-2",
      "type": "type_2",
      "address": "ул. Ленинская, 67",
      "maxFloors": 12,
      "description": "Общежитие для студентов 2-5 курса",
      "stats": {
        "totalFloors": 12,
        "totalRooms": 240,
        "totalBeds": 960,
        "occupiedBeds": 890,
        "availableBeds": 70
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Получение доступных общежитий для студента

```bash
curl -X GET http://localhost:3000/api/dormitories/available \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Ответ (для студента 1 курса):
{
  "dormitories": [
    {
      "id": 1,
      "name": "ДПС-1",
      "type": "type_1",
      "address": "ул. Ленинская, 65",
      "stats": {
        "totalFloors": 9,
        "totalRooms": 180,
        "totalBeds": 720,
        "occupiedBeds": 650,
        "availableBeds": 70
      }
    }
  ]
}
```

## 🏠 Работа со структурой

### Получение этажей общежития

```bash
curl -X GET http://localhost:3000/api/floors/dormitory/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Ответ:
{
  "floors": [
    {
      "id": 1,
      "number": 1,
      "dormitoryId": 1,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": 2,
      "number": 2,
      "dormitoryId": 1,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Получение комнат этажа

```bash
curl -X GET http://localhost:3000/api/rooms/floor/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Ответ:
{
  "rooms": [
    {
      "id": 1,
      "number": "101",
      "floorId": 1,
      "blockId": 1,
      "capacity": 4,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": 2,
      "number": "102",
      "floorId": 1,
      "blockId": 1,
      "capacity": 4,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Получение кроватей комнаты

```bash
curl -X GET http://localhost:3000/api/beds/room/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Ответ:
{
  "beds": [
    {
      "id": 1,
      "number": "1",
      "roomId": 1,
      "isOccupied": false,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": 2,
      "number": "2",
      "roomId": 1,
      "isOccupied": true,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Получение доступных кроватей

```bash
curl -X GET http://localhost:3000/api/beds/available \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Ответ:
{
  "beds": [
    {
      "id": 1,
      "number": "1",
      "roomId": 1,
      "isOccupied": false,
      "isActive": true
    },
    {
      "id": 3,
      "number": "3",
      "roomId": 1,
      "isOccupied": false,
      "isActive": true
    }
  ]
}
```

## 📝 Работа с заявками

### Создание заявки

```bash
curl -X POST http://localhost:3000/api/applications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dormitoryId": 1,
    "floorId": 2,
    "roomId": 5,
    "bedId": 10,
    "reason": "Заселение в общежитие"
  }'

# Ответ:
{
  "id": 1,
  "userId": 1,
  "dormitoryId": 1,
  "floorId": 2,
  "roomId": 5,
  "bedId": 10,
  "reason": "Заселение в общежитие",
  "status": "pending",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### Получение заявок пользователя

```bash
curl -X GET http://localhost:3000/api/applications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Ответ:
{
  "applications": [
    {
      "id": 1,
      "userId": 1,
      "dormitoryId": 1,
      "floorId": 2,
      "roomId": 5,
      "bedId": 10,
      "reason": "Заселение в общежитие",
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Одобрение заявки (админ)

```bash
curl -X PUT http://localhost:3000/api/applications/1/approve \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"

# Ответ:
{
  "id": 1,
  "userId": 1,
  "dormitoryId": 1,
  "floorId": 2,
  "roomId": 5,
  "bedId": 10,
  "reason": "Заселение в общежитие",
  "status": "approved",
  "adminComment": "Одобрено",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:35:00.000Z"
}
```

### Отклонение заявки (админ)

```bash
curl -X PUT http://localhost:3000/api/applications/1/reject \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Недостаточно документов"
  }'

# Ответ:
{
  "id": 1,
  "userId": 1,
  "dormitoryId": 1,
  "floorId": 2,
  "roomId": 5,
  "bedId": 10,
  "reason": "Заселение в общежитие",
  "status": "rejected",
  "adminComment": "Недостаточно документов",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:35:00.000Z"
}
```

## 👤 Работа с профилем

### Получение профиля

```bash
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Ответ:
{
  "id": 1,
  "username": "student123",
  "firstName": "Иван",
  "lastName": "Иванов",
  "middleName": "Иванович",
  "contact": "student@gubkin.ru",
  "role": "student",
  "course": 2,
  "gender": "male",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### Обновление профиля

```bash
curl -X PUT http://localhost:3000/api/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Петр",
    "lastName": "Петров",
    "middleName": "Петрович"
  }'

# Ответ:
{
  "id": 1,
  "username": "student123",
  "firstName": "Петр",
  "lastName": "Петров",
  "middleName": "Петрович",
  "contact": "student@gubkin.ru",
  "role": "student",
  "course": 2,
  "gender": "male",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:40:00.000Z"
}
```

## 📁 Работа с файлами

### Загрузка файла

```bash
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/document.pdf"

# Ответ:
{
  "filename": "document_20240115_104500.pdf",
  "url": "/uploads/document_20240115_104500.pdf",
  "size": 1024000
}
```

### Получение файла

```bash
curl -X GET http://localhost:3000/api/files/document_20240115_104500.pdf \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output downloaded_file.pdf
```

## 🛠 JavaScript/Node.js примеры

### Аутентификация

```javascript
const axios = require('axios');

class GubkinAPI {
  constructor(baseURL = 'http://localhost:3000/api') {
    this.baseURL = baseURL;
    this.token = null;
  }

  async login(contact, password) {
    try {
      const response = await axios.post(`${this.baseURL}/auth/login`, {
        contact,
        password
      });
      
      this.token = response.data.accessToken;
      return response.data;
    } catch (error) {
      throw new Error(`Ошибка входа: ${error.response?.data?.error || error.message}`);
    }
  }

  async register(contact, code, username, password) {
    try {
      const response = await axios.post(`${this.baseURL}/auth/register`, {
        contact,
        code,
        username,
        password
      });
      
      this.token = response.data.accessToken;
      return response.data;
    } catch (error) {
      throw new Error(`Ошибка регистрации: ${error.response?.data?.error || error.message}`);
    }
  }

  getAuthHeaders() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  async getDormitories() {
    try {
      const response = await axios.get(`${this.baseURL}/dormitories`, {
        headers: this.getAuthHeaders()
      });
      return response.data;
    } catch (error) {
      throw new Error(`Ошибка получения общежитий: ${error.response?.data?.error || error.message}`);
    }
  }

  async createApplication(dormitoryId, floorId, roomId, bedId, reason) {
    try {
      const response = await axios.post(`${this.baseURL}/applications`, {
        dormitoryId,
        floorId,
        roomId,
        bedId,
        reason
      }, {
        headers: this.getAuthHeaders()
      });
      return response.data;
    } catch (error) {
      throw new Error(`Ошибка создания заявки: ${error.response?.data?.error || error.message}`);
    }
  }

  async uploadFile(filePath) {
    try {
      const FormData = require('form-data');
      const fs = require('fs');
      
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      
      const response = await axios.post(`${this.baseURL}/files/upload`, form, {
        headers: {
          ...this.getAuthHeaders(),
          ...form.getHeaders()
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Ошибка загрузки файла: ${error.response?.data?.error || error.message}`);
    }
  }
}

// Пример использования
async function example() {
  const api = new GubkinAPI();
  
  try {
    // Вход в систему
    await api.login('student@gubkin.ru', 'password123');
    console.log('Успешный вход');
    
    // Получение общежитий
    const dormitories = await api.getDormitories();
    console.log('Общежития:', dormitories);
    
    // Создание заявки
    const application = await api.createApplication(1, 2, 5, 10, 'Заселение');
    console.log('Заявка создана:', application);
    
    // Загрузка файла
    const fileResult = await api.uploadFile('./document.pdf');
    console.log('Файл загружен:', fileResult);
    
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
}

example();
```

## 🐍 Python примеры

### Аутентификация

```python
import requests
import json

class GubkinAPI:
    def __init__(self, base_url='http://localhost:3000/api'):
        self.base_url = base_url
        self.token = None
    
    def login(self, contact, password):
        try:
            response = requests.post(f'{self.base_url}/auth/login', json={
                'contact': contact,
                'password': password
            })
            response.raise_for_status()
            
            data = response.json()
            self.token = data['accessToken']
            return data
        except requests.exceptions.RequestException as e:
            raise Exception(f'Ошибка входа: {e}')
    
    def register(self, contact, code, username, password):
        try:
            response = requests.post(f'{self.base_url}/auth/register', json={
                'contact': contact,
                'code': code,
                'username': username,
                'password': password
            })
            response.raise_for_status()
            
            data = response.json()
            self.token = data['accessToken']
            return data
        except requests.exceptions.RequestException as e:
            raise Exception(f'Ошибка регистрации: {e}')
    
    def get_auth_headers(self):
        return {'Authorization': f'Bearer {self.token}'} if self.token else {}
    
    def get_dormitories(self):
        try:
            response = requests.get(f'{self.base_url}/dormitories', 
                                  headers=self.get_auth_headers())
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f'Ошибка получения общежитий: {e}')
    
    def create_application(self, dormitory_id, floor_id, room_id, bed_id, reason):
        try:
            response = requests.post(f'{self.base_url}/applications', json={
                'dormitoryId': dormitory_id,
                'floorId': floor_id,
                'roomId': room_id,
                'bedId': bed_id,
                'reason': reason
            }, headers=self.get_auth_headers())
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f'Ошибка создания заявки: {e}')
    
    def upload_file(self, file_path):
        try:
            with open(file_path, 'rb') as f:
                files = {'file': f}
                response = requests.post(f'{self.base_url}/files/upload',
                                       files=files,
                                       headers=self.get_auth_headers())
                response.raise_for_status()
                return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f'Ошибка загрузки файла: {e}')

# Пример использования
def example():
    api = GubkinAPI()
    
    try:
        # Вход в систему
        api.login('student@gubkin.ru', 'password123')
        print('Успешный вход')
        
        # Получение общежитий
        dormitories = api.get_dormitories()
        print('Общежития:', json.dumps(dormitories, indent=2, ensure_ascii=False))
        
        # Создание заявки
        application = api.create_application(1, 2, 5, 10, 'Заселение')
        print('Заявка создана:', json.dumps(application, indent=2, ensure_ascii=False))
        
        # Загрузка файла
        file_result = api.upload_file('./document.pdf')
        print('Файл загружен:', json.dumps(file_result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        print(f'Ошибка: {e}')

if __name__ == '__main__':
    example()
```

## 🔧 Обработка ошибок

### Примеры ошибок и их обработка

```javascript
// Ошибка аутентификации
{
  "error": "Неверные учетные данные"
}

// Ошибка валидации
{
  "error": "Ошибка валидации",
  "details": {
    "contact": "Неверный формат email",
    "password": "Пароль должен содержать минимум 8 символов"
  }
}

// Ошибка доступа
{
  "error": "Доступ запрещен"
}

// Ошибка сервера
{
  "error": "Внутренняя ошибка сервера"
}
```

### Обработка в JavaScript

```javascript
async function handleAPIError(error) {
  if (error.response) {
    // Сервер ответил с ошибкой
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        console.error('Ошибка валидации:', data.error);
        break;
      case 401:
        console.error('Ошибка аутентификации:', data.error);
        // Перенаправление на страницу входа
        break;
      case 403:
        console.error('Доступ запрещен:', data.error);
        break;
      case 404:
        console.error('Ресурс не найден:', data.error);
        break;
      case 429:
        console.error('Слишком много запросов:', data.error);
        break;
      case 500:
        console.error('Ошибка сервера:', data.error);
        break;
      default:
        console.error('Неизвестная ошибка:', data.error);
    }
  } else if (error.request) {
    // Запрос был отправлен, но ответ не получен
    console.error('Ошибка сети:', error.message);
  } else {
    // Ошибка при настройке запроса
    console.error('Ошибка запроса:', error.message);
  }
}
```

## 📊 Тестирование API

### Postman коллекция

Создайте коллекцию в Postman со следующими запросами:

1. **Auth - Login**
   - Method: POST
   - URL: `{{baseUrl}}/auth/login`
   - Body: `{"contact": "student@gubkin.ru", "password": "password123"}`

2. **Dormitories - Get All**
   - Method: GET
   - URL: `{{baseUrl}}/dormitories`
   - Headers: `Authorization: Bearer {{token}}`

3. **Applications - Create**
   - Method: POST
   - URL: `{{baseUrl}}/applications`
   - Headers: `Authorization: Bearer {{token}}`
   - Body: `{"dormitoryId": 1, "floorId": 2, "roomId": 5, "bedId": 10, "reason": "Заселение"}`

### Переменные окружения

```json
{
  "baseUrl": "http://localhost:3000/api",
  "token": ""
}
```

---

**Российский государственный университет нефти и газа имени И.М. Губкина**  
🏠 Система управления общежитиями 