// Check authentication whether the user is an owner of the trip
// Jekiel Young
const Trip = require("../models/tripModel");

// ======================================
// TRIP ACCESS MIDDLEWARE
// ======================================

// ownerOnly = false: Owner or Member can access
// ownerOnly = true: Only the Owner can access

function requireTripAccess(ownerOnly = false) {

  return async function (req, res,next) {
    try {

      // ==================================
      // 1. VALIDATE TRIP ID
      // ==================================

      const tripId = Number(req.params.tripId);

      if (
        !Number.isSafeInteger(tripId) ||
        tripId <= 0
      ) {
        return res.status(400).json({
          error: "Invalid trip ID."
        });
      }

      // ==================================
      // 2. CHECK AUTHENTICATION
      // ==================================

      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Please log in to access this trip."
        });
      }

      // ==================================
      // 3. CHECK TRIP ACCESS
      // ==================================

      const access = await Trip.getAccess(
        tripId,
        req.user.id
      );

      if (!access) {
        return res.status(404).json({
          error: "Trip not found or you do not have access."
        });
      }

      // ==================================
      // 4. CHECK OWNER PERMISSIONS
      // ==================================

      if (
        ownerOnly &&
        Number(access.user_id) !== Number(req.user.id)
      ) {
        return res.status(403).json({
          error: "Only the trip owner can perform this action."
        });
      }

      // ==================================
      // 5. PASS VALIDATED TRIP ID
      // ==================================

      req.tripId = tripId;

      // Continue to controller
      return next();

    } catch (error) {
      console.error("Error checking trip access:", error);

      return res.status(500).json({
        error: "Unable to verify trip access. Please try again."
      });
    }
  };
}

module.exports = requireTripAccess;
