const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Простые CRUD операции для этажей
// Основная логика в /api/structure

module.exports = router; 