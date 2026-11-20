const db = require('../db');

// Retrieve all documents belonging to a trip
exports.findByTripId = async (trip_id) => {
    const { rows } = await db.query(
        `SELECT document_id, trip_id, file_name, file_url,
                document_type, uploaded_at
         FROM document
         WHERE trip_id = $1
         ORDER BY uploaded_at DESC`,
        [trip_id]
    );

    return rows;
};

// Retrieve a specific document belonging to a trip
exports.findById = async (trip_id, document_id) => {
    const { rows } = await db.query(
        `SELECT document_id, trip_id, file_name, file_url,
                document_type, uploaded_at
         FROM document
         WHERE trip_id = $1 AND document_id = $2`,
        [trip_id, document_id]
    );

    return rows[0];
};

// Create a new document record
exports.create = async ({ trip_id, file_name, file_url, document_type }) => {
    const { rows } = await db.query(
        `INSERT INTO document (trip_id, file_name, file_url, document_type)
         VALUES ($1, $2, $3, $4)
         RETURNING document_id, trip_id, file_name, file_url,
                   document_type, uploaded_at`,
        [trip_id, file_name, file_url, document_type]
    );

    return rows[0];
};

// Update an existing document record
exports.update = async (trip_id, document_id, { file_name, file_url, document_type }) => {
    const { rows } = await db.query(
        `UPDATE document
         SET file_name = $1,
             file_url = $2,
             document_type = $3
         WHERE trip_id = $4 AND document_id = $5
         RETURNING document_id, trip_id, file_name, file_url,
                   document_type, uploaded_at`,
        [file_name, file_url, document_type, trip_id, document_id]
    );

    return rows[0];
};

// Delete a document record
exports.delete = async (trip_id, document_id) => {
    const { rows } = await db.query(
        `DELETE FROM document
         WHERE trip_id = $1 AND document_id = $2
         RETURNING document_id, file_url`,
        [trip_id, document_id]
    );

    return rows[0];
};