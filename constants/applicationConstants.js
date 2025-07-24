// Константы для заявок на общежитие

const APPLICATION_STATUSES = {
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
}

const ROOM_TYPES = {
  SINGLE: 'single',
  DOUBLE: 'double',
  TRIPLE: 'triple',
}

const REVIEW_STATUSES = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

const DORMITORY_TYPES = {
  TYPE_1: 'type_1', // для 1 курса девочки
  TYPE_2: 'type_2', // для 2-5 курса
}

const SEMESTERS = {
  FIRST: '1',
  SECOND: '2',
  SUMMER: 'summer',
}

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_SORT_BY: 'submission_date',
  DEFAULT_SORT_ORDER: 'DESC',
}

const BULK_OPERATIONS = {
  MAX_BULK_SIZE: 50,
}

const VALID_SORT_FIELDS = ['submission_date', 'status', 'academic_year', 'priority_score']

const VALID_SORT_ORDERS = ['ASC', 'DESC']

// Массивы для валидации
const VALID_STATUSES = Object.values(APPLICATION_STATUSES)
const VALID_ROOM_TYPES = Object.values(ROOM_TYPES)
const VALID_REVIEW_STATUSES = Object.values(REVIEW_STATUSES)
const VALID_SEMESTERS = Object.values(SEMESTERS)

module.exports = {
  APPLICATION_STATUSES,
  ROOM_TYPES,
  REVIEW_STATUSES,
  DORMITORY_TYPES,
  SEMESTERS,
  PAGINATION,
  BULK_OPERATIONS,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS,
  VALID_STATUSES,
  VALID_ROOM_TYPES,
  VALID_REVIEW_STATUSES,
  VALID_SEMESTERS,
}
