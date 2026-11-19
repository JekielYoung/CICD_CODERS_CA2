
// js/document-locker.js

// Get trip_id from the URL
const params = new URLSearchParams(window.location.search);
const trip_id = Number(params.get('trip'));

// DOM elements
const tripName = document.getElementById('trip-name');
const tripDates = document.getElementById('trip-dates');
const tripDuration = document.getElementById('trip-duration');
const tripTravellers = document.getElementById('trip-travellers');

const documentCount = document.getElementById('document-count');
const storageUsage = document.getElementById('storage-usage');

const documentLoading = document.getElementById('document-loading');
const documentError = document.getElementById('document-error');
const documentEmpty = document.getElementById('document-empty');
const documentList = document.getElementById('document-list');
const documentTypeSelect = document.getElementById('document-type-select');

// Upload elements
const fileInput = document.getElementById('file-input');
const uploadFileBtn = document.getElementById('upload-file-btn');
const emptyUploadFileBtn = document.getElementById('empty-upload-file-btn');
const confirmUploadBtn = document.getElementById('confirm-upload-btn');
const uploadStatus = document.getElementById('upload-status');
const selectedFileName = document.getElementById('selected-file-name');
const selectedFileSize = document.getElementById('selected-file-size');

const uploadModalElement = document.getElementById('upload-document-modal');
const uploadModal = new bootstrap.Modal(uploadModalElement);
const uploadModalError = document.getElementById('upload-modal-error');

// Store the currently selected file
let selectedFile = null;

// Validate trip ID
if (!Number.isInteger(trip_id) || trip_id <= 0) {
    documentError.textContent = 'Invalid trip ID.';
    documentError.classList.remove('d-none');
    documentLoading.classList.add('d-none');
} else {
    loadTripDetails();
    loadDocuments();
}


// Fetch trip information
async function loadTripDetails() {
    try {
        // Replace this endpoint with your actual trip retrieval endpoint
        const response = await fetch(`/api/trip/${trip_id}`,
            {
                credentials: 'include'
            }
        );
        if (!response.ok) {
            throw new Error('Failed to retrieve trip information');
        }

        const result = await response.json();

        // Adjust this depending on your actual API response structure
        const trip = result.trip;
        if (!trip) {
            throw new Error('Trip information not found');
        }

        // Display trip information
        tripName.textContent = trip.title;
        const startDate = new Date(trip.start_date);
        const endDate = new Date(trip.end_date);
        const dateOptions = {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        };

        tripDates.textContent = `${startDate.toLocaleDateString('en-GB', dateOptions)} - ` + `${endDate.toLocaleDateString('en-GB', dateOptions)}`;
        const duration = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        tripDuration.textContent = `${duration} days`;
        tripTravellers.textContent = `${trip.traveller_count} travellers`;
    } catch (error) {
        console.error('Error loading trip details:', error);
        tripName.textContent = 'Unable to load trip information';
    }
}


// Fetch documents belonging to the trip
async function loadDocuments() {
    documentError.classList.add('d-none');
    documentEmpty.classList.add('d-none');
    documentList.classList.add('d-none');
    documentLoading.classList.remove('d-none');
    try {
        const response = await fetch(`/api/document/${trip_id}`, {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error('Failed to retrieve documents');
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to retrieve documents');
        }

        const documents = result.documents;
        // Update document count
        documentCount.textContent = `${documents.length} ${documents.length === 1
            ? 'file'
            : 'files'
        }`;

        // Storage usage cannot be calculated from the current document schema
        storageUsage.textContent = 'Storage usage unavailable';
        // Remove loading indicator
        documentLoading.classList.add('d-none');
        documentList.replaceChildren();

        // Display empty state if there are no documents
        if (documents.length === 0) {
            documentEmpty.classList.remove('d-none');
            documentEmpty.classList.add('d-flex');
            documentList.classList.add('d-none');
            return;
        }

        // Display document cards
        documentEmpty.classList.add('d-none');
        documentEmpty.classList.remove('d-flex');
        documentList.classList.remove('d-none');

        documents.forEach(doc => {
            createDocumentCard(doc);
        });

    } catch (error) {
        console.error('Error loading documents:', error);

        documentLoading.classList.add('d-none');
        documentError.textContent = 'Unable to retrieve documents. Please try again.';
        documentError.classList.remove('d-none');
    }
}


// Generate a document card
function createDocumentCard(doc) {
    // Create the column
    const column = document.createElement('div');
    column.className = 'col';

    // Create the card
    const card = document.createElement('div');
    card.className = 'card h-100';

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body d-flex flex-column gap-2';

    // Document type
    const type = document.createElement('span');
    type.className = 'badge text-bg-light border align-self-start';
    type.textContent = doc.document_type;

    // Document name
    const name = document.createElement('h6');
    name.className = 'card-title mb-0 text-break';
    name.textContent = doc.file_name;

    // Upload date
    const uploaded = document.createElement('small');
    uploaded.className = 'text-secondary';

    const uploadedDate = new Date(doc.uploaded_at);
    uploaded.textContent = Number.isNaN(uploadedDate.getTime())
        ? 'Upload date unavailable'
        : `Uploaded ${uploadedDate.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })}`;

    // View document link
    const link = document.createElement('a');
    link.className = 'btn btn-outline-dark btn-sm';
    link.textContent = 'View document';

    // Validate document URL
    try {
        const url = new URL(doc.file_url, window.location.origin);

        if (url.protocol === 'http:' || url.protocol === 'https:') {
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        } else {
            link.textContent = 'Invalid document URL';
            link.classList.add('disabled');
        }
    } catch {
        link.textContent = 'Invalid document URL';
        link.classList.add('disabled');
    }

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-outline-danger btn-sm';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
        deleteDocument(doc.document_id, doc.file_name);
    });

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'd-flex gap-2 mt-auto';
    actions.append(link, deleteBtn);

    // Validate document URL
    try {
        const url = new URL(doc.file_url, window.location.origin);

        if (url.protocol === 'http:' || url.protocol === 'https:') {
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        } else {
            link.textContent = 'Invalid document URL';
            link.classList.add('disabled');
        }
    } catch {
        link.textContent = 'Invalid document URL';
        link.classList.add('disabled');
    }

    // Assemble card
    cardBody.append(type, name, uploaded, actions);
    card.appendChild(cardBody);
    column.appendChild(card);

    documentList.appendChild(column);
}

// Open file selection window
uploadFileBtn.addEventListener('click', () => {
    fileInput.click();
});

emptyUploadFileBtn.addEventListener('click', () => {
    fileInput.click();
});

// Handle file selection
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) {
        return;
    }

    // Store the selected file for later upload
    selectedFile = file;

    // Display the selected file's information
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = formatFileSize(file.size);

    // Reset the document type selection
    documentTypeSelect.value = '';

    // Reset any previous modal errors
    uploadModalError.textContent = '';
    uploadModalError.classList.add('d-none');

    // Display the upload modal
    uploadModal.show();
});

// Upload document
async function uploadDocument(file, document_type) {
    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
        showUploadStatus('File exceeds the 10 MB limit.', 'danger');
        return false;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', document_type);

    try {
        showUploadStatus('Uploading document...', 'info');

        const response = await fetch(`/api/document/${trip_id}/upload`,
            {
                method: 'POST',
                credentials: 'include',
                body: formData
            }
        );

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Upload failed');
        }

        showUploadStatus('Document uploaded successfully!', 'success');
        // Refresh document list
        await loadDocuments();
        return true;
    } catch (error) {
        console.error('Error uploading document:', error);

        showUploadStatus(
            error.message || 'Failed to upload document.',
            'danger'
        );
        return false;
    }
}

// Delete document
async function deleteDocument(document_id, file_name) {
    const confirmed = confirm(`Are you sure you want to delete "${file_name}"?`);
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/document/${trip_id}/${document_id}`,
            {
                method: 'DELETE',
                credentials: 'include'
            }
        );

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to delete document');
        }

        showUploadStatus('Document deleted successfully!', 'success');

        // Refresh the document list
        await loadDocuments();
    } catch (error) {
        console.error('Error deleting document:', error);

        showUploadStatus(
            error.message || 'Failed to delete document.',
            'danger'
        );
    }
}

// Display upload status
function showUploadStatus(message, type) {
    uploadStatus.textContent = message;
    uploadStatus.className = `alert alert-${type} mt-3`;
    uploadStatus.classList.remove('d-none');
}

// Format file size
function formatFileSize(size) {
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(2)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

// Confirm upload from modal
confirmUploadBtn.addEventListener('click', async () => {
    if (!selectedFile) {
        uploadModalError.textContent = 'Please select a file.';
        uploadModalError.classList.remove('d-none');
        return;
    }

    const document_type = documentTypeSelect.value;

    if (!document_type) {
        uploadModalError.textContent = 'Please select a document type.';
        uploadModalError.classList.remove('d-none');
        return;
    }

    // Prevent repeated uploads while processing
    confirmUploadBtn.disabled = true;
    confirmUploadBtn.textContent = 'Uploading...';

    const success = await uploadDocument(selectedFile, document_type);

    if (success) {
        uploadModal.hide();

        selectedFile = null;
        fileInput.value = '';
    }

    confirmUploadBtn.disabled = false;
    confirmUploadBtn.textContent = 'Upload';
});

// Reset modal when closed
uploadModalElement.addEventListener('hidden.bs.modal', () => {
    selectedFile = null;
    fileInput.value = '';
    documentTypeSelect.value = '';

    uploadModalError.textContent = '';
    uploadModalError.classList.add('d-none');

    confirmUploadBtn.disabled = false;
    confirmUploadBtn.textContent = 'Upload';
});