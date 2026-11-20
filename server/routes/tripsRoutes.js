// Itinerary Page (Jekiel Young)
const express = require('express');

const trip = require('../controllers/tripController');
const activity = require('../controllers/activityController');

const requireAuth = require('../middleware/requireAuth');

// Check if the user is a owner or member of the trip
const requireTripAccess = require('../middleware/requireTripAccess');

const router = express.Router();

// Authenticate user before every endpoint
router.use(requireAuth);

// Trips
// Display all trips
router.get('/', trip.list);

// Create a new trip
router.post('/', trip.create);

// Display the trip details
router.get('/:tripId', requireTripAccess(), trip.detail);

// Extend the trip's end date by one day. (Owner only)
router.post('/:tripId/extend-day', requireTripAccess(true), trip.extendDay);

// Add an existing registered Orbit user to a trip
router.post('/:tripId/members', requireTripAccess(true), trip.addMember);


// Activities
// Display all activities saved for a trip
router.get('/:tripId/activities', requireTripAccess(), activity.list);

// Add a new activity to a trip
router.post('/:tripId/activities', requireTripAccess(), activity.create);

// Saves the day when a user drags a activity (Sprint 3)
// router.patch('/:tripId/activities/reorder', requireTripAccess(), activity.reorder);

// Update an existing activity details
router.patch('/:tripId/activities/:activityId', requireTripAccess(), activity.update);

// Update an existing activity details
// router.put('/:tripId/activities/:activityId', requireTripAccess(), activity.update);

// Delte an Activity
router.delete('/:tripId/activities/:activityId', requireTripAccess(), activity.remove);


module.exports = router;
