const nodemailer = require('nodemailer')
const crypto = require('crypto')

class NotificationService {
  constructor() {
    this.setupEmailTransporter()
  }

  // Настройка email транспорта
  setupEmailTransporter() {
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mail.gubkin.uz',
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || 'dps@gubkin.uz',
        pass: process.env.SMTP_PASS || '1234bobur$',
      },
      tls: {
        rejectUnauthorized: false, // Для локальной разработки
      },
    })
  }

  // Генерация 6-значного кода
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  // Хэширование кода для безопасного хранения
  hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex')
  }

  // Отправка email с кодом
  async sendEmailCode(email, code) {
    try {
      console.log(`📧 Отправка email кода на ${email}: ${code}`)

      // В режиме разработки логируем код, но ТАКЖЕ отправляем email
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔢 [DEV MODE] Код для ${email}: ${code}`)
        console.log(`📤 [DEV MODE] Также отправляем реальный email...`)
      }

      // Проверяем настройки SMTP
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`⚠️ SMTP настройки не заданы, только логирование кода: ${code}`)
        return { success: true, messageId: 'no-smtp-config' }
      }

      const mailOptions = {
        from: `"Общежития ГУБКИН" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '🔐 Код подтверждения для входа',
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: 'Segoe UI', Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🏢 Общежития ГУБКИН</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Система управления общежитиями</p>
            </div>
            
            <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
              <h2 style="color: #333; text-align: center; margin-bottom: 30px;">Код подтверждения</h2>
              
              <div style="background: #f8f9ff; border: 2px dashed #667eea; border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0;">
                <div style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  ${code}
                </div>
                <p style="color: #666; margin: 15px 0 0 0; font-size: 14px;">Введите этот код в приложении</p>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  <strong>⚠️ Важно:</strong><br>
                  • Код действителен в течение <strong>10 минут</strong><br>
                  • Не сообщайте код третьим лицам<br>
                  • Если вы не запрашивали код, проигнорируйте это письмо
                </p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              
              <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                © 2024 Общежития ГУБКИН. Система управления проживанием студентов.<br>
                Это автоматическое письмо, не отвечайте на него.
              </p>
            </div>
          </div>
        `,
      }

      const info = await this.emailTransporter.sendMail(mailOptions)
      console.log(`✅ Email успешно отправлен на ${email}`)
      console.log(`📧 Message ID: ${info.messageId}`)
      console.log(`🔢 Код в письме: ${code}`)
      return { success: true, messageId: info.messageId }
    } catch (error) {
      console.error('❌ Ошибка отправки email на', email)
      console.error('❌ Детали ошибки:', error.message)
      console.error('❌ SMTP настройки:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        secure: process.env.SMTP_SECURE,
      })
      return { success: false, error: error.message }
    }
  }

  // Отправка SMS с кодом (заглушка для будущей интеграции)
  async sendSMSCode(phone, code) {
    try {
      console.log(`📱 Отправка SMS кода на ${phone}: ${code}`)

      // В режиме разработки просто логируем код
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔢 [DEV MODE] SMS код для ${phone}: ${code}`)
        return { success: true, messageId: 'dev-sms-mode' }
      }

      // TODO: Интеграция с SMS провайдером (например, Twilio, SMS.ru, etc.)
      // Пример для SMS.ru:
      /*
      const smsru = require('sms_ru');
      const sms = new smsru(process.env.SMS_RU_API_KEY);
      
      const result = await sms.sms_send({
        to: phone,
        msg: `Код подтверждения ГУБКИН: ${code}. Не сообщайте его никому!`,
        from: 'GUBKIN'
      });
      */

      // Пока что заглушка
      console.log(`📱 [ЗАГЛУШКА] SMS код для ${phone}: ${code}`)
      return { success: true, messageId: 'mock-sms' }
    } catch (error) {
      console.error('❌ Ошибка отправки SMS:', error)
      return { success: false, error: error.message }
    }
  }

  // Универсальная отправка кода (автоопределение типа)
  async sendVerificationCode(contact, contactType) {
    const code = this.generateVerificationCode()
    let result

    if (contactType === 'email') {
      result = await this.sendEmailCode(contact, code)
    } else if (contactType === 'phone') {
      result = await this.sendSMSCode(contact, code)
    } else {
      throw new Error('Неподдерживаемый тип контакта')
    }

    return {
      code: code,
      hashedCode: this.hashCode(code),
      result: result,
    }
  }

  // Проверка кода
  verifyCode(inputCode, hashedCode) {
    const inputHash = this.hashCode(inputCode)
    return inputHash === hashedCode
  }

  // Валидация email
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Валидация телефона (российские номера)
  isValidPhone(phone) {
    // Убираем все не-цифры
    const cleanPhone = phone.replace(/\D/g, '')

    // Проверяем российские номера: +7XXXXXXXXXX или 8XXXXXXXXXX
    const phoneRegex = /^(?:7|8)\d{10}$/
    return phoneRegex.test(cleanPhone)
  }

  // Нормализация телефона (приведение к единому формату)
  normalizePhone(phone) {
    const cleanPhone = phone.replace(/\D/g, '')

    // Конвертируем 8XXXXXXXXXX в 7XXXXXXXXXX
    if (cleanPhone.startsWith('8') && cleanPhone.length === 11) {
      return '7' + cleanPhone.substring(1)
    }

    // Если номер начинается с 7 и длина 11 цифр
    if (cleanPhone.startsWith('7') && cleanPhone.length === 11) {
      return cleanPhone
    }

    throw new Error('Неверный формат номера телефона')
  }

  // Определение типа контакта
  detectContactType(contact) {
    if (this.isValidEmail(contact)) {
      return { type: 'email', normalized: contact.toLowerCase() }
    }

    if (this.isValidPhone(contact)) {
      return { type: 'phone', normalized: this.normalizePhone(contact) }
    }

    throw new Error('Неверный формат email или телефона')
  }
}

module.exports = new NotificationService()
