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
  let response = await fetch('https://geo.weather.gc.ca/geomet/?lang=en&service=WMS&request=GetCapabilities&version=1.3.0&LAYERS=RADAR_1KM_RRAI&t=' + new Date().getTime())
  let data = await response.text().then(
    data => {
      let xml = parser.parseFromString(data, 'text/xml');
      let [start, end] = xml.getElementsByTagName('Dimension')[0].innerHTML.split('/');
      let default_ = xml.getElementsByTagName('Dimension')[0].getAttribute('default');
      return [start, end, default_];
    }
  )
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
      params: {'LAYERS': 'RADAR_1KM_RRAI', 'TILED': true},
      crossOrigin: 'Anonymous'
    }),
	opacity: 0.5
	
  }),
  new ol.layer.Image({
    source: new ol.source.ImageWMS({
      format: 'image/png',
      url: 'https://geo.weather.gc.ca/geomet/',
      params: {'LAYERS': 'RADAR_COVERAGE_RRAI.INV', 'TILED': true},
      transition: 0,
      crossOrigin: 'Anonymous'
    }),
	opacity: 0.5

  })
];

let map = new ol.Map({
  target: 'map',
  layers: layers,
  view: new ol.View({
    center: ol.proj.fromLonLat([-113.4937, 53.5461]),
    zoom: 9.5
  })
});

// If the image couldn't load due to a change in the time extent, get the new time extent
layers[1].getSource().on("imageloaderror", () => {
  getRadarStartEndTime().then(data => {
    currentTime = startTime = data[0];
    endTime = data[1];
    defaultTime = data[2];
    updateLayers();
    updateInfo();
    updateButtons();
  })
});

function updateLayers() {
  layers[1].getSource().updateParams({'TIME': currentTime.toISOString().split('.')[0]+"Z"});
  layers[2].getSource().updateParams({'TIME': currentTime.toISOString().split('.')[0]+"Z"});
}

function updateInfo() {
  let el = document.getElementById('info');
  el.innerHTML = `${formatISOToLocal(currentTime.toISOString().substr(0, 16)+"Z")}`
  
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
  for (var i = 0; i < buttons.length; i++){
    buttons[i].disabled = true;
  }
}

function enableButtons(buttons) {
  for (var i = 0; i < buttons.length; i++){
    buttons[i].disabled = false;
  }
}

function setTime() {
  if (currentTime >= endTime) {
    // last frame
	console.log(endTime);
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
    getRadarStartEndTime().then(data => {
      currentTime = startTime = data[0];
      endTime = data[1];
      defaultTime = data[2];
      updateLayers();
      updateInfo();
      updateButtons();
    })
  }
}

function stepBackward() {
  if (animationId == null && currentTime > startTime) {
    currentTime = new Date(currentTime);
    currentTime.setUTCMinutes(currentTime.getUTCMinutes() - 6);
    if (currentTime.getTime() === startTime.getTime()) {
		getRadarStartEndTime().then(data => {
		  currentTime = startTime = data[0];
		  endTime = data[1];
		  defaultTime = data[2];
		  updateLayers();
		  updateInfo();
		  updateButtons();
		});
    }
    else {
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
      } else {
        iconElement.classList.remove('fa-hourglass-start');
        iconElement.classList.add('fa-hourglass-half');
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
    window.setTimeout(togglePlayPause, 2000);
  })
}
initMap();