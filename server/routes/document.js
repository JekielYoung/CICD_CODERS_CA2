const express = require('express');
const router = express.Router();

// GET: Retrieve all documents belonging to a trip
router.get('/:trip_id', async (req, res) => {
    const trip_id = Number(req.params.trip_id);
    if (!Number.isInteger(trip_id) || trip_id <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid trip ID"
        });
    }
    try {
        const result = await pool.query(
            `SELECT
                document_id,
                trip_id,
                file_name,
                file_url,
                document_type,
                uploaded_at
            FROM document
            WHERE trip_id = $1
            ORDER BY uploaded_at DESC;
            `, [trip_id]
        );
        return res.status(201).json({
            count: result.rowCount,
            trips: result.rows
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET: Retrieve a specific document
router.get('/:trip_id/:document_id', async (req, res) => {

});

// POST: Create a document record
router.post('/:trip_id', async (req, res) => {

});

// PUT: Update a document record
router.put('/:trip_id/:document_id', async (req, res) => {

});

// DELETE: Delete a document record
router.delete('/:trip_id/:document_id', async (req, res) => {

});

module.exports = router;