// Author: Pyae Phyo Maung ( Luis )
// Student ID: 2535128
// Class: DIT/2B/02

const Packing = require('../models/packingModel');
const { serverError } = require('../utils/errors');


// Available categories that must match the database enum
const CATEGORIES = ['Clothing', 'Electronics', 'Toiletries', 'Documents', 'Others'];

// Validation limits
const NAME_MAX = 255;
const MAX_ITEMS_PER_TRIP = 200;
const MAX_ID = 2147483647; // Maximum PostgreSQL INT value

// Prevent invisible control characters from being stored
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;


// Remove zero-width characters that cannot be seen by users
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

// Convert a value into a valid ID number
// Returns null if the format is invalid
function parseId(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const n = Number(value);
  return n >= 1 && n <= MAX_ID ? n : null;
}


// Validate packing item name
function checkItemName(name) {
  if (typeof name !== 'string') return 'Item name is required.';
  if (CONTROL_CHARS.test(name)) return 'Item name contains characters that are not allowed.';
  const trimmed = name.trim();
  if (trimmed.replace(ZERO_WIDTH, '').trim() === '') return 'Item name is required.';
  if (trimmed.length > NAME_MAX) return `Item name must be at most ${NAME_MAX} characters.`;
  return null;
}

// Check whether the selected category is valid
function checkCategory(category) {
  return CATEGORIES.includes(category) ? null : `Category must be one of: ${CATEGORIES.join(', ')}.`;
}

// Check whether is_checked contains a boolean value
function checkChecked(value) {
  return typeof value === 'boolean' ? null : 'is_checked must be true or false.';
}

// Helper functions for common responses
const badRequest = (res, error, field) => res.status(400).json({ error, field });
const tripNotFound = (res) => res.status(404).json({ error: 'Trip not found.' });
const itemNotFound = (res) => res.status(404).json({ error: 'Packing item not found.' });

// Item exists but user does not have permission to delete it
const notYoursToDelete = (res) =>
  res.status(403).json({
    error: 'You can only delete items you added. Ask the trip owner to remove this one.',
  });

  // Item exists but user does not have permission to edit it
const notYoursToEdit = (res) =>
  res.status(403).json({
    error: 'You can only rename or recategorise items you added. Ask the trip owner to change this one.',
  });

// Check whether the user is allowed to manage the item
// Trip owners can manage all items
// Members can only manage items they created
const mayManageItem = (item, access, userId) =>
  access.isOwner || (item.created_by !== null && item.created_by === userId);


// Find an item and check whether the user can access the trip
async function loadAccessibleItem(res, itemId, userId) {
  const item = await Packing.findById(itemId);
  if (!item) {
    itemNotFound(res);
    return null;
  }
  const access = await Packing.getTripAccess(item.trip_id, userId);
  if (!access) {
    itemNotFound(res);
    return null;
  }
  return { item, access };
}

// GET /api/trips/:tripId/packing
// Get all packing items for a trip
exports.listItems = async (req, res) => {
  try {
    const tripId = parseId(req.params.tripId);
    if (!tripId) return badRequest(res, 'Invalid trip id.', 'tripId');
    const access = await Packing.getTripAccess(tripId, req.user.id);
    if (!access) return tripNotFound(res);

    const items = await Packing.listByTrip(tripId);

     // Count checked items
    const packed = items.filter((i) => i.is_checked).length;
    res.json({ trip_id: tripId, is_owner: access.isOwner, total: items.length, packed, items });
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/trips/:tripId/packing
// Create a new packing item
exports.createItem = async (req, res) => {
  try {
    const tripId = parseId(req.params.tripId);
    if (!tripId) return badRequest(res, 'Invalid trip id.', 'tripId');

    const { item_name, category } = req.body || {};
    const nameError = checkItemName(item_name);
    if (nameError) return badRequest(res, nameError, 'item_name');
    if (category !== undefined) {
      const categoryError = checkCategory(category);
      if (categoryError) return badRequest(res, categoryError, 'category');
    }

    if (!(await Packing.getTripAccess(tripId, req.user.id))) return tripNotFound(res);

// Prevent too many items from being added
    if ((await Packing.countByTrip(tripId)) >= MAX_ITEMS_PER_TRIP) {
      return badRequest(res, `A trip can have at most ${MAX_ITEMS_PER_TRIP} packing items.`);
    }

    const item = await Packing.create({
      tripId,
      itemName: item_name.trim(),
      category: category ?? 'Others',
      createdBy: req.user.id,
    });
    res.status(201).json({ item });
  } catch (err) {
    serverError(res, err);
  }
};

// Update an existing packing item
exports.updateItem = async (req, res) => {
  try {
    const itemId = parseId(req.params.itemId);
    if (!itemId) return badRequest(res, 'Invalid item id.', 'itemId');

    const { item_name, category, is_checked } = req.body || {};

    // At least one field must be provided
    if (item_name === undefined && category === undefined && is_checked === undefined) {
      return badRequest(res, 'Send at least one of: item_name, category, is_checked.');
    }
    if (item_name !== undefined) {
      const error = checkItemName(item_name);
      if (error) return badRequest(res, error, 'item_name');
    }
    if (category !== undefined) {
      const error = checkCategory(category);
      if (error) return badRequest(res, error, 'category');
    }
    if (is_checked !== undefined) {
      const error = checkChecked(is_checked);
      if (error) return badRequest(res, error, 'is_checked');
    }

    const found = await loadAccessibleItem(res, itemId, req.user.id);
    if (!found) return;

       // Only owners or item creators can modify item details
    const editsContent = item_name !== undefined || category !== undefined;
    if (editsContent && !mayManageItem(found.item, found.access, req.user.id)) {
      return notYoursToEdit(res);
    }

    const item = await Packing.update(itemId, found.item.trip_id, {
      itemName: item_name === undefined ? undefined : item_name.trim(),
      category,
      isChecked: is_checked,
    });
    

    if (!item) return itemNotFound(res);
    res.json({ item });
  } catch (err) {
    serverError(res, err);
  }
};

// DELETE /api/packing/:itemId
// Delete a packing item
exports.deleteItem = async (req, res) => {
  try {
    const itemId = parseId(req.params.itemId);
    if (!itemId) return badRequest(res, 'Invalid item id.', 'itemId');

    const found = await loadAccessibleItem(res, itemId, req.user.id);
    if (!found) return;

    // Only owner or creator can delete the item
    if (!mayManageItem(found.item, found.access, req.user.id)) return notYoursToDelete(res);

    const deleted = await Packing.remove(itemId, found.item.trip_id);
    if (!deleted) return itemNotFound(res);
    res.json({ deleted: true, item_id: itemId });
  } catch (err) {
    serverError(res, err);
  }
};