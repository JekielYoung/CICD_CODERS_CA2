// Author: Pyae Phyo Maung ( Luis )
// Student ID: 2535128
// Class: DIT/2B/02

const db = require('../db');

// Columns commonly used when retrieving packing item data
const COLUMNS = 'item_id, trip_id, item_name, category, is_checked, created_by';


// Check whether a user has access to a trip
// A user can access the trip if they are the owner or a member
exports.getTripAccess = async (tripId, userId) => {
  const { rows } = await db.query(
    `SELECT (t.user_id = $2) AS is_owner
       FROM trip t
      WHERE t.trip_id = $1
        AND (t.user_id = $2
             OR EXISTS (SELECT 1 FROM trip_member m
                         WHERE m.trip_id = t.trip_id AND m.user_id = $2))`,
    [tripId, userId]
  );

  // Return owner status if access is found
  return rows[0] ? { isOwner: rows[0].is_owner } : null;
};

// Get all packing items for a trip
// Items are sorted by category, then item name
exports.listByTrip = async (tripId) => {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}
       FROM packing_item
      WHERE trip_id = $1
      ORDER BY category, item_name, item_id`,
    [tripId]
  );
  return rows;
};

// Count the total number of packing items in a trip
exports.countByTrip = async (tripId) => {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM packing_item WHERE trip_id = $1',
    [tripId]
  );
  return rows[0].count;
};

// Find a specific packing item using its ID
exports.findById = async (itemId) => {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM packing_item WHERE item_id = $1`,
    [itemId]
  );
  return rows[0];
};

// Add a new packing item to a trip
// created_by stores the user who added the item
exports.create = async ({ tripId, itemName, category, createdBy }) => {
  const { rows } = await db.query(
    `INSERT INTO packing_item (trip_id, item_name, category, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [tripId, itemName, category, createdBy]
  );
  return rows[0];
};

// Update packing item details
// Only fields with values provided will be updated
exports.update = async (itemId, tripId, { itemName, category, isChecked }) => {
  const { rows } = await db.query(
    `UPDATE packing_item
        SET item_name  = COALESCE($3, item_name),
            category   = COALESCE($4::packing_category, category),
            is_checked = COALESCE($5::boolean, is_checked)
      WHERE item_id = $1 AND trip_id = $2
      RETURNING ${COLUMNS}`,
    [itemId, tripId, itemName ?? null, category ?? null, isChecked ?? null]
  );
  return rows[0];
};

// Delete a packing item from a trip
// Returns true if the item was deleted successfully
exports.remove = async (itemId, tripId) => {
  const { rowCount } = await db.query(
    'DELETE FROM packing_item WHERE item_id = $1 AND trip_id = $2',
    [itemId, tripId]
  );
  return rowCount > 0;
};