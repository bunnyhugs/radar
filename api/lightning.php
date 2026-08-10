<?php
header('Content-Type: application/json');

$timestamp = $_GET['timestamp'] ?? '';

$url = "https://weather.gc.ca/api/app/v2/Lightning/1/" . urlencode($timestamp) . "?clusterDistance=0.5";

echo file_get_contents($url);

?>