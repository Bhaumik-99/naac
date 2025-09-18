const express = require('express');
const {
  saveCriteriaData,
  getCriteriaData,
  getAllUsersWithData,
  getSchoolData,
  submitCriteriaData
} = require('../controllers/criteriaController');
const auth = require('../middleware/auth');
const { roleAuth, schoolAuth } = require('../middleware/roleAuth');

const router = express.Router();

// All routes are protected
router.use(auth);

router.post('/save', saveCriteriaData);
router.get('/admin/users', roleAuth(['admin']), getAllUsersWithData);
router.get('/school/:school', roleAuth(['admin']), getSchoolData);
router.put('/submit/:id', submitCriteriaData);
router.get('/:criteriaNumber', getCriteriaData);

module.exports = router;

