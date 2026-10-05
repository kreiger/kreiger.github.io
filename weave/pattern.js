const file = document.querySelector('#file');
const viewer = document.querySelector('#viewer');
const container = document.querySelector('#pattern-container');
const image = document.querySelector('#pattern');
const marker = document.querySelector('#row-marker');
const dimOverlay = document.querySelector('#dim-overlay');
const setup = document.querySelector('#setup');
const setupButton = document.querySelector('#setup-button');
const controls = document.querySelector('#controls');
const rowCounter = document.querySelector('#row-counter');

const savedPatterns = document.querySelector('#saved-patterns');

const backButton = document.querySelector('#back-button');
const forwardButton = document.querySelector('#forward-button');
const startButton = document.querySelector('#start-button');
const endButton = document.querySelector('#end-button');

const SOURCE_ROW_HEIGHT = 20;
const EXTRA_BOTTOM_PIXELS = 1;
const MAX_WIDTH = 900;


/*
 * Current pattern
 */

let scale = 1;
let row = 0;

let currentPatternId = null;
let currentPatternName = null;
let currentImageBlob = null;


/*
 * IndexedDB
 */

const DB_NAME = 'weaving-patterns';
const DB_VERSION = 1;
const STORE_NAME = 'patterns';

let db;


function openDatabase() {
    return new Promise((resolve, reject) => {

        const request = indexedDB.open(
            DB_NAME,
            DB_VERSION
        );

        request.onupgradeneeded = event => {

            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, {
                    keyPath: 'id'
                });
            }
        };

        request.onsuccess = event => {
            db = event.target.result;
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}


function savePattern(pattern) {
    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            STORE_NAME,
            'readwrite'
        );

        transaction
            .objectStore(STORE_NAME)
            .put(pattern);

        transaction.oncomplete = resolve;

        transaction.onerror = () => {
            reject(transaction.error);
        };
    });
}

function deletePattern(id) {
    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            STORE_NAME,
            'readwrite'
        );

        transaction
            .objectStore(STORE_NAME)
            .delete(id);

        transaction.oncomplete = resolve;

        transaction.onerror = () => {
            reject(transaction.error);
        };
    });
}

function getAllPatterns() {
    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            STORE_NAME,
            'readonly'
        );

        const request =
            transaction
                .objectStore(STORE_NAME)
                .getAll();

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}


/*
 * Pattern library
 */

async function refreshPatternList() {

    const patterns = await getAllPatterns();

    savedPatterns.innerHTML = '';

    patterns.forEach(pattern => {

        const entry = document.createElement('div');

        entry.className = 'saved-pattern';

        if (pattern.id === currentPatternId) {
            entry.classList.add('current');
        }

        const selectButton = document.createElement('button');

        selectButton.className = 'saved-pattern-select';

        const name = document.createElement('span');

        name.className = 'saved-pattern-name';
        name.textContent = pattern.name;

        const position = document.createElement('span');

        position.className = 'saved-pattern-row';
        position.textContent = `Row ${pattern.row + 1}`;

        selectButton.appendChild(name);
        selectButton.appendChild(position);

        selectButton.addEventListener('click', event => {
            event.stopPropagation();
            loadPattern(pattern);
        });


        const deleteButton = document.createElement('button');

        deleteButton.className = 'saved-pattern-delete';
        deleteButton.title = `Delete ${pattern.name}`;
        deleteButton.setAttribute(
            'aria-label',
            `Delete ${pattern.name}`
        );
        deleteButton.textContent = '×';

        deleteButton.addEventListener('click', async event => {

            event.stopPropagation();

            if (!confirm(`Delete "${pattern.name}"?`)) {
                return;
            }

            await deletePattern(pattern.id);

            /*
             * If the currently displayed pattern was deleted,
             * leave the viewer in place but stop saving its position.
             */
            if (pattern.id === currentPatternId) {

                currentPatternId = null;
                currentPatternName = null;
                currentImageBlob = null;

                setup.classList.remove('hidden');
                controls.classList.remove('visible');
            }

            await refreshPatternList();
        });

        entry.appendChild(selectButton);
        entry.appendChild(deleteButton);

        savedPatterns.appendChild(entry);
    });
}

async function loadPattern(pattern) {

    currentPatternId = pattern.id;
    currentPatternName = pattern.name;
    currentImageBlob = pattern.image;
    row = pattern.row || 0;

    const url = URL.createObjectURL(
        pattern.image
    );

    image.onload = () => {

        configureImage();

        row = Math.min(
            row,
            getMaximumRow()
        );

        image.style.visibility = 'visible';

        update();

        setup.classList.add('hidden');
        controls.classList.add('visible');

        URL.revokeObjectURL(url);

        refreshPatternList();
    };

    image.src = url;
}


async function saveCurrentPosition() {

    if (!currentPatternId || !currentImageBlob) {
        return;
    }

    await savePattern({
        id: currentPatternId,
        name: currentPatternName,
        image: currentImageBlob,
        row: row
    });

    refreshPatternList();
}


/*
 * New image
 */

file.addEventListener('change', async () => {

    const selected = file.files[0];

    if (!selected) {
        return;
    }

    const patterns = await getAllPatterns();

    const existing = patterns.find(pattern =>
        pattern.name === selected.name &&
        pattern.image.size === selected.size &&
        pattern.image.type === selected.type
    );

    if (existing) {
        // Same file already exists: resume it instead of creating another entry.
        await loadPattern(existing);

        file.value = '';
        return;
    }

    const pattern = {
        id: crypto.randomUUID(),
        name: selected.name,
        image: selected,
        row: 0
    };

    currentPatternId = pattern.id;
    currentPatternName = pattern.name;
    currentImageBlob = pattern.image;
    row = 0;

    await savePattern(pattern);
    await loadPattern(pattern);

    file.value = '';

    await refreshPatternList();
});


/*
 * Image positioning
 */

function configureImage() {

    const width = Math.min(
        viewer.clientWidth,
        MAX_WIDTH
    );

    container.style.width =
        `${width}px`;

    scale =
        width / image.naturalWidth;

    image.style.width =
        `${width}px`;

    image.style.bottom =
        `${SOURCE_ROW_HEIGHT * scale}px`;
}


function update() {

    const rowHeight =
        SOURCE_ROW_HEIGHT * scale;

    const extraBottom =
        EXTRA_BOTTOM_PIXELS * scale;

    image.style.transform =
        `translateY(${row * rowHeight}px)`;

    const markerTop =
        viewer.clientHeight - rowHeight - extraBottom;

    marker.style.top =
        `${markerTop}px`;

    dimOverlay.style.top =
        `${markerTop}px`;

    rowCounter.textContent =
        `Row ${row + 1}`;

    saveCurrentPosition();
}

function getMaximumRow() {

    const rowHeight =
        SOURCE_ROW_HEIGHT * scale;

    const scaledHeight =
        image.naturalHeight * scale;

    return Math.max(
        0,
        Math.floor(
            (scaledHeight - rowHeight) / rowHeight
        )
    );
}


/*
 * Navigation
 */

function advance() {

    const maximumRows =
        getMaximumRow();

    if (row >= maximumRows) {
        return;
    }

    row++;
    update();
}


function goBack() {

    if (row === 0) {
        return;
    }

    row--;
    update();
}


function goToStart() {

    row = 0;
    update();
}


function goToEnd() {

    row = getMaximumRow();
    update();
}


/*
 * Viewer interaction
 */

viewer.addEventListener('click', advance);

document.addEventListener('keydown', event => {

    if (event.code === 'Space') {
        event.preventDefault();
        advance();
    }

    if (event.code === 'Backspace') {
        event.preventDefault();
        goBack();
    }
});


/*
 * Buttons
 */

backButton.addEventListener('click', event => {
    event.stopPropagation();
    goBack();
});


forwardButton.addEventListener('click', event => {
    event.stopPropagation();
    advance();
});


startButton.addEventListener('click', event => {
    event.stopPropagation();
    goToStart();
});


endButton.addEventListener('click', event => {
    event.stopPropagation();
    goToEnd();
});


/*
 * Setup button
 */

setupButton.addEventListener('click', event => {

    event.stopPropagation();

    setup.classList.toggle('hidden');

    if (!setup.classList.contains('hidden')) {
        refreshPatternList();
    }
});


/*
 * Resize
 */

window.addEventListener('resize', () => {

    if (!image.naturalWidth) {
        return;
    }

    configureImage();

    row = Math.min(
        row,
        getMaximumRow()
    );

    update();
});


/*
 * Start
 */

async function start() {

    try {

        await openDatabase();

        const patterns =
            await getAllPatterns();

        if (patterns.length > 0) {
            await loadPattern(patterns[0]);
        }

        await refreshPatternList();

    } catch (error) {

        console.error(
            'Could not open pattern storage:',
            error
        );
    }
}

start();
