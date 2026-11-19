// Validates data, calls the models and handles API Responses
// Jekiel Young

const Activity = require("../models/activityModel");
const Trip = require("../models/tripModel");

// ======================================
// VALIDATION HELPERS
// ======================================

// Check positive integer activity ID
const validId = (value) =>
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0;

// Check date format and actual calendar date
const validDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(value + "T00:00:00Z");

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

// Allowed activity statuses
const statuses = [
  "Planned",
  "Booked",
  "Completed"
];

// Validate time in HH:MM format
const validTime = (value) =>
  value == null ||
  value === "" ||
  (
    typeof value === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  );

// Return HTTP 400
const bad = (res, message) =>
  res.status(400).json({
    error: message
  });

// ======================================
// VALIDATE ACTIVITY DATA
// ======================================

function validate(body) {

  if (
    !body ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.trim().length > 255
  ) {
    return "Activity title is required (maximum 255 characters).";
  }

  if (!validDate(body.activity_date)) {
    return "A valid activity date is required.";
  }

  if (
    !validTime(body.start_time) ||
    !validTime(body.end_time)
  ) {
    return "Time must use HH:MM format.";
  }

  if (
    body.start_time &&
    body.end_time &&
    body.end_time < body.start_time
  ) {
    return "End time cannot be earlier than start time.";
  }

  if (
    body.status !== undefined &&
    !statuses.includes(body.status)
  ) {
    return "Invalid activity status.";
  }

  if (
    body.location != null &&
    (
      typeof body.location !== "string" ||
      body.location.length > 255
    )
  ) {
    return "Location must not exceed 255 characters.";
  }

  if (
    body.notes != null &&
    (
      typeof body.notes !== "string" ||
      body.notes.length > 10000
    )
  ) {
    return "Notes must not exceed 10000 characters.";
  }

  return null;
}

// ======================================
// NORMALIZE ACTIVITY DATA
// ======================================

function normalize(body) {
  return {
    title: body.title.trim(),
    location: body.location?.trim() || null,
    activity_date: body.activity_date,
    start_time: body.start_time || null,
    end_time: body.end_time || null,
    notes: body.notes?.trim() || null,
    status: body.status || "Planned"
  };
}

// ======================================
// GET ALL ACTIVITIES
// ======================================

async function list(req, res) {
  try {

    const tripId = req.tripId;

    const activities = await Activity.findByTrip(tripId);

    return res.status(200).json({
      activities
    });

  } catch (error) {
    console.error("Error retrieving activities:", error);

    return res.status(500).json({
      error: "Unable to retrieve activities. Please try again."
    });
  }
}

// ======================================
// POST: CREATE ACTIVITY
// ======================================

async function create(req, res) {
  try {
    const tripId = req.tripId;

    const error = validate(req.body);

    if (error) {
      return bad(res, error);
    }

    const withinTrip = await Trip.dateIsWithinTrip(
      tripId,
      req.body.activity_date
    );

    if (!withinTrip) {
      return bad(
        res,
        "Activity date must be within the trip's start and end dates."
      );
    }

    const activity = await Activity.create(
      tripId,
      normalize(req.body)
    );

    return res.status(201).json(activity);

  } catch (error) {
    console.error("Error creating activity:", error);

    return res.status(500).json({
      error: "Unable to create activity. Please try again."
    });
  }
}

// ======================================
// PATCH / PUT: UPDATE ACTIVITY
// ======================================

async function update(req, res) {
  try {
    const tripId = req.tripId;
    const activityId = req.params.activityId;

    if (!validId(activityId)) {
      return bad(res, "Invalid activity ID.");
    }

    const error = validate(req.body);

    if (error) {
      return bad(res, error);
    }

    const withinTrip = await Trip.dateIsWithinTrip(
      tripId,
      req.body.activity_date
    );

    if (!withinTrip) {
      return bad(
        res,
        "Activity date must be within the trip's start and end dates."
      );
    }

    const updated = await Activity.update(
      tripId,
      Number(activityId),
      normalize(req.body)
    );

    if (!updated) {
      return res.status(404).json({
        error: "Activity not found in this trip."
      });
    }

    return res.status(200).json({
      message: "Activity updated successfully."
    });

  } catch (error) {
    console.error("Error updating activity:", error);

    return res.status(500).json({
      error: "Unable to update activity. Please try again."
    });
  }
}

// ======================================
// DELETE ACTIVITY
// ======================================

async function remove(req, res) {
  try {
    const tripId = req.tripId;
    const activityId = req.params.activityId;

    if (!validId(activityId)) {
      return bad(res, "Invalid activity ID.");
    }

    const removed = await Activity.remove(
      tripId,
      Number(activityId)
    );

    if (!removed) {
      return res.status(404).json({
        error: "Activity not found in this trip."
      });
    }

    return res.status(200).json({
      message: "Activity deleted successfully."
    });

  } catch (error) {
    console.error("Error deleting activity:", error);

    return res.status(500).json({
      error: "Unable to delete activity. Please try again."
    });
  }
}

// ======================================
// EXPORT CONTROLLER FUNCTIONS
// ======================================

module.exports = {list,create,update,remove};
