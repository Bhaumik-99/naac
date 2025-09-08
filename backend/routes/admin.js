const express = require('express');
const auth = require('../middleware/auth');
const CriteriaData = require('../models/CriteriaData');

const router = express.Router();

// Admin middleware
const adminAuth = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error during admin authorization'
    });
  }
};

// @desc Get all files uploaded by all users
// @route GET /api/admin/files
// @access Admin only
router.get('/files', auth, adminAuth, async (req, res) => {
  try {
    const criteriaFiles = await CriteriaData.aggregate([
      {
        $match: {
          'files.0': { $exists: true }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $unwind: '$userInfo'
      },
      {
        $project: {
          criteriaNumber: 1,
          metricNumber: 1,
          files: 1,
          status: 1,
          createdAt: 1,
          user: {
            id: '$userInfo._id',
            name: '$userInfo.name',
            email: '$userInfo.email'
          }
        }
      },
      {
        $sort: {
          criteriaNumber: 1,
          'user.name': 1
        }
      }
    ]);

    res.json({
      success: true,
      data: criteriaFiles,
      count: criteriaFiles.length
    });

  } catch (error) {
    console.error('Admin files fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching files data'
    });
  }
});

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Admin routes working' });
});

// ⚠️ CRITICAL: Export the router
module.exports = router;
