const { query, transaction } = require('../config/database')
const { getFileUrl } = require('../config/fileStorage')
const { DORMITORY_TYPES } = require('../constants/applicationConstants')
const {
  buildApplicationFilters,
  buildOrderByClause,
  buildPaginationClause,
  QUERIES,
} = require('../utils/queryBuilder')
const {
  createNotFoundError,
  createPermissionError,
  createBusinessLogicError,
  createDatabaseError,
} = require('../utils/errorHandler')

class ApplicationsService {
  // Получение списка заявок с фильтрацией
  async getApplicationsList(userRole, userId, filters, pagination) {
    try {
      const { whereClause, params, paramCount } = buildApplicationFilters(userRole, userId, filters)
      const { pageNum, limitNum, sortBy, sortOrder } = pagination
      const offset = (pageNum - 1) * limitNum

      const orderClause = buildOrderByClause(sortBy, sortOrder)
      const { clause: paginationClause, params: paginationParams } = buildPaginationClause(
        limitNum,
        offset,
        paramCount,
      )

      // Получаем список заявок
      const result = await query(
        `${QUERIES.GET_APPLICATIONS_LIST} ${whereClause} ${orderClause} ${paginationClause}`,
        [...params, ...paginationParams],
      )

      // Подсчет общего количества
      const countResult = await query(`${QUERIES.COUNT_APPLICATIONS} ${whereClause}`, params)

      const applications = result.rows.map(this.formatApplicationListItem)
      const total = parseInt(countResult.rows[0].total)

      return {
        applications,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum * limitNum < total,
          hasPrevPage: pageNum > 1,
        },
      }
    } catch (error) {
      throw createDatabaseError('Ошибка получения списка заявок', 'applications', error)
    }
  }

  // Получение детальной информации о заявке
  async getApplicationDetail(applicationId, userRole, userId) {
    try {
      const result = await query(QUERIES.GET_APPLICATION_DETAIL, [applicationId])

      if (result.rows.length === 0) {
        throw createNotFoundError('Заявка', applicationId)
      }

      const app = result.rows[0]

      // Проверяем права доступа для студентов
      if (userRole === 'student' && app.student_id !== userId) {
        throw createPermissionError('просмотр чужих заявок')
      }

      // Получаем файлы пользователя
      const filesResult = await query(QUERIES.GET_USER_FILES, [app.student_id])

      const files = await Promise.all(
        filesResult.rows.map(async (file) => {
          let fileUrl = null
          try {
            fileUrl = await getFileUrl(file.file_name, 3600) // 1 час
          } catch (error) {
            console.error(`🚨 Ошибка получения URL для файла ${file.file_name}:`, error.message)
          }

          return this.formatFileItem(file, fileUrl)
        }),
      )

      return this.formatApplicationDetail(app, files)
    } catch (error) {
      if (error.type) throw error // Если это уже ApplicationError
      throw createDatabaseError(
        'Ошибка получения детальной информации о заявке',
        'applications',
        error,
      )
    }
  }

  // Создание новой заявки
  async createApplication(userId, applicationData) {
    try {
      return await transaction(async (client) => {
        const { dormitoryId, preferredRoomType, academicYear, semester, documents, notes } =
          applicationData

        // Проверяем наличие активной заявки
        await this.checkExistingApplication(client, userId, academicYear, semester)

        // Получаем и проверяем информацию о студенте
        const studentInfo = await this.getStudentInfo(client, userId)

        // Проверяем общежитие если указано
        if (dormitoryId) {
          await this.validateDormitoryForStudent(
            client,
            dormitoryId,
            studentInfo,
            academicYear,
            semester,
          )
        }

        // Создаем заявку
        const applicationResult = await client.query(QUERIES.CREATE_APPLICATION, [
          userId,
          dormitoryId || null,
          preferredRoomType || null,
          academicYear,
          semester,
          JSON.stringify(documents || []),
          notes || null,
        ])

        return applicationResult.rows[0]
      })
    } catch (error) {
      if (error.type) throw error // Если это уже ApplicationError
      throw createDatabaseError('Ошибка создания заявки', 'applications', error)
    }
  }

  // Обновление заявки
  async updateApplication(applicationId, userId, userRole, updateData) {
    try {
      return await transaction(async (client) => {
        // Получаем заявку
        const application = await this.getApplicationForUpdate(
          client,
          applicationId,
          userId,
          userRole,
        )

        // Проверяем общежитие если указано и изменилось
        if (updateData.dormitoryId && updateData.dormitoryId !== application.dormitory_id) {
          await this.validateDormitoryExists(client, updateData.dormitoryId)
        }

        // Обновляем заявку
        const updateResult = await client.query(QUERIES.UPDATE_APPLICATION, [
          updateData.dormitoryId !== undefined ? updateData.dormitoryId : application.dormitory_id,
          updateData.preferredRoomType !== undefined
            ? updateData.preferredRoomType
            : application.preferred_room_type,
          updateData.documents !== undefined
            ? JSON.stringify(updateData.documents)
            : application.documents,
          updateData.notes !== undefined ? updateData.notes : application.notes,
          applicationId,
        ])

        return updateResult.rows[0]
      })
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка обновления заявки', 'applications', error)
    }
  }

  // Рассмотрение заявки
  async reviewApplication(applicationId, reviewerId, reviewData) {
    try {
      return await transaction(async (client) => {
        const { status, rejectionReason, notes, priorityScore } = reviewData

        // Проверяем заявку
        const application = await this.getApplicationForReview(client, applicationId)

        // Если одобряем заявку, проверяем доступность мест
        if (status === 'approved' && application.dormitory_id) {
          await this.checkDormitoryCapacity(
            client,
            application.dormitory_id,
            application.academic_year,
            application.semester,
          )
        }

        // Обновляем заявку
        const updateResult = await client.query(QUERIES.REVIEW_APPLICATION, [
          status,
          reviewerId,
          rejectionReason,
          notes,
          priorityScore,
          applicationId,
        ])

        return {
          ...updateResult.rows[0],
          studentInfo: {
            firstName: application.first_name,
            lastName: application.last_name,
            email: application.email,
          },
        }
      })
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка рассмотрения заявки', 'applications', error)
    }
  }

  // Отзыв заявки
  async cancelApplication(applicationId, userId, userRole) {
    try {
      return await transaction(async (client) => {
        // Получаем заявку
        const application = await this.getApplicationForCancel(
          client,
          applicationId,
          userId,
          userRole,
        )

        // Обновляем статус на отозванную
        const updateResult = await client.query(QUERIES.CANCEL_APPLICATION, [applicationId])

        return updateResult.rows[0]
      })
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка отзыва заявки', 'applications', error)
    }
  }

  // Массовое рассмотрение заявок
  async bulkReviewApplications(applicationIds, reviewerId, reviewData) {
    try {
      return await transaction(async (client) => {
        const { action, rejectionReason, notes } = reviewData
        const successfulIds = []
        const failedIds = []

        for (const appId of applicationIds) {
          try {
            // Проверяем заявку
            const appResult = await client.query(
              'SELECT id, status, student_id FROM applications WHERE id = $1 AND status = $2',
              [appId, 'submitted'],
            )

            if (appResult.rows.length === 0) {
              failedIds.push({ id: appId, reason: 'Заявка не найдена или уже обработана' })
              continue
            }

            // Обновляем заявку
            await client.query(QUERIES.REVIEW_APPLICATION, [
              action,
              reviewerId,
              rejectionReason,
              notes,
              0, // priority_score по умолчанию
              appId,
            ])

            successfulIds.push(appId)
          } catch (error) {
            failedIds.push({ id: appId, reason: error.message })
          }
        }

        return { successfulIds, failedIds }
      })
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка массового рассмотрения заявок', 'applications', error)
    }
  }

  // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

  async checkExistingApplication(client, studentId, academicYear, semester) {
    const existingApplication = await client.query(QUERIES.CHECK_EXISTING_APPLICATION, [
      studentId,
      academicYear,
      semester,
    ])

    if (existingApplication.rows.length > 0) {
      const existing = existingApplication.rows[0]
      throw createBusinessLogicError(
        `У вас уже есть ${existing.status === 'submitted' ? 'поданная' : 'одобренная'} заявка на этот период`,
        'DUPLICATE_APPLICATION',
        { existingApplicationId: existing.id, existingStatus: existing.status },
      )
    }
  }

  async getStudentInfo(client, studentId) {
    const userResult = await client.query(QUERIES.GET_STUDENT_INFO_DETAILED, [studentId])

    if (userResult.rows.length === 0) {
      throw createNotFoundError('Студент не найден или неактивен')
    }

    const user = userResult.rows[0]
    const { course, gender, is_profile_filled } = user

    // Проверяем, заполнен ли профиль автоматически
    const isProfileActuallyFilled = this.checkProfileCompleteness(user)

    // Если профиль заполнен, но флаг не установлен, обновляем его
    if (isProfileActuallyFilled && !is_profile_filled) {
      await client.query(
        'UPDATE users SET is_profile_filled = true, updated_at = NOW() WHERE id = $1',
        [studentId],
      )
      console.log(`✅ Профиль пользователя ${studentId} автоматически помечен как заполненный`)
    }

    // Проверяем заполненность профиля
    if (!isProfileActuallyFilled) {
      throw createBusinessLogicError(
        'Необходимо заполнить профиль перед подачей заявки. Заполните все обязательные поля: имя, фамилия, отчество, дата рождения, пол, регион, адрес, телефон, телефон родителя, серия паспорта, ПИНФЛ, курс, группа.',
        'PROFILE_NOT_FILLED',
      )
    }

    return { course, gender, isProfileFilled: true }
  }

  // Проверка заполненности профиля
  checkProfileCompleteness(user) {
    const requiredFields = [
      'first_name',
      'last_name',
      'middle_name',
      'birth_date',
      'gender',
      'region',
      'address',
      'phone',
      'parent_phone',
      'passport_series',
      'passport_pinfl',
      'course',
      'group_id',
    ]

    return requiredFields.every((field) => {
      const value = user[field]
      return value !== null && value !== undefined && value !== ''
    })
  }

  async validateDormitoryForStudent(client, dormitoryId, studentInfo, academicYear, semester) {
    const { course, gender } = studentInfo

    // Определяем доступные типы общежитий
    let availableTypes = []

    if (course === 1 && gender === 'female') {
      availableTypes = [DORMITORY_TYPES.TYPE_1]
    } else if (course >= 2 && course <= 5) {
      availableTypes = [DORMITORY_TYPES.TYPE_2]
    }

    if (availableTypes.length === 0) {
      throw createBusinessLogicError(
        'Нет доступных общежитий для вашего курса и пола',
        'NO_AVAILABLE_DORMITORIES',
        { course, gender },
      )
    }

    // Проверяем общежитие
    const dormitoryResult = await client.query(
      'SELECT id, type FROM dormitories WHERE id = $1 AND is_active = true AND type = ANY($2)',
      [dormitoryId, availableTypes],
    )

    if (dormitoryResult.rows.length === 0) {
      let message = 'Выбранное общежитие недоступно для вас. '
      if (course === 1 && gender === 'female') {
        message += 'Студенты 1 курса (девочки) могут выбрать только ДПС 1.'
      } else if (course >= 2 && course <= 5) {
        message += 'Студенты 2-5 курса могут выбрать только ДПС 2.'
      }
      throw createBusinessLogicError(message, 'DORMITORY_NOT_AVAILABLE', {
        course,
        gender,
        dormitoryId,
      })
    }

    // Проверяем заполненность
    await this.checkDormitoryCapacity(client, dormitoryId, academicYear, semester)
  }

  async checkDormitoryCapacity(client, dormitoryId, academicYear, semester) {
    // Получаем вместимость
    const capacityResult = await client.query(QUERIES.GET_DORMITORY_CAPACITY, [dormitoryId])
    const totalCapacity = parseInt(capacityResult.rows[0].total_capacity || 0)

    if (totalCapacity === 0) {
      throw createBusinessLogicError(
        'В выбранном общежитии нет доступных мест',
        'NO_BEDS_AVAILABLE',
        { dormitoryId },
      )
    }

    // Получаем текущую заполненность
    const occupancyResult = await client.query(QUERIES.GET_DORMITORY_OCCUPANCY, [
      dormitoryId,
      academicYear,
      semester,
    ])
    const currentOccupancy = parseInt(occupancyResult.rows[0].current_occupancy)

    if (currentOccupancy >= totalCapacity) {
      throw createBusinessLogicError('В выбранном общежитии нет свободных мест', 'DORMITORY_FULL', {
        dormitoryId,
        totalCapacity,
        currentOccupancy,
      })
    }
  }

  async validateDormitoryExists(client, dormitoryId) {
    const dormitoryResult = await client.query(QUERIES.CHECK_DORMITORY, [dormitoryId])

    if (dormitoryResult.rows.length === 0 || !dormitoryResult.rows[0].is_active) {
      throw createNotFoundError('Общежитие не найдено или неактивно', dormitoryId)
    }
  }

  async getApplicationForUpdate(client, applicationId, userId, userRole) {
    const applicationResult = await client.query(
      'SELECT student_id, status, dormitory_id, preferred_room_type, documents, notes FROM applications WHERE id = $1',
      [applicationId],
    )

    if (applicationResult.rows.length === 0) {
      throw createNotFoundError('Заявка', applicationId)
    }

    const application = applicationResult.rows[0]

    // Проверяем права доступа
    if (userRole === 'student' && application.student_id !== userId) {
      throw createPermissionError('редактирование чужих заявок')
    }

    // Студенты могут изменять только поданные заявки
    if (userRole === 'student' && application.status !== 'submitted') {
      throw createBusinessLogicError(
        'Можно изменять только поданные заявки',
        'CANNOT_EDIT_PROCESSED_APPLICATION',
        { currentStatus: application.status },
      )
    }

    return application
  }

  async getApplicationForReview(client, applicationId) {
    const applicationResult = await client.query(
      `SELECT a.student_id, a.status, a.dormitory_id, a.academic_year, a.semester,
              u.first_name, u.last_name, u.email
       FROM applications a
       JOIN users u ON a.student_id = u.id
       WHERE a.id = $1`,
      [applicationId],
    )

    if (applicationResult.rows.length === 0) {
      throw createNotFoundError('Заявка', applicationId)
    }

    const application = applicationResult.rows[0]

    if (application.status !== 'submitted') {
      throw createBusinessLogicError(
        'Можно рассматривать только поданные заявки',
        'CANNOT_REVIEW_PROCESSED_APPLICATION',
        { currentStatus: application.status },
      )
    }

    return application
  }

  async getApplicationForCancel(client, applicationId, userId, userRole) {
    const applicationResult = await client.query(
      'SELECT student_id, status, academic_year, semester FROM applications WHERE id = $1',
      [applicationId],
    )

    if (applicationResult.rows.length === 0) {
      throw createNotFoundError('Заявка', applicationId)
    }

    const application = applicationResult.rows[0]

    // Проверяем права доступа
    if (userRole === 'student') {
      if (application.student_id !== userId) {
        throw createPermissionError('отзыв чужих заявок')
      }

      if (application.status === 'approved') {
        throw createBusinessLogicError(
          'Нельзя отозвать одобренную заявку',
          'CANNOT_CANCEL_APPROVED_APPLICATION',
        )
      }

      if (application.status === 'cancelled') {
        throw createBusinessLogicError('Заявка уже отозвана', 'ALREADY_CANCELLED')
      }
    }

    return application
  }

  // === ФОРМАТИРОВАНИЕ ДАННЫХ ===

  formatApplicationListItem(app) {
    return {
      id: app.id,
      status: app.status,
      submissionDate: app.submission_date,
      academicYear: app.academic_year,
      semester: app.semester,
      preferredRoomType: app.preferred_room_type,
      rejectionReason: app.rejection_reason,
      student: {
        firstName: app.first_name,
        lastName: app.last_name,
        email: app.email,
        studentId: app.student_number,
        groupName: app.group_name,
        course: app.course,
      },
      dormitory: app.dormitory_name ? { name: app.dormitory_name } : null,
    }
  }

  formatApplicationDetail(app, files) {
    return {
      id: app.id,
      student: {
        id: app.student_id,
        firstName: app.first_name,
        lastName: app.last_name,
        middleName: app.middle_name,
        email: app.email,
        phone: app.phone,
        studentId: app.student_number,
        groupName: app.group_name,
        course: app.course,
        gender: app.gender,
        birthDate: app.birth_date,
        region: app.region,
        address: app.address,
        parentPhone: app.parent_phone,
        passportSeries: app.passport_series,
        passportPinfl: app.passport_pinfl,
      },
      dormitory: app.dormitory_id
        ? {
            id: app.dormitory_id,
            name: app.dormitory_name,
            type: app.dormitory_type,
            address: app.dormitory_address,
          }
        : null,
      preferredRoomType: app.preferred_room_type,
      academicYear: app.academic_year,
      semester: app.semester,
      status: app.status,
      submissionDate: app.submission_date,
      reviewDate: app.review_date,
      reviewer: app.reviewed_by
        ? {
            firstName: app.reviewer_first_name,
            lastName: app.reviewer_last_name,
            email: app.reviewer_email,
          }
        : null,
      rejectionReason: app.rejection_reason,
      documents: Array.isArray(app.documents)
        ? app.documents
        : app.documents
          ? JSON.parse(app.documents)
          : [],
      notes: app.notes,
      priorityScore: app.priority_score,
      createdAt: app.created_at,
      updatedAt: app.updated_at,
      files: files,
    }
  }

  formatFileItem(file, fileUrl) {
    return {
      id: file.id,
      originalName: file.original_name,
      fileName: file.file_name,
      fileType: file.file_type,
      mimeType: file.mime_type,
      fileSize: file.file_size,
      status: file.status,
      isVerified: file.is_verified,
      downloadCount: file.download_count,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      publicUrl: fileUrl,
      isPublic: file.is_public,
      metadata: file.metadata,
    }
  }
}

module.exports = new ApplicationsService()
