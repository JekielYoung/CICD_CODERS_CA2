const express = require('express');
const router = express.Router();
const documentModel = require('../models/documentModel');

// Validate route parameters
const validateIds = (trip_id, document_id = null) => {
    if (!Number.isInteger(trip_id) || trip_id <= 0) {
        return false;
    }

    if (document_id !== null &&
        (!Number.isInteger(document_id) || document_id <= 0)) {
        return false;
    }

    return true;
};

// GET: Retrieve all documents belonging to a trip
router.get('/:trip_id', async (req, res) => {
    const trip_id = Number(req.params.trip_id);

    if (!validateIds(trip_id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID'
        });
    }

    try {
        const documents = await documentModel.findByTripId(trip_id);

        return res.status(200).json({
            success: true,
            count: documents.length,
            documents
        });
    } catch (error) {
        console.error('Error retrieving documents:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve documents'
        });
    }
});

// GET: Retrieve a specific document
router.get('/:trip_id/:document_id', async (req, res) => {
    const trip_id = Number(req.params.trip_id);
    const document_id = Number(req.params.document_id);

    if (!validateIds(trip_id, document_id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID or document ID'
        });
    }

    try {
        const document = await documentModel.findById(trip_id, document_id);

        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        return res.status(200).json({
            success: true,
            document
        });
    } catch (error) {
        console.error('Error retrieving document:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve document'
        });
    }
});

// POST: Create a document record
router.post('/:trip_id', async (req, res) => {
    const trip_id = Number(req.params.trip_id);
    const { file_name, file_url, document_type } = req.body;

    if (!validateIds(trip_id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID'
        });
    }

    if (!file_name || !file_url || !document_type) {
        return res.status(400).json({
            success: false,
            message: 'Missing required document fields'
        });
    }

    try {
        const document = await documentModel.create({
            trip_id,
            file_name,
            file_url,
            document_type
        });

        return res.status(201).json({
            success: true,
            message: 'Document created successfully',
            document
        });
    } catch (error) {
        console.error('Error creating document:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to create document'
        });
    }
});

// PUT: Update a document record
router.put('/:trip_id/:document_id', async (req, res) => {
    const trip_id = Number(req.params.trip_id);
    const document_id = Number(req.params.document_id);
    const { file_name, file_url, document_type } = req.body;

    if (!validateIds(trip_id, document_id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID or document ID'
        });
    }

    if (!file_name || !file_url || !document_type) {
        return res.status(400).json({
            success: false,
            message: 'Missing required document fields'
        });
    }

    try {
        const document = await documentModel.update(
            trip_id,
            document_id,
            { file_name, file_url, document_type }
        );

        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Document updated successfully',
            document
        });
    } catch (error) {
        console.error('Error updating document:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to update document'
        });
    }
});

// DELETE: Delete a document record
router.delete('/:trip_id/:document_id', async (req, res) => {
    const trip_id = Number(req.params.trip_id);
    const document_id = Number(req.params.document_id);

    if (!validateIds(trip_id, document_id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID or document ID'
        });
    }

    try {
        const document = await documentModel.delete(trip_id, document_id);

        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Document deleted successfully',
            document_id: document.document_id
        });
    } catch (error) {
        console.error('Error deleting document:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to delete document'
        });
    }
});

module.exports = router;