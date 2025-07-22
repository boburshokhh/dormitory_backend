const express = require('express')
const router = express.Router()

// Страница приветствия API
router.get('/', (req, res) => {
  const welcomeData = {
    title: '🏠 API Системы управления общежитиями ГУБКИН',
    description: 'Backend API для системы управления общежитиями Российского государственного университета нефти и газа имени И.М. Губкина',
    version: '1.0.0',
    status: 'active',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      auth: {
        description: 'Аутентификация и авторизация',
        routes: [
          'POST /api/auth/register-request - Запрос кода подтверждения',
          'POST /api/auth/register - Регистрация',
          'POST /api/auth/login - Вход в систему',
          'POST /api/auth/refresh - Обновление токена',
          'POST /api/auth/logout - Выход из системы',
          'POST /api/auth/forgot-password - Запрос сброса пароля',
          'POST /api/auth/reset-password - Сброс пароля'
        ]
      },
      dormitories: {
        description: 'Управление общежитиями',
        routes: [
          'GET /api/dormitories - Получить все общежития',
          'GET /api/dormitories/available - Доступные общежития',
          'GET /api/dormitories/:id - Информация об общежитии',
          'POST /api/dormitories - Создать общежитие (админ)',
          'PUT /api/dormitories/:id - Обновить общежитие (админ)',
          'DELETE /api/dormitories/:id - Удалить общежитие (админ)'
        ]
      },
      structure: {
        description: 'Структура общежитий',
        routes: [
          'GET /api/floors - Этажи',
          'GET /api/blocks - Блоки',
          'GET /api/rooms - Комнаты',
          'GET /api/beds - Кровати',
          'GET /api/structure - Полная структура'
        ]
      },
      applications: {
        description: 'Заявки на заселение',
        routes: [
          'GET /api/applications - Получить заявки',
          'POST /api/applications - Создать заявку',
          'PUT /api/applications/:id/approve - Одобрить заявку (админ)',
          'PUT /api/applications/:id/reject - Отклонить заявку (админ)'
        ]
      },
      users: {
        description: 'Управление пользователями',
        routes: [
          'GET /api/users - Получить пользователей (админ)',
          'GET /api/users/:id - Получить пользователя',
          'PUT /api/users/:id - Обновить пользователя',
          'DELETE /api/users/:id - Удалить пользователя (админ)'
        ]
      },
      profile: {
        description: 'Профиль пользователя',
        routes: [
          'GET /api/profile - Получить профиль',
          'PUT /api/profile - Обновить профиль',
          'POST /api/profile/change-password - Изменить пароль'
        ]
      },
      files: {
        description: 'Управление файлами',
        routes: [
          'POST /api/files/upload - Загрузить файл',
          'GET /api/files/:filename - Получить файл',
          'DELETE /api/files/:filename - Удалить файл'
        ]
      },
      system: {
        description: 'Системные маршруты',
        routes: [
          'GET /api/health - Проверка состояния',
          'GET /api/logs - Логи (админ)',
          'GET /api/groups - Группы'
        ]
      }
    },
    authentication: {
      type: 'JWT Bearer Token',
      header: 'Authorization: Bearer <your_jwt_token>',
      note: 'Все защищенные маршруты требуют JWT токен в заголовке Authorization'
    },
    rate_limiting: {
      window: '15 минут',
      max_requests: '1000 запросов с одного IP',
      message: 'Слишком много запросов с этого IP, попробуйте позже.'
    },
    cors: {
      allowed_origins: [
        'http://localhost:5173',
        'https://dormitory-gubkin.netlify.app'
      ],
      credentials: true
    },
    documentation: {
      readme: '/README.md',
      github: 'https://github.com/gubkin-university/dormitory-management',
      issues: 'https://github.com/gubkin-university/dormitory-management/issues'
    },
    contact: {
      university: 'Российский государственный университет нефти и газа имени И.М. Губкина',
      email: 'support@gubkin.ru',
      website: 'https://www.gubkin.ru'
    }
  }

  // Если запрос с заголовком Accept: application/json, возвращаем JSON
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json(welcomeData)
  }

  // Иначе возвращаем HTML страницу
  const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${welcomeData.title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 40px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            color: #2c3e50;
            margin-bottom: 10px;
        }
        
        .header .description {
            font-size: 1.2em;
            color: #7f8c8d;
            margin-bottom: 20px;
        }
        
        .status {
            display: inline-block;
            background: #27ae60;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9em;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .info-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 10px;
            padding: 25px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .info-card h3 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 1.3em;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        
        .endpoint-group {
            margin-bottom: 20px;
        }
        
        .endpoint-group h4 {
            color: #34495e;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        .endpoint-list {
            list-style: none;
        }
        
        .endpoint-list li {
            background: #f8f9fa;
            margin: 5px 0;
            padding: 8px 12px;
            border-radius: 5px;
            border-left: 4px solid #3498db;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        
        .auth-info {
            background: #e8f4fd;
            border: 1px solid #3498db;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
        }
        
        .auth-info h4 {
            color: #2980b9;
            margin-bottom: 10px;
        }
        
        .code-block {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 12px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            margin: 10px 0;
            overflow-x: auto;
        }
        
        .contact-info {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 10px;
            padding: 25px;
            text-align: center;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .contact-info h3 {
            color: #2c3e50;
            margin-bottom: 15px;
        }
        
        .contact-info p {
            margin: 5px 0;
            color: #7f8c8d;
        }
        
        .contact-info a {
            color: #3498db;
            text-decoration: none;
        }
        
        .contact-info a:hover {
            text-decoration: underline;
        }
        
        .footer {
            text-align: center;
            margin-top: 30px;
            color: rgba(255, 255, 255, 0.8);
        }
        
        @media (max-width: 768px) {
            .header h1 {
                font-size: 2em;
            }
            
            .info-grid {
                grid-template-columns: 1fr;
            }
            
            .container {
                padding: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${welcomeData.title}</h1>
            <p class="description">${welcomeData.description}</p>
            <div class="status">Статус: ${welcomeData.status.toUpperCase()}</div>
        </div>
        
        <div class="info-grid">
            <div class="info-card">
                <h3>🔐 Аутентификация</h3>
                <div class="auth-info">
                    <h4>Тип аутентификации:</h4>
                    <p>${welcomeData.authentication.type}</p>
                    <h4>Заголовок:</h4>
                    <div class="code-block">${welcomeData.authentication.header}</div>
                    <p><em>${welcomeData.authentication.note}</em></p>
                </div>
            </div>
            
            <div class="info-card">
                <h3>⚡ Ограничения</h3>
                <p><strong>Окно:</strong> ${welcomeData.rate_limiting.window}</p>
                <p><strong>Максимум запросов:</strong> ${welcomeData.rate_limiting.max_requests}</p>
                <p><strong>Сообщение:</strong> ${welcomeData.rate_limiting.message}</p>
            </div>
        </div>
        
        <div class="info-card">
            <h3>📚 Доступные API Endpoints</h3>
            ${Object.entries(welcomeData.endpoints).map(([key, endpoint]) => `
                <div class="endpoint-group">
                    <h4>${endpoint.description}</h4>
                    <ul class="endpoint-list">
                        ${endpoint.routes.map(route => `<li>${route}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>
        
        <div class="contact-info">
            <h3>📞 Контактная информация</h3>
            <p><strong>Университет:</strong> ${welcomeData.contact.university}</p>
            <p><strong>Email:</strong> <a href="mailto:${welcomeData.contact.email}">${welcomeData.contact.email}</a></p>
            <p><strong>Веб-сайт:</strong> <a href="${welcomeData.contact.website}" target="_blank">${welcomeData.contact.website}</a></p>
            <p><strong>GitHub:</strong> <a href="${welcomeData.documentation.github}" target="_blank">${welcomeData.documentation.github}</a></p>
        </div>
        
        <div class="footer">
            <p>Версия: ${welcomeData.version} | Окружение: ${welcomeData.environment} | Время: ${new Date(welcomeData.timestamp).toLocaleString('ru-RU')}</p>
        </div>
    </div>
</body>
</html>`

  res.send(html)
})

module.exports = router 