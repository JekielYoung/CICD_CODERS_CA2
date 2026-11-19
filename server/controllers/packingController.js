// Author: Pyae Phyo Maung 
// Student ID: 2535128
// Class: DIT/2B/02

const Packing = require('../models/packingModel');

// Must match the packing_category enum in database/schema.sql
const CATEGORIES = ['Clothing', 'Electronics', 'Toiletries', 'Documents', 'Others'];
const NAME_MAX = 255;
const MAX_ITEMS_PER_TRIP = 200;
const MAX_ID = 2147483647; // largest value of a PostgreSQL INT

// characters are invisible once stored and corrupt any later CSV or PDF export.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
// Zero-width characters survive trim(), so " ​ " would pass as a name
const ZERO_WIDTH = /[​-‍⁠﻿]/g;

// "12" -> 12. Anything else (abc, -1, 0, 1.5, 99999999999) -> null
function parseId(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const n = Number(value);
  return n >= 1 && n <= MAX_ID ? n : null;
}

// Each check returns an error message, or null when the value is fine
function checkItemName(name) {
  if (typeof name !== 'string') return 'Item name is required.';
  if (CONTROL_CHARS.test(name)) return 'Item name contains characters that are not allowed.';
  const trimmed = name.trim();
  if (trimmed.replace(ZERO_WIDTH, '').trim() === '') return 'Item name is required.';
  if (trimmed.length > NAME_MAX) return `Item name must be at most ${NAME_MAX} characters.`;
  return null;
}

function checkCategory(category) {
  return CATEGORIES.includes(category) ? null : `Category must be one of: ${CATEGORIES.join(', ')}.`;
}

function checkChecked(value) {
  return typeof value === 'boolean' ? null : 'is_checked must be true or false.';
}

const badRequest = (res, error, field) => res.status(400).json({ error, field });
const tripNotFound = (res) => res.status(404).json({ error: 'Trip not found.' });
const itemNotFound = (res) => res.status(404).json({ error: 'Packing item not found.' });

// 403, not 404: a member can see the item, so pretending it does not exist would only confuse them.
const notYoursToDelete = (res) =>
  res.status(403).json({
    error: 'You can only delete items you added. Ask the trip owner to remove this one.',
  });
const notYoursToEdit = (res) =>
  res.status(403).json({
    error: 'You can only rename or recategorise items you added. Ask the trip owner to change this one.',
  });

// The trip owner may change any item on the trip; everyone else only the items they
// added. Items added before created_by existed have created_by = NULL, so only the
// owner can touch those.
const mayManageItem = (item, access, userId) =>
  access.isOwner || (item.created_by !== null && item.created_by === userId);

// Same rule as authController.serverError: a database outage is 503, anything else
// unexpected is 500. The message never includes database details.
function serverError(res, err) {
  console.error(err);
  const down =
    err && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' ||
            /^(08|57P0)/.test(err.code || '') || /connection|timeout/i.test(err.message || ''));
  return res
    .status(down ? 503 : 500)
    .json({ error: down ? 'Service temporarily unavailable. Please try again.' : 'Something went wrong. Please try again.' });
}

// Loads an item together with the user's access to its trip. Sends the 404 itself and
// returns null when the user is not on that trip at all.
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
exports.listItems = async (req, res) => {
  try {
    const tripId = parseId(req.params.tripId);
    if (!tripId) return badRequest(res, 'Invalid trip id.', 'tripId');
    if (!(await Packing.getTripAccess(tripId, req.user.id))) return tripNotFound(res);

    const items = await Packing.listByTrip(tripId);
    const packed = items.filter((i) => i.is_checked).length;
    res.json({ trip_id: tripId, total: items.length, packed, items });
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/trips/:tripId/packing   body: { item_name, category? }
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

    // Stops one account filling the table, and keeps the list response a sane size
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

exports.updateItem = async (req, res) => {
  try {
    const itemId = parseId(req.params.itemId);
    if (!itemId) return badRequest(res, 'Invalid item id.', 'itemId');

    const { item_name, category, is_checked } = req.body || {};
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
exports.deleteItem = async (req, res) => {
  try {
    const itemId = parseId(req.params.itemId);
    if (!itemId) return badRequest(res, 'Invalid item id.', 'itemId');

    const found = await loadAccessibleItem(res, itemId, req.user.id);
    if (!found) return;

    if (!mayManageItem(found.item, found.access, req.user.id)) return notYoursToDelete(res);

    const deleted = await Packing.remove(itemId, found.item.trip_id);
    if (!deleted) return itemNotFound(res);
    res.json({ deleted: true, item_id: itemId });
  } catch (err) {
    serverError(res, err);
  }
};