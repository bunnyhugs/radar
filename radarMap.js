let frameRate = 3;
const maxFrameRate = 12;
let timespan = 1;
let animationId = null;
let startTime = null;
let endTime = null;
let defaultTime = null;
let currentTime = null;

const parser = new DOMParser();

// Async function used to retrieve start and end time from RADAR_1KM_RRAI layer GetCapabilities document
async function getRadarStartEndTime() {
    // console.log("retrieve new data");
    let response = await fetch('https://geo.weather.gc.ca/geomet/?lang=en&service=WMS&request=GetCapabilities&version=1.3.0&LAYERS=RADAR_1KM_RRAI&t=' + new Date().getTime())
        let data = await response.text().then(
            data => {
            let xml = parser.parseFromString(data, 'text/xml');
            let [start, end] = xml.getElementsByTagName('Dimension')[0].innerHTML.split('/');
            let default_ = xml.getElementsByTagName('Dimension')[0].getAttribute('default');
            return [start, end, default_];
        })
        return [new Date(data[0]), new Date(data[1]), new Date(data[2])];
}

function formatISOToLocalTime(isoString) {
    const date = new Date(isoString);

    // Use toLocaleString with options to get the time string
    const timeOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
    };

    // Use toLocaleDateString with 'en-CA' locale to get the date in YYYY-MM-DD format
    const dateOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };

    let timeString = date.toLocaleString('en-US', timeOptions);
    let dateString = date.toLocaleDateString('en-CA', dateOptions);

    // Remove any space before 'AM' or 'PM'
    timeString = timeString.replace(' AM', 'am').replace(' PM', 'pm');

    return `${timeString}`;
}

function formatISOToLocal(isoString) {
    const date = new Date(isoString);

    // Use toLocaleString with options to get the time string
    const timeOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        // timeZoneName: 'short',
    };

    // Use toLocaleDateString with 'en-CA' locale to get the date in YYYY-MM-DD format
    const dateOptions = {
        // year: 'numeric',
        // /month: '2-digit',
        // day: '2-digit',
		weekday: 'short',
    };

    let timeString = date.toLocaleString('en-US', timeOptions);
    let dateString = date.toLocaleDateString('en-CA', dateOptions);

    // Remove any space before 'AM' or 'PM'
    timeString = timeString.replace(' AM', 'am').replace(' PM', 'pm');

    return `${timeString} ${dateString}`;
}

// The radar (RADAR_1KM_RRAI) and coverage-mask (RADAR_COVERAGE_RRAI.INV) layers
// are no longer given a live ol.source.ImageWMS. Instead their source is a plain
// ol.source.ImageStatic that we swap in ourselves (see the radar image cache
// below), so that we control exactly when a new image is requested.
let layers = [
    new ol.layer.Tile({
        source: new ol.source.OSM()
    }),
    new ol.layer.Image({
        opacity: 0.5
    }),
    new ol.layer.Image({
        opacity: 0.5
    })
];

// Restore the last saved view (center/zoom) if one exists, otherwise fall back
// to the default view centred on Edmonton.
const VIEW_STATE_KEY = 'radarViewState';

const getSavedViewState = () => {
	try {
		const saved = JSON.parse(localStorage.getItem(VIEW_STATE_KEY));
		if (saved && Array.isArray(saved.center) && typeof saved.zoom === 'number') {
			return saved;
		}
	} catch (e) {
		// Ignore malformed/inaccessible storage and fall back to defaults
	}
	return null;
};

const savedViewState = getSavedViewState();

let map = new ol.Map({
    target: 'map',
    layers: layers,
	interactions: ol.interaction.defaults.defaults({
		pinchRotate: false
	}),
	view: new ol.View({
        center: savedViewState ? savedViewState.center : ol.proj.fromLonLat([-113.4937, 53.5461]),
        zoom: savedViewState ? savedViewState.zoom : 9.5
    })
});

const citySource = new ol.source.Vector({
    url: './cities.geojson',
    format: new ol.format.GeoJSON()
});

const cityLayer = new ol.layer.Vector({
    source: citySource,
    style: function(feature, resolution) {
        const population = feature.get('population') || 0;
        const zoom = map.getView().getZoom();

        // Hide only very tiny places at world scale
        if (
            (zoom < 4 && population < 500000) ||
            (zoom < 5 && population < 50000) ||
            (zoom < 6 && population < 5000)
        ) {
            return null;
        }

        const radius =
            population >= 800000 ? 0 :
            population >= 100000 ? 6 :
            population >= 7500 ? 4 :
            0;

        const font =
            population >= 1000000 ? 'bold 16px sans-serif' :
            population >= 100000 ? 'bold 13px sans-serif' :
            '12px sans-serif';

        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: radius,
                fill: new ol.style.Fill({
                    color: 'rgba(255,255,255,0.5)'
                }),
                stroke: new ol.style.Stroke({
                    color: 'rgba(0,0,0,0.6)',
                    width: 2
                })
            })
/*,
            text: new ol.style.Text({
                text: feature.get('name'),
                font: font,
                offsetX: 10,
                textAlign: 'left',
                fill: new ol.style.Fill({
                    color: '#111'
                }),
                stroke: new ol.style.Stroke({
                    color: '#fff',
                    width: 3
                })
            })
*/
        });
    }
});

map.addLayer(cityLayer);

map.getView().on('change:resolution', () => {
    cityLayer.changed();
});

const lightningSource = new ol.source.Vector();
const lightningStyle = [
	new ol.style.Style({ 
		image: new ol.style.Circle({ 
			radius: 5, 
			opacity: 0.4,
			fill: new ol.style.Fill({ color: 'rgba(255,255,0,0.4)' }), 
			stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.6)', width: 1 }) 
		}) 
	}),
    new ol.style.Style({
        text: new ol.style.Text({
            text: '⚡',
            font: '1.2em sans-serif',
			opacity: 0.7,
            fill: new ol.style.Fill({
                color: 'rgba(255, 255, 0, 0.7)'
            })
        })
    })
];

const lightningLayer = new ol.layer.Vector({
    source: lightningSource,
    zIndex: 20,
    style: lightningStyle
});

map.addLayer(lightningLayer);


// Persist the current view (center/zoom) whenever the map finishes moving,
// so it can be restored the next time this device opens the app.
const saveViewState = () => {
	const view = map.getView();
	const state = {
		center: view.getCenter(),
		zoom: view.getZoom()
	};
	try {
		localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(state));
	} catch (e) {
		// localStorage may be unavailable (e.g. private browsing) - fail silently
	}
};

map.on('moveend', saveViewState);

const createRings = (center, numRings, spacing) => {
	const rings = [];
	for (let i = 1; i <= numRings; i++) {
		const radius = spacing * i;
		const circle = new ol.geom.Circle(center, radius);
		rings.push(new ol.Feature(circle));
	}
	return rings;
};

const updateRings = () => {
	const center = ol.proj.toLonLat(map.getView().getCenter());
	const transformedCenter = ol.proj.fromLonLat(center, 'EPSG:3857');
	const numRings = 10;  // Adjust as needed
	const spacing = 20000;  // 40 km in meters

	const ringFeatures = createRings(transformedCenter, numRings, spacing);
	ringSource.clear();
	ringSource.addFeatures(ringFeatures);
};

const ringSource = new ol.source.Vector();
const ringLayer = new ol.layer.Vector({
	source: ringSource,
	style: new ol.style.Style({
		stroke: new ol.style.Stroke({
			color: 'rgba(155, 0, 0, 0.25)',
			width: 1,
			lineDash: [10, 10]  // Dashed line style
		})
	})
});

map.addLayer(ringLayer);

map.getView().on('change:center', updateRings);
map.getView().on('change:resolution', updateRings);

// Initial ring update
updateRings();

const ringToggleButton = document.getElementById('gridBtn');
let ringsVisible = true;

ringToggleButton.addEventListener('click', () => {
	ringsVisible = !ringsVisible;
	ringLayer.setVisible(ringsVisible);
    if (ringsVisible) {
		ringToggleButton.firstElementChild.className = "fa fa-circle-dot";
	} else {
		ringToggleButton.firstElementChild.className = "fa fa-circle";
	}
});

/*
const createGrid = (extent, spacing) => {
	const gridLines = [];
	const [minX, minY, maxX, maxY] = extent;
	for (let x = minX; x <= maxX; x += spacing) {
		gridLines.push(new ol.geom.LineString([[x, minY], [x, maxY]]));
	}
	for (let y = minY; y <= maxY; y += spacing) {
		gridLines.push(new ol.geom.LineString([[minX, y], [maxX, y]]));
	}
	return gridLines;
};
const gridSpacing = 20000;  // 20 km in meters

const extent = ol.proj.transformExtent([-180, -90, 180, 90], 'EPSG:4326', 'EPSG:3857');
const gridLines = createGrid(extent, gridSpacing);

const gridSource = new ol.source.Vector({
	features: gridLines.map(line => new ol.Feature(line))
});

const gridLayer = new ol.layer.Vector({
	source: gridSource,
	style: new ol.style.Style({
		stroke: new ol.style.Stroke({
			color: 'rgba(0, 0, 0, 0.15)',
			width: 1,
			lineDash: [5, 100]
		})
	})
});

map.addLayer(gridLayer);
*/


function getStartTime() {
    let newStartTime = new Date(endTime);
    newStartTime.setUTCMinutes(newStartTime.getUTCMinutes() - 60 * timespan);
    if (newStartTime < startTime) {
        return startTime;
    } else {
        return newStartTime;
    }
}

function refreshTimes(currentIsLastFrame) {
    getRadarStartEndTime().then(data => {
        startTime = data[0];
        endTime = data[1];
        defaultTime = data[2];
        if (currentIsLastFrame) {
            currentTime = endTime;
        } else {
            currentTime = getStartTime();
        }
        // console.log("start end default current");
        // console.log(startTime);
        // console.log(endTime);
        // console.log(defaultTime);
        // console.log(currentTime);
        updateLayers();
        updateInfo();
        updateButtons();
    });

    // Call the function to check weather image existence
    checkWeatherImageExists();

}

// --- Loading indicator for geo.weather.gc.ca WMS images ---
const loadingIndicator = document.getElementById('loading-indicator');
let pendingLoads = 0;
let showLoadingTimer = null;
const LOADING_DEBOUNCE_MS = 150;

function onImageLoadStart() {
    pendingLoads++;
    if (showLoadingTimer === null) {
        showLoadingTimer = window.setTimeout(() => {
            if (pendingLoads > 0) {
                loadingIndicator.classList.add('is-loading');
            }
            showLoadingTimer = null;
        }, LOADING_DEBOUNCE_MS);
    }
}

function onImageLoadEnd() {
    pendingLoads = Math.max(0, pendingLoads - 1);
    if (pendingLoads === 0) {
        if (showLoadingTimer !== null) {
            window.clearTimeout(showLoadingTimer);
            showLoadingTimer = null;
        }
        loadingIndicator.classList.remove('is-loading');
    }

	showLightning();
}
// --- end loading indicator ---

// --- Fixed-area radar image cache ---
// GeoMet's RADAR_1KM_RRAI layer has a native resolution of 1 km/pixel, and
// its full-resolution image is 2880x1445 px - i.e. a 2880 km x 1445 km area.
// Rather than requesting whatever small bbox happens to be on screen (which
// would re-download on every tiny pan/zoom), we always request at least that
// full-resolution area, centered on the current view, and cache the result
// per timestamp. As long as the visible map stays within a cached frame's
// area, no new request is made; a new image is only downloaded when the
// user pans/zooms outside the cached area, or when a timestamp that hasn't
// been downloaded yet is requested.
const RADAR_LAYER_NAME = 'RADAR_1KM_RRAI';
const COVERAGE_LAYER_NAME = 'RADAR_COVERAGE_RRAI.INV';
const RADAR_RESOLUTION_M = 1000; // 1 km/pixel native resolution
const RADAR_IMAGE_WIDTH_PX = 2880;
const RADAR_IMAGE_HEIGHT_PX = 1445;
const RADAR_AREA_WIDTH_M = RADAR_IMAGE_WIDTH_PX * RADAR_RESOLUTION_M;   // 2,880 km
const RADAR_AREA_HEIGHT_M = RADAR_IMAGE_HEIGHT_PX * RADAR_RESOLUTION_M; // 1,445 km
const MAX_CACHED_FRAMES = 24; // keep memory/blob-URL usage bounded

// Map of TIME (ISO string) -> { extent, radarUrl, coverageUrl } for frames
// that have already been downloaded, where radarUrl/coverageUrl are local
// blob URLs (so re-displaying a cached frame never touches the network).
const radarImageCache = new Map();

// In-flight requests, keyed by TIME, so we don't fire duplicate downloads
// for the same frame while one is already loading (e.g. rapid stepping).
const pendingFrameRequests = new Map();

function getTimeKey(date) {
    return date.toISOString().split('.')[0] + 'Z';
}

// A fixed-size bbox (matching the source's native resolution/dimensions)
// centered on the given map-projection center point.
function getFixedExtentAroundCenter(center) {
    const halfWidth = RADAR_AREA_WIDTH_M / 2;
    const halfHeight = RADAR_AREA_HEIGHT_M / 2;
    return [
        center[0] - halfWidth,
        center[1] - halfHeight,
        center[0] + halfWidth,
        center[1] + halfHeight
    ];
}

async function fetchWmsImageBlobUrl(layerName, extent, timeKey) {
    const params = new URLSearchParams({
        SERVICE: 'WMS',
        VERSION: '1.3.0',
        REQUEST: 'GetMap',
        FORMAT: 'image/png',
        TRANSPARENT: 'true',
        LAYERS: layerName,
        CRS: 'EPSG:3857',
        WIDTH: String(RADAR_IMAGE_WIDTH_PX),
        HEIGHT: String(RADAR_IMAGE_HEIGHT_PX),
        BBOX: extent.join(','),
        TIME: timeKey
    });
    const response = await fetch(`https://geo.weather.gc.ca/geomet/?${params.toString()}`, {
        mode: 'cors'
    });
    if (!response.ok) {
        throw new Error(`WMS GetMap failed (${response.status}) for ${layerName} @ ${timeKey}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

function revokeCachedFrame(entry) {
    URL.revokeObjectURL(entry.radarUrl);
    URL.revokeObjectURL(entry.coverageUrl);
}

function evictOldestFrameIfNeeded() {
    while (radarImageCache.size > MAX_CACHED_FRAMES) {
        const oldestKey = radarImageCache.keys().next().value;
        revokeCachedFrame(radarImageCache.get(oldestKey));
        radarImageCache.delete(oldestKey);
    }
}

function applyFrame(entry) {
	
    const projection = map.getView().getProjection();
    layers[1].setSource(new ol.source.ImageStatic({
        url: entry.radarUrl,
        imageExtent: entry.extent,
        projection: projection
    }));
    layers[2].setSource(new ol.source.ImageStatic({
        url: entry.coverageUrl,
        imageExtent: entry.extent,
        projection: projection
    }));

	showLightning();
}

const lightningCache = new Map();

async function updateLightning() {
	const timestamp = currentTime.toISOString()
		.replace('T', '_')
		.replaceAll(':', '')
		.replace(/\.\d{3}Z$/, '');

    if (lightningCache.has(timestamp)) {
        return;
    }

    const url = `./api/lightning.php?timestamp=${encodeURIComponent(timestamp)}`;

    const response = await fetch(url);
    const data = await response.json();

    const features = data.features.map(strike => {
        return new ol.Feature({
            geometry: new ol.geom.Point(
                ol.proj.fromLonLat(strike.geometry.coordinates)
            )
        });
    });

    lightningCache.set(timestamp, features);
}

function showLightning() {
	const timestamp = currentTime.toISOString()
		.replace('T', '_')
		.replaceAll(':', '')
		.replace(/\.\d{3}Z$/, '');

    if (lightningCache.has(timestamp)) {
        lightningSource.clear();
        lightningSource.addFeatures(
            lightningCache.get(timestamp)
        );
        return;
    }
}

// Ensure the given timestamp is displayed, downloading a new fixed-area
// image only if it hasn't been cached yet, or the cached area no longer
// covers the current view.
async function loadRadarFrame(timeKey) {

    const view = map.getView();
    const viewExtent = view.calculateExtent(map.getSize());
    const cached = radarImageCache.get(timeKey);

    if (cached && ol.extent.containsExtent(cached.extent, viewExtent)) {
        // Already have imagery covering the current view for this time.
        applyFrame(cached);
        return;
    }

    if (pendingFrameRequests.has(timeKey)) {
        // A request for this timestamp is already in flight; let it finish
        // rather than firing a duplicate download.
        return;
    }

    const extent = getFixedExtentAroundCenter(view.getCenter());

    onImageLoadStart();
    const requestPromise = (async () => {
        try {
            const [radarUrl, coverageUrl] = await Promise.all([
                fetchWmsImageBlobUrl(RADAR_LAYER_NAME, extent, timeKey),
                fetchWmsImageBlobUrl(COVERAGE_LAYER_NAME, extent, timeKey)
            ]);

            const stale = radarImageCache.get(timeKey);
            if (stale) {
                revokeCachedFrame(stale);
            }

            const entry = { extent, radarUrl, coverageUrl };
            radarImageCache.set(timeKey, entry);
            evictOldestFrameIfNeeded();

            // Only draw it if this is still the frame currently selected
            // (avoids flicker back to a stale frame on slow connections).
            if (currentTime && getTimeKey(currentTime) === timeKey) {
                applyFrame(entry);
            }
        } catch (err) {
            console.error(err);
            // Likely requested a time outside the valid range - refresh it.
            refreshTimes();
        } finally {
            onImageLoadEnd();
            pendingFrameRequests.delete(timeKey);
        }
    })();

    pendingFrameRequests.set(timeKey, requestPromise);
    await requestPromise;
}

// Re-check the current frame whenever the view stops moving: if the user
// panned/zoomed outside the cached area, this downloads a new fixed-area
// image centered on the new view; otherwise it's a no-op.
map.on('moveend', () => {
    if (currentTime) {
        loadRadarFrame(getTimeKey(currentTime));
    }
});
// --- end fixed-area radar image cache ---

function updateLayers() {
	updateLightning();
    loadRadarFrame(getTimeKey(currentTime));
}

function updateInfo() {
    let el = document.getElementById('infop');
    el.innerHTML = `${formatISOToLocal(currentTime.toISOString().substr(0, 16) + "Z")}`

        el = document.getElementById('speed');
    el.innerHTML = `${frameRate}x`
}

function restartAnimation() {
    fastBackward();
    togglePlayPause();
}

// Disable/enable buttons depending on the state of the map
function updateButtons() {
    if (animationId !== null) {
        disableButtons([fastBackwardButton, stepBackwardButton, stepForwardButton, fastForwardButton]);
        enableButtons([playPauseButton]);
    } else {
        if (currentTime <= startTime) {
            disableButtons([fastBackwardButton, stepBackwardButton]);
            enableButtons([playPauseButton, stepForwardButton, fastForwardButton]);
        } else if (currentTime >= endTime) {
            // disableButtons([playPauseButton, stepForwardButton, fastForwardButton]);
            enableButtons([fastBackwardButton, stepBackwardButton]);
        } else {
            enableButtons([fastBackwardButton, stepBackwardButton, playPauseButton, stepForwardButton, fastForwardButton]);
        }
    }
}

function disableButtons(buttons) {
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
    }
}

function enableButtons(buttons) {
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = false;
    }
}

function setTime() {
    if (currentTime >= endTime) {
        // last frame
        // console.log(endTime);
        currentTime = endTime;
        togglePlayPause();
        // restart
        window.setTimeout(restartAnimation, 2000 / frameRate);

    } else {
        currentTime = new Date(currentTime);
        currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 6);
    }
    updateLayers();
    updateInfo();
}

function togglePlayPause() {
    if (animationId !== null) {
        playPauseButton.firstElementChild.className = "fa fa-play"
            window.clearInterval(animationId);
        animationId = null;
        updateButtons();
    } else {
        playPauseButton.firstElementChild.className = "fa fa-pause"
            animationId = window.setInterval(setTime, 1000 / frameRate);
        updateButtons();
    }
}

function fastBackward() {
    if (animationId == null && currentTime > startTime) {
        refreshTimes();
    }
}

function stepBackward() {
    if (animationId == null && currentTime > startTime) {
        currentTime = new Date(currentTime);
        currentTime.setUTCMinutes(currentTime.getUTCMinutes() - 6);
        if (currentTime.getTime() === startTime.getTime()) {
            refreshTimes();
        } else {
            updateLayers();
            updateInfo();
            updateButtons();
        }
    }
}

function stepForward() {
    if (animationId == null && currentTime < endTime) {
        currentTime = new Date(currentTime);
        currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 6);
        updateLayers();
        updateInfo();
        updateButtons();
    }
}

function fastForward() {
    if (animationId == null && currentTime < endTime) {
        currentTime = new Date(endTime);
        updateLayers();
        updateInfo();
        updateButtons();
    }
}

function speedUp() {
    frameRate += 0.5;
    if (frameRate >= maxFrameRate) {
        frameRate = maxFrameRate;
    }
	updateInfo();
    togglePlayPause();
    togglePlayPause();
}

function speedDown() {
    frameRate -= 0.5;
    if (frameRate <= 0.5) {
        frameRate = 0.5;
    }
	updateInfo();
    togglePlayPause();
    togglePlayPause();
}

function toggleTimespan() {
    var iconElement = document.querySelector('#timespan i');
    if (iconElement.classList.contains('fa-hourglass-half')) {
        iconElement.classList.remove('fa-hourglass-half');
        iconElement.classList.add('fa-hourglass-start');
        timespan = 3;
    } else {
        iconElement.classList.remove('fa-hourglass-start');
        iconElement.classList.add('fa-hourglass-half');
        timespan = 1;
    }
}

let fastBackwardButton = document.getElementById('fast-backward');
fastBackwardButton.addEventListener('click', fastBackward, false);

let stepBackwardButton = document.getElementById('step-backward');
stepBackwardButton.addEventListener('click', stepBackward, false);

let playPauseButton = document.getElementById('play-pause');
playPauseButton.addEventListener('click', togglePlayPause, false);

let stepForwardButton = document.getElementById('step-forward');
stepForwardButton.addEventListener('click', stepForward, false);

let fastForwardButton = document.getElementById('fast-forward');
fastForwardButton.addEventListener('click', fastForward, false);

let speedUpButton = document.getElementById('speed-up');
speedUpButton.addEventListener('click', speedUp, false);

let speedDownButton = document.getElementById('speed-down');
speedDownButton.addEventListener('click', speedDown, false);

let timespanButton = document.getElementById('timespan');
timespanButton.addEventListener('click', toggleTimespan, false);

// Initialize the map
function initMap() {
    getRadarStartEndTime().then(data => {
        startTime = data[0];
        endTime = data[1];
        currentTime = defaultTime = data[2]; // end
        // currentTime = startTime = data[0]; // start
        updateLayers();
        updateInfo();
        updateButtons();

        checkWeatherImageExists();

        window.setTimeout(togglePlayPause, 2000);
    })
}
initMap();

async function checkWeatherImageExists() {
    // Create a date object
    let currentDate = endTime;

    // Function to format date to desired string format
    function formatDate(date) {
        let year = date.getUTCFullYear();
        let month = String(date.getUTCMonth() + 1).padStart(2, '0');
        let day = String(date.getUTCDate()).padStart(2, '0');
        let hours = String(date.getUTCHours()).padStart(2, '0');
        let minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}`;
    }

    // Get the formatted date prefix
    let datePrefix = formatDate(currentDate);
	let time = formatISOToLocalTime(currentDate.toISOString());

    // Add 6 minutes to the current date
    currentDate.setUTCMinutes(currentDate.getUTCMinutes() + 6);
    let datePrefixPlus6 = formatDate(currentDate);
	let timePlus6 = formatISOToLocalTime(currentDate.toISOString());

    // Create URLs with the date prefixes
    let url1 = `./api/CAPPI/${datePrefixPlus6}_CASCV_CAPPI_1.5_RAIN.gif`;
    let url2 = `./api/CAPPI/${datePrefix}_CASCV_CAPPI_1.5_RAIN.gif`;

    // Function to check if URL exists
    async function urlExists(url) {
        try {
            const response = await fetch(url);
            // console.log(response);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    let radarFetch = await urlExists('./api/getRadar.php');
    let radarImg = document.getElementById("radar");
    let overlay = document.getElementById("overlay");
    // Check if URL with added 6 minutes exists
    let url1Exists = await urlExists(url1);
    if (url1Exists) {
        // console.log(`URL '${url1}' exists.`);
        radarImg.src = url1;
		radarImg.alt = radarImg.title = overlay.alt = overlay.title = timePlus6;
    } else {
        // Check if URL without added 6 minutes exists
        let url2Exists = await urlExists(url2);
        if (url2Exists) {
            radarImg.src = url2;
			radarImg.alt = radarImg.title = overlay.alt = overlay.title = time;
            // console.log(`URL '${url2}' exists.`);
        } else {
            console.log(`Neither '${url1}' nor '${url2}' exists.`);
			let radarBackup1 = document.getElementById("radarbackup1");
			let radarBackup2 = document.getElementById("radarbackup2");
			radarBackup1.src = `https://dd.weather.gc.ca/radar/CAPPI/GIF/CASCV/${datePrefixPlus6}_CASCV_CAPPI_1.5_RAIN.gif`;
			radarBackup2.src = `https://dd.weather.gc.ca/radar/CAPPI/GIF/CASCV/${datePrefix}_CASCV_CAPPI_1.5_RAIN.gif`;
			radarBackup1.alt = radarBackup1.title = overlay.alt = overlay.title = timePlus6;
			radarBackup2.alt = radarBackup2.title = overlay.alt = overlay.title = time;

        }
    }
}

// Function to make an element draggable
function makeDraggable(element) {
    let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;
    element.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function initLegend() {
    // JavaScript to make the popup draggable and toggle its visibility
    // Get references to the elements
    const legendBtn = document.getElementById('legendBtn');
    const legendPopup = document.getElementById('legendPopup');
    let clickToHideListener = null;

    // Function to show the popup
    function showPopup() {
        console.log("showPopup");
        legendPopup.style.display = 'block';
        // Make the popup draggable
        makeDraggable(legendPopup);

        if (!clickToHideListener) {
            clickToHideListener = hidePopup.bind(null); // Bind the clickToHidePopup function
            setTimeout(() => {
                window.addEventListener('click', clickToHideListener);
            }, 0);
        }

    }

    // Function to hide the popup
    function hidePopup() {
        console.log("hidePopup");
        legendPopup.style.display = 'none';
        if (clickToHideListener) {
            window.removeEventListener('click', clickToHideListener);
            clickToHideListener = null;
        }
    }

    // Event listener for the button click
    legendBtn.addEventListener('click', showPopup);
}

function initRadar() {

    // JavaScript to make the popup draggable and toggle its visibility
    // Get references to the elements
    const radarButton = document.getElementById('radarBtn');
    const radar = document.getElementById('radarInset');
    let clickToHideListener = null;

    // Function to show the popup
    function showRadar() {
        console.log("showRadar");
        radar.style.display = 'block';
        // Make the popup draggable
        makeDraggable(radar);

        if (!clickToHideListener) {
            clickToHideListener = clickToHideRadar.bind(null); // Bind the clickToHidePopup function
            setTimeout(() => {
                window.addEventListener('click', clickToHideListener);
            }, 0);
        }

    }

    function hideRadar() {
        console.log("hideRadar");
        radar.style.display = 'none';
        if (clickToHideListener) {
            window.removeEventListener('click', clickToHideListener);
            clickToHideListener = null;
        }
    }

    // Function to hide the popup
    function clickToHideRadar() {
        if (event.target !== radar && !radar.contains(event.target)) {
            // Click is outside the popup, hide it
            hideRadar();
        }
    }
    // Event listener for the button click
    radarButton.addEventListener('click', showRadar, false);

}

document.addEventListener('DOMContentLoaded', (event) => {
	console.log("init");
    initLegend();
    initRadar();
});