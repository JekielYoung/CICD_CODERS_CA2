// Author: Pyae Phyo Maung ( Luis )
// Student ID: 2535128
// Class: DIT/2B/02

const express = require('express');
const packing = require('../controllers/packingController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Get all packing items for a specific trip
router.get('/trips/:tripId/packing', requireAuth, packing.listItems);

// Add a new packing item to a trip
router.post('/trips/:tripId/packing', requireAuth, packing.createItem);

// Update an existing packing item
router.patch('/packing/:itemId', requireAuth, packing.updateItem);

// Delete a packing item
router.delete('/packing/:itemId', requireAuth, packing.deleteItem);

module.exports = router;