/* Name of the file: tutorial.js */

let layers_to_add = [
    new ol.layer.Tile({
      source: new ol.source.OSM()
    }),
    new ol.layer.Tile({
      opacity: 0.4,
      source: new ol.source.TileWMS({
        url: 'https://geo.weather.gc.ca/geomet/',
        params: {'LAYERS': 'GDPS.ETA_TT', 'TILED': true},
        transition: 0
      })
    })
  ];

let map = new ol.Map({
  target: 'map',
  layers: layers_to_add,
  view: new ol.View({
    center: ol.proj.fromLonLat([-97, 57]),
    zoom: 0
  })
});