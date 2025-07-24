const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { 
  authenticateToken, 
  requireAdmin, 
  requireSuperAdmin,
  validateUUID,
  logAdminAction 
} = require('../middleware/auth');

const router = express.Router();

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken);

// GET /api/users - Получить всех пользователей (только админы)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { role, course, group_name, is_active, page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Фильтры
    if (role) {
      whereClause += ` AND role = $${++paramCount}`;
      params.push(role);
    }

    if (course) {
      whereClause += ` AND course = $${++paramCount}`;
      params.push(parseInt(course));
    }

    if (group_name) {
      whereClause += ` AND group_name ILIKE $${++paramCount}`;
      params.push(`%${group_name}%`);
    }

    if (is_active !== undefined) {
      whereClause += ` AND is_active = $${++paramCount}`;
      params.push(is_active === 'true');
    }

    if (search) {
      whereClause += ` AND (first_name ILIKE $${++paramCount} OR last_name ILIKE $${paramCount} OR email ILIKE $${paramCount} OR student_id ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    const result = await query(`
      SELECT 
        id, email, first_name, last_name, middle_name, phone,
        role, student_id, group_name, course, is_active,
        email_verified, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `, [...params, limit, offset]);

    // Подсчет общего количества
    const countResult = await query(`
      SELECT COUNT(*) as total FROM users ${whereClause}
    `, params.slice(0, -2));

    const users = result.rows.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      middleName: user.middle_name,
      phone: user.phone,
      role: user.role,
      studentId: user.student_id,
      groupName: user.group_name,
      course: user.course,
      isActive: user.is_active,
      emailVerified: user.email_verified,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }));

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

// GET /api/users/:id - Получить пользователя по ID
router.get('/:id', validateUUID('id'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        id, email, first_name, last_name, middle_name, phone,
        role, student_id, group_name, course, is_active,
        email_verified, created_at, updated_at
      FROM users
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      middleName: user.middle_name,
      phone: user.phone,
      role: user.role,
      studentId: user.student_id,
      groupName: user.group_name,
      course: user.course,
      isActive: user.is_active,
      emailVerified: user.email_verified,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    });

  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
    res.status(500).json({ error: 'Ошибка получения пользователя' });
  }
});

// POST /api/users - Создать нового пользователя (только супер-админы)
router.post('/', 
  requireSuperAdmin,
  logAdminAction('create_user'),
  async (req, res) => {
    try {
      const { 
        email, 
        password, 
        firstName, 
        lastName, 
        middleName,
        phone,
        role,
        studentId,
        groupName,
        course
      } = req.body;

      // Валидация
      if (!email || !password || !firstName || !lastName || !role) {
        return res.status(400).json({ 
          error: 'Email, пароль, имя, фамилия и роль обязательны' 
        });
      }

      if (!['student', 'admin', 'super_admin'].includes(role)) {
        return res.status(400).json({ 
          error: 'Неверная роль' 
        });
      }

      if (role === 'student' && (!studentId || !groupName || !course)) {
        return res.status(400).json({ 
          error: 'Для студентов обязательны: номер студенческого билета, группа, курс' 
        });
      }

      if (password.length < 6) {
        return res.status(400).json({ 
          error: 'Пароль должен содержать минимум 6 символов' 
        });
      }

      // Проверить существование email
      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ 
          error: 'Пользователь с таким email уже существует' 
        });
      }

      // Проверить существование студенческого билета
      if (studentId) {
        const existingStudent = await query(
          'SELECT id FROM users WHERE student_id = $1',
          [studentId]
        );

        if (existingStudent.rows.length > 0) {
          return res.status(409).json({ 
            error: 'Студент с таким номером уже существует' 
          });
        }
      }

      // Хешировать пароль
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Создать пользователя
      const result = await query(`
        INSERT INTO users (
          email, password_hash, first_name, last_name, middle_name, phone,
          role, student_id, group_name, course
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, email, first_name, last_name, role, created_at
      `, [
        email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        middleName || null,
        phone || null,
        role,
        studentId || null,
        groupName || null,
        course || null
      ]);

      const user = result.rows[0];

      res.status(201).json({
        message: 'Пользователь создан',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          createdAt: user.created_at
        }
      });

    } catch (error) {
      console.error('Ошибка создания пользователя:', error);
      res.status(500).json({ error: 'Ошибка создания пользователя' });
    }
  }
);

// PUT /api/users/:id - Обновить пользователя
router.put('/:id', 
  validateUUID('id'),
  requireAdmin,
  logAdminAction('update_user'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        firstName, 
        lastName, 
        middleName,
        phone,
        studentId,
        groupName,
        course,
        isActive
      } = req.body;

      if (!firstName || !lastName) {
        return res.status(400).json({ 
          error: 'Имя и фамилия обязательны' 
        });
      }

      // Проверяем существование пользователя
      const userResult = await query(
        'SELECT role FROM users WHERE id = $1',
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      // Обновляем пользователя
      const result = await query(`
        UPDATE users 
        SET 
          first_name = $1, 
          last_name = $2, 
          middle_name = $3, 
          phone = $4,
          student_id = $5,
          group_name = $6,
          course = $7,
          is_active = $8,
          updated_at = NOW()
        WHERE id = $9
        RETURNING first_name, last_name, updated_at
      `, [
        firstName,
        lastName,
        middleName || null,
        phone || null,
        studentId || null,
        groupName || null,
        course || null,
        isActive !== undefined ? isActive : true,
        id
      ]);

      res.json({
        message: 'Пользователь обновлен',
        updatedAt: result.rows[0].updated_at
      });

    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
      res.status(500).json({ error: 'Ошибка обновления пользователя' });
    }
  }
);

// PUT /api/users/:id/role - Изменить роль пользователя (только супер-админы)
router.put('/:id/role', 
  validateUUID('id'),
  requireSuperAdmin,
  logAdminAction('change_user_role'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['student', 'admin', 'super_admin'].includes(role)) {
        return res.status(400).json({ error: 'Неверная роль' });
      }

      // Проверяем, что не меняем роль самого себя
      if (id === req.user.id) {
        return res.status(400).json({ 
          error: 'Нельзя изменить собственную роль' 
        });
      }

      const result = await query(`
        UPDATE users 
        SET role = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING email, role, updated_at
      `, [role, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const user = result.rows[0];

      res.json({
        message: `Роль пользователя ${user.email} изменена на ${role}`,
        updatedAt: user.updated_at
      });

    } catch (error) {
      console.error('Ошибка изменения роли:', error);
      res.status(500).json({ error: 'Ошибка изменения роли' });
    }
  }
);

// PUT /api/users/:id/status - Активировать/деактивировать пользователя
router.put('/:id/status', 
  validateUUID('id'),
  requireAdmin,
  logAdminAction('change_user_status'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive должно быть boolean' });
      }

      // Проверяем, что не деактивируем самого себя
      if (id === req.user.id && !isActive) {
        return res.status(400).json({ 
          error: 'Нельзя деактивировать собственный аккаунт' 
        });
      }

      const result = await query(`
        UPDATE users 
        SET is_active = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING email, is_active, updated_at
      `, [isActive, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const user = result.rows[0];

      res.json({
        message: `Пользователь ${user.email} ${isActive ? 'активирован' : 'деактивирован'}`,
        isActive: user.is_active,
        updatedAt: user.updated_at
      });

    } catch (error) {
      console.error('Ошибка изменения статуса:', error);
      res.status(500).json({ error: 'Ошибка изменения статуса' });
    }
  }
);

// PUT /api/users/:id/password - Сбросить пароль пользователя (только супер-админы)
router.put('/:id/password', 
  validateUUID('id'),
  requireSuperAdmin,
  logAdminAction('reset_user_password'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ 
          error: 'Новый пароль должен содержать минимум 6 символов' 
        });
      }

      // Хешировать новый пароль
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      const result = await query(`
        UPDATE users 
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING email, updated_at
      `, [passwordHash, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const user = result.rows[0];

      res.json({
        message: `Пароль пользователя ${user.email} сброшен`,
        updatedAt: user.updated_at
      });

    } catch (error) {
      console.error('Ошибка сброса пароля:', error);
      res.status(500).json({ error: 'Ошибка сброса пароля' });
    }
  }
);

// GET /api/users/stats - Статистика пользователей (только админы)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        role,
        COUNT(*) as count,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
      FROM users
      GROUP BY role
    `);

    const roleStats = {
      student: { total: 0, active: 0 },
      admin: { total: 0, active: 0 },
      super_admin: { total: 0, active: 0 }
    };

    result.rows.forEach(row => {
      roleStats[row.role] = {
        total: parseInt(row.count),
        active: parseInt(row.active_count)
      };
    });

    const totalUsers = Object.values(roleStats).reduce((acc, stat) => acc + stat.total, 0);
    const totalActive = Object.values(roleStats).reduce((acc, stat) => acc + stat.active, 0);

    res.json({
      roleStats,
      totalUsers,
      totalActive,
      totalInactive: totalUsers - totalActive
    });

  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

module.exports = router; 