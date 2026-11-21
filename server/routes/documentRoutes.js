const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const documentModel = require('../models/documentModel');
const uploadDirectory = path.join(__dirname, '../uploads/documents');

// Authenticate user before every endpoint
const requireAuth = require('../middleware/requireAuth');
router.use(requireAuth);
const requireTripAccess = require('../middleware/requireTripAccess');

// Create directory if it doesn't exist
fs.mkdirSync(uploadDirectory, { recursive: true });

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDirectory);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();

        // Generate a unique filename to prevent collisions
        const uniqueName = `${Date.now()}-${require('crypto').randomUUID()}${extension}`;

        cb(null, uniqueName);
    }
});

// Configure upload middleware
const upload = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB
    },

    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'));
        }
    }
});

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
router.get('/:tripId', requireTripAccess(), async (req, res) => {
    const tripId = Number(req.params.tripId);

    if (!validateIds(tripId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID'
        });
    }

    try {
        const documents = await documentModel.findByTripId(tripId);

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
router.get('/:tripId/:documentId', requireTripAccess(), async (req, res) => {
    const tripId = Number(req.params.tripId);
    const documentId = Number(req.params.documentId);

    if (!validateIds(tripId, documentId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID or document ID'
        });
    }

    try {
        const document = await documentModel.findById(tripId, documentId);

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

// POST: Upload a physical document file
router.post('/:tripId/upload', requireTripAccess(), upload.single('file'), async (req, res) => {
    const tripId = Number(req.params.tripId);

    if (!validateIds(tripId)) {
        // Remove uploaded file if trip ID is invalid
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }

        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID'
        });
    }

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file uploaded'
        });
    }

    const { document_type } = req.body;

    const allowedDocumentTypes = [
        'Flight Ticket',
        'Hotel Booking',
        'Passport Copy',
        'Visa',
        'Others'
    ];

    if (!allowedDocumentTypes.includes(document_type)) {
        fs.unlink(req.file.path, () => {});

        return res.status(400).json({
            success: false,
            message: 'Invalid document type'
        });
    }

    try {
        // Generate URL for the uploaded file
        const file_url = `/uploads/documents/${req.file.filename}`;

        // Save file details into database
        const document = await documentModel.create({
            trip_id: tripId,
            file_name: req.file.originalname,
            file_url,
            document_type
        });

        return res.status(201).json({
            success: true,
            message: 'File uploaded successfully',
            document
        });
    } catch (error) {
        // Remove uploaded file if database insertion fails
        fs.unlink(req.file.path, () => {});

        console.error('Error uploading document:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to upload document'
        });
    }
});

// POST: Create a document record
router.post('/:tripId', requireTripAccess(), async (req, res) => {
    const tripId = Number(req.params.tripId);
    const { file_name, file_url, document_type } = req.body;

    if (!validateIds(tripId)) {
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
            trip_id: tripId,
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
router.put('/:tripId/:documentId', requireTripAccess(), async (req, res) => {
    const tripId = Number(req.params.tripId);
    const documentId = Number(req.params.documentId);
    const { file_name, file_url, document_type } = req.body;

    if (!validateIds(tripId, documentId)) {
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
            tripId,
            documentId,
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

// DELETE: Delete a document and its associated file
router.delete('/:tripId/:documentId', requireTripAccess(), async (req, res) => {
    const tripId = Number(req.params.tripId);
    const documentId = Number(req.params.documentId);

    if (!validateIds(tripId, documentId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid trip ID or document ID'
        });
    }

    try {
        const document = await documentModel.delete(
            tripId,
            documentId
        );

        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        // Remove the physical file
        const uploadPrefix = '/uploads/documents/';

        if (document.file_url.startsWith(uploadPrefix)) {
            const filename = path.basename(document.file_url);

            const filePath = path.join(
                __dirname,
                '..',
                'uploads',
                'documents',
                filename
            );

            try {
                await fs.promises.unlink(filePath);
            } catch (fileError) {
                if (fileError.code !== 'ENOENT') {
                    console.error('Error deleting uploaded file:', fileError);
                } else {
                    console.error('Error:', fileError)
                }
            }
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