import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_FILE = path.join(__dirname, 'requestHistory.json');
const MAX_HISTORY_SIZE = 10;

// Структура записи истории запроса
/**
 * @typedef {Object} RequestHistoryItem
 * @property {string} id - Уникальный ID запроса
 * @property {string} url - URL запроса
 * @property {string} method - HTTP метод
 * @property {Object} requestData - Данные запроса
 * @property {Object} responseData - Данные ответа
 * @property {number} timestamp - Время выполнения запроса
 * @property {number} responseTime - Время ответа в мс
 * @property {boolean} success - Успешность запроса
 * @property {string} description - Описание запроса (опционально)
 */

class RequestHistoryManager {
    constructor() {
        this.history = this.loadHistory();
    }

    /**
     * Загружает историю запросов из файла
     * @returns {RequestHistoryItem[]}
     */
    loadHistory() {
        try {
            if (fs.existsSync(HISTORY_FILE)) {
                const data = fs.readFileSync(HISTORY_FILE, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Ошибка загрузки истории запросов:', error);
        }
        return [];
    }

    /**
     * Сохраняет историю запросов в файл
     */
    saveHistory() {
        try {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2), 'utf8');
        } catch (error) {
            console.error('Ошибка сохранения истории запросов:', error);
        }
    }

    /**
     * Добавляет успешный запрос в историю
     * @param {Object} requestInfo - Информация о запросе
     * @param {string} requestInfo.url - URL запроса
     * @param {string} requestInfo.method - HTTP метод
     * @param {Object} requestInfo.data - Данные запроса
     * @param {Object} requestInfo.response - Ответ сервера
     * @param {number} requestInfo.responseTime - Время ответа в мс
     * @param {string} requestInfo.description - Описание запроса
     */
    addSuccessfulRequest(requestInfo) {
        const historyItem = {
            id: this.generateId(),
            url: requestInfo.url,
            method: requestInfo.method,
            requestData: requestInfo.data,
            responseData: requestInfo.response,
            timestamp: Date.now(),
            responseTime: requestInfo.responseTime,
            success: true,
            description: requestInfo.description || this.generateDescription(requestInfo)
        };

        // Добавляем в начало списка
        this.history.unshift(historyItem);

        // Ограничиваем размер истории
        if (this.history.length > MAX_HISTORY_SIZE) {
            this.history = this.history.slice(0, MAX_HISTORY_SIZE);
        }

        this.saveHistory();
        return historyItem;
    }

    /**
     * Получает историю запросов
     * @param {number} limit - Максимальное количество записей
     * @returns {RequestHistoryItem[]}
     */
    getHistory(limit = MAX_HISTORY_SIZE) {
        return this.history.slice(0, limit);
    }

    /**
     * Получает запрос по ID
     * @param {string} id - ID запроса
     * @returns {RequestHistoryItem|null}
     */
    getRequestById(id) {
        return this.history.find(item => item.id === id) || null;
    }

    /**
     * Удаляет запрос из истории
     * @param {string} id - ID запроса
     * @returns {boolean} - Успешность удаления
     */
    removeRequest(id) {
        const index = this.history.findIndex(item => item.id === id);
        if (index !== -1) {
            this.history.splice(index, 1);
            this.saveHistory();
            return true;
        }
        return false;
    }

    /**
     * Очищает всю историю
     */
    clearHistory() {
        this.history = [];
        this.saveHistory();
    }

    /**
     * Генерирует уникальный ID для запроса
     * @returns {string}
     */
    generateId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Генерирует описание запроса на основе его параметров
     * @param {Object} requestInfo - Информация о запросе
     * @returns {string}
     */
    generateDescription(requestInfo) {
        const urlParts = requestInfo.url.split('/');
        const endpoint = urlParts[urlParts.length - 1];
        
        // Попытка определить тип операции по URL
        if (requestInfo.url.includes('/person/')) {
            if (requestInfo.url.includes('/add')) return 'Добавление пользователя';
            if (requestInfo.url.includes('/update')) return 'Обновление пользователя';
            if (requestInfo.url.includes('/delete')) return 'Удаление пользователя';
            if (requestInfo.url.includes('/list')) return 'Получение списка пользователей';
            return 'Операция с пользователями';
        }
        
        if (requestInfo.url.includes('/device/')) {
            if (requestInfo.url.includes('/list')) return 'Получение списка устройств';
            if (requestInfo.url.includes('/query')) return 'Запрос устройств';
            return 'Операция с устройствами';
        }
        
        if (requestInfo.url.includes('/event/')) {
            return 'Запрос событий';
        }
        
        if (requestInfo.url.includes('/acs/')) {
            return 'Операция с системой контроля доступа';
        }
        
        return `${requestInfo.method} ${endpoint}`;
    }

    /**
     * Получает статистику по истории запросов
     * @returns {Object}
     */
    getStatistics() {
        const total = this.history.length;
        const successful = this.history.filter(item => item.success).length;
        const failed = total - successful;
        const avgResponseTime = total > 0 
            ? this.history.reduce((sum, item) => sum + item.responseTime, 0) / total 
            : 0;

        const methods = {};
        this.history.forEach(item => {
            methods[item.method] = (methods[item.method] || 0) + 1;
        });

        return {
            total,
            successful,
            failed,
            avgResponseTime: Math.round(avgResponseTime),
            methods,
            lastRequest: this.history[0]?.timestamp || null
        };
    }
}

// Создаем единственный экземпляр менеджера истории
const requestHistoryManager = new RequestHistoryManager();

export default requestHistoryManager;
