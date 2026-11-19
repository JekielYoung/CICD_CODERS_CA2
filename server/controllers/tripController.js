// To get data from the database, valdidate the data and handle the api responses
// Jekiel Young

const Trip = require("../models/tripModel");

// ======================================
// VALIDATION HELPERS
// ======================================

// Check valid calendar date
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

// Return HTTP 400
const bad = (res, message) =>
  res.status(400).json({
    error: message
  });

// ======================================
// GET ALL USER TRIPS
// ======================================

async function list(req, res) {
  try {
    const userId = req.user.id;

    const trips = await Trip.findForUser(userId);

    return res.status(200).json({
      trips
    });

  } catch (error) {
    console.error("Error retrieving trips:", error);

    return res.status(500).json({
      error: "Unable to retrieve your trips. Please try again."
    });
  }
}

// ======================================
// POST: CREATE NEW TRIP
// ======================================

async function create(req, res) {
  try {
    const {
      title,
      destination,
      start_date,
      end_date,
      description,
      travelers
    } = req.body || {};

    // Validate trip name
    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 255
    ) {
      return bad(
        res,
        "Trip name is required (maximum 255 characters)."
      );
    }

    // Validate destination
    if (
      typeof destination !== "string" ||
      !destination.trim() ||
      destination.trim().length > 255
    ) {
      return bad(
        res,
        "Destination is required (maximum 255 characters)."
      );
    }

    // Validate start date
    if (!validDate(start_date)) {
      return bad(res, "Enter a valid trip start date.");
    }

    // Validate end date
    if (!validDate(end_date)) {
      return bad(res, "Enter a valid trip end date.");
    }

    // Check chronological order
    if (end_date < start_date) {
      return bad(
        res,
        "End date cannot be earlier than start date."
      );
    }

    // Validate traveler count
    const count =
      travelers === undefined ? 1 : Number(travelers);

    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 100
    ) {
      return bad(
        res,
        "Travelers must be a whole number between 1 and 100."
      );
    }

    // Validate description
    if (
      description != null &&
      typeof description !== "string"
    ) {
      return bad(res, "Description must be text.");
    }

    // Send validated data to model
    const result = await Trip.create(req.user.id, {
      title: title.trim(),
      destination: destination.trim(),
      start_date,
      end_date,
      description: description?.slice(0, 10000) || null,
      travelers: count
    });

    return res.status(201).json(result);

  } catch (error) {
    console.error("Error creating trip:", error);

    return res.status(500).json({
      error: "Unable to create trip. Please try again."
    });
  }
}

// ======================================
// GET SINGLE TRIP DETAILS
// ======================================

async function detail(req, res) {
  try {
    const tripId = req.tripId;

    const [trip, members] = await Promise.all([
      Trip.findById(tripId),
      Trip.getMembers(tripId)
    ]);

    if (!trip) {
      return res.status(404).json({
        error: "Trip not found."
      });
    }

    return res.status(200).json({
      trip,
      members
    });

  } catch (error) {
    console.error("Error retrieving trip details:", error);

    return res.status(500).json({
      error: "Unable to retrieve trip details. Please try again."
    });
  }
}

// ======================================
// POST: EXTEND TRIP BY ONE DAY
// ======================================

async function extendDay(req, res) {
  try {
    const tripId = req.tripId;

    const result = await Trip.extendDay(tripId);

    if (!result) {
      return res.status(404).json({
        error: "Trip not found."
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("Error extending trip:", error);

    return res.status(500).json({
      error: "Unable to extend trip. Please try again."
    });
  }
}

// ======================================
// POST: ADD REGISTERED TRIP MEMBER
// ======================================

async function addMember(req, res) {
  try {
    const tripId = req.tripId;

    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    // Validate email address
    if (
      !email ||
      email.length > 255 ||
      !/^\S+@\S+\.\S+$/.test(email)
    ) {
      return bad(
        res,
        "Enter a valid email address."
      );
    }

    // Find an existing Orbit user
    const user = await Trip.findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        error: "No registered user found for that email."
      });
    }

    // Add user to trip_member table
    const added = await Trip.addMember(
      tripId,
      user.user_id
    );

    if (!added) {
      return res.status(409).json({
        error: "This person is already a member of the trip."
      });
    }

    return res.status(201).json({
      message: "Member added successfully.",
      name: user.name
    });

  } catch (error) {
    console.error("Error adding trip member:", error);

    return res.status(500).json({
      error: "Unable to add member. Please try again."
    });
  }
}

// ======================================
// EXPORT CONTROLLER FUNCTIONS
// ======================================

module.exports = {list,create,detail,extendDay,addMember};
