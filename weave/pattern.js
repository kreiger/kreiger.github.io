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
const advanceHint = document.querySelector('#advance-hint');

const savedPatterns = document.querySelector('#saved-patterns');
const closeSetupButton = document.querySelector('#close-setup');

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
let rowIndex = 0;
let rowCount = 0;

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
        const savedRowIndex = pattern.rowIndex ?? pattern.row ?? 0;
        const savedRowCount = pattern.rowCount ?? 0;

        position.textContent = `${Math.min(savedRowIndex, savedRowCount)}/${savedRowCount}`;

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
    rowIndex = pattern.rowIndex ?? pattern.row ?? 0;
    rowCount = pattern.rowCount ?? 0;

    const url = URL.createObjectURL(
        pattern.image
    );

    image.onload = () => {

        configureImage();

        rowCount = getEndIndex();

        rowIndex = Math.min(
            rowIndex,
            rowCount
        );

        image.style.visibility = 'visible';

        update();

        setup.classList.add('hidden');
        controls.classList.add('visible');
        advanceHint.classList.remove('hidden');

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
        rowIndex: rowIndex,
        rowCount: rowCount
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

    if (!['image/png', 'image/jpeg'].includes(selected.type)) {
        alert('Please choose a PNG or JPEG image.');
        file.value = '';
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
        rowIndex: 0,
        rowCount: 0
    };

    currentPatternId = pattern.id;
    currentPatternName = pattern.name;
    currentImageBlob = pattern.image;
    rowIndex = 0;
    rowCount = 0;

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
        `translateY(${rowIndex * rowHeight}px)`;

    const markerTop =
        viewer.clientHeight - rowHeight - extraBottom;

    marker.style.top =
        `${markerTop}px`;

    dimOverlay.style.top =
        `${markerTop}px`;

    if (rowIndex >= getEndIndex()) {
        rowCounter.textContent = 'End';
    } else {
        rowCounter.textContent = `${rowIndex + 1}/${rowCount}`;
    }

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

function getEndIndex() {
    return getMaximumRow() + 1;
}


/*
 * Navigation
 */

function advance() {
    advanceHint.classList.add('hidden');

    if (rowIndex >= getEndIndex()) {
        rowIndex = 0;
    } else {
        rowIndex++;
    }

    update();
}

function goBack() {

    if (rowIndex === 0) {
        rowIndex = getEndIndex();
    } else {
        rowIndex--;
    }

    update();
}


function goToStart() {

    rowIndex = 0;
    update();
}


function goToEnd() {
    rowIndex = getEndIndex();
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

closeSetupButton.addEventListener('click', () => {
    setup.classList.add('hidden');
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

    rowIndex = Math.min(
        rowIndex,
        getEndIndex()
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
