// Author: Pyae Phyo Maung 
// Student ID: 2535128
// Class: DIT/2B/02

const express = require('express');
const packing = require('../controllers/packingController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/trips/:tripId/packing', requireAuth, packing.listItems);
router.post('/trips/:tripId/packing', requireAuth, packing.createItem);
router.patch('/packing/:itemId', requireAuth, packing.updateItem);
router.delete('/packing/:itemId', requireAuth, packing.deleteItem);

module.exports = router;