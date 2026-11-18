
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
        const response = await fetch(`/api/trip/${trip_id}`, {
            credentials: 'include'
        });

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

        tripDates.textContent =
            `${startDate.toLocaleDateString('en-GB', dateOptions)} - ` +
            `${endDate.toLocaleDateString('en-GB', dateOptions)}`;

        const duration =
            Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        tripDuration.textContent = `${duration} days`;
        tripTravellers.textContent = `${trip.traveller_count} travellers`;

    } catch (error) {
        console.error('Error loading trip details:', error);
        tripName.textContent = 'Unable to load trip information';
    }
}


// Fetch documents belonging to the trip
async function loadDocuments() {
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
        documentCount.textContent =
            `${documents.length} ${documents.length === 1 ? 'file' : 'files'}`;

        // Storage usage cannot be calculated from the current document schema
        storageUsage.textContent = 'Storage usage unavailable';

        // Remove loading indicator
        documentLoading.classList.add('d-none');

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

        documentList.replaceChildren();

        documents.forEach(doc => {
            createDocumentCard(doc);
        });

    } catch (error) {
        console.error('Error loading documents:', error);

        documentLoading.classList.add('d-none');
        documentError.textContent =
            'Unable to retrieve documents. Please try again.';
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
    link.className = 'btn btn-outline-dark btn-sm mt-auto align-self-start';
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

    // Assemble card
    cardBody.append(type, name, uploaded, link);
    card.appendChild(cardBody);
    column.appendChild(card);

    documentList.appendChild(column);
}
