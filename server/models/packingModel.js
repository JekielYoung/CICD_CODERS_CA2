// Author: Pyae Phyo Maung 
// Student ID: 2535128
// Class: DIT/2B/02

const db = require('../db');

const COLUMNS = 'item_id, trip_id, item_name, category, is_checked, created_by';

// trip.user_id is the authoritative owner: trg_trip_add_owner also records them in
// trip_member with role 'Owner', but the trip column cannot drift out of step.
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
  return rows[0] ? { isOwner: rows[0].is_owner } : null;
};

// Items grouped by category order (the enum order), then by name
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

exports.countByTrip = async (tripId) => {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM packing_item WHERE trip_id = $1',
    [tripId]
  );
  return rows[0].count;
};

exports.findById = async (itemId) => {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM packing_item WHERE item_id = $1`,
    [itemId]
  );
  return rows[0];
};

// created_by records who added the item, so the delete rule can tell their items apart
exports.create = async ({ tripId, itemName, category, createdBy }) => {
  const { rows } = await db.query(
    `INSERT INTO packing_item (trip_id, item_name, category, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [tripId, itemName, category, createdBy]
  );
  return rows[0];
};

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

exports.remove = async (itemId, tripId) => {
  const { rowCount } = await db.query(
    'DELETE FROM packing_item WHERE item_id = $1 AND trip_id = $2',
    [itemId, tripId]
  );
  return rowCount > 0;
};