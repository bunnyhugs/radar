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

function formatISOToLocal(isoString) {
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

    return `${timeString} ${dateString}`;
}

let layers = [
    new ol.layer.Tile({
        source: new ol.source.OSM()
    }),
    new ol.layer.Image({
        source: new ol.source.ImageWMS({
            format: 'image/png',
            url: 'https://geo.weather.gc.ca/geomet/',
            params: {
                'LAYERS': 'RADAR_1KM_RRAI',
                'TILED': true
            },
            crossOrigin: 'Anonymous'
        }),
        opacity: 0.5

    }),
    new ol.layer.Image({
        source: new ol.source.ImageWMS({
            format: 'image/png',
            url: 'https://geo.weather.gc.ca/geomet/',
            params: {
                'LAYERS': 'RADAR_COVERAGE_RRAI.INV',
                'TILED': true
            },
            transition: 0,
            crossOrigin: 'Anonymous'
        }),
        opacity: 0.5

    })
];

let map = new ol.Map({
    target: 'map',
    layers: layers,
	interactions: ol.interaction.defaults.defaults({
		pinchRotate: false
	}),
	view: new ol.View({
        center: ol.proj.fromLonLat([-113.4937, 53.5461]),
        zoom: 9.5
    })
});

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

// If the image couldn't load due to a change in the time extent, get the new time extent
layers[1].getSource().on("imageloaderror", () => {
    refreshTimes();
});

function updateLayers() {
    layers[1].getSource().updateParams({
        'TIME': currentTime.toISOString().split('.')[0] + "Z"
    });
    layers[2].getSource().updateParams({
        'TIME': currentTime.toISOString().split('.')[0] + "Z"
    });
}

function updateInfo() {
    let el = document.getElementById('info');
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
    togglePlayPause();
    togglePlayPause();
}

function speedDown() {
    frameRate -= 0.5;
    if (frameRate <= 0.5) {
        frameRate = 0.5;
    }
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

    // Add 6 minutes to the current date
    currentDate.setUTCMinutes(currentDate.getUTCMinutes() + 6);
    let datePrefixPlus6 = formatDate(currentDate);

    // Create URLs with the date prefixes
    let url1 = `./CAPPI/${datePrefixPlus6}_CASCV_CAPPI_1.5_RAIN.gif`;
    let url2 = `./CAPPI/${datePrefix}_CASCV_CAPPI_1.5_RAIN.gif`;

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

    let radarFetch = await urlExists('./getRadar.php');
    let radarImg = document.getElementById("radar");
    // Check if URL with added 6 minutes exists
    let url1Exists = await urlExists(url1);
    if (url1Exists) {
        // console.log(`URL '${url1}' exists.`);
        radarImg.src = url1;
    } else {
        // Check if URL without added 6 minutes exists
        let url2Exists = await urlExists(url2);
        if (url2Exists) {
            radarImg.src = url2;
            // console.log(`URL '${url2}' exists.`);
        } else {
            console.log(`Neither '${url1}' nor '${url2}' exists.`);
			let radarBackup1 = document.getElementById("radarbackup1");
			let radarBackup2 = document.getElementById("radarbackup2");
			radarBackup1.src = `https://dd.weather.gc.ca/radar/CAPPI/GIF/CASCV/${datePrefixPlus6}_CASCV_CAPPI_1.5_RAIN.gif`;
			radarBackup2.src = `https://dd.weather.gc.ca/radar/CAPPI/GIF/CASCV/${datePrefix}_CASCV_CAPPI_1.5_RAIN.gif`;
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
