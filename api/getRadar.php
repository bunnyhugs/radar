<?php

// URL of the directory index
// $url = 'https://dd.weather.gc.ca/radar/CAPPI/GIF/CASCV/';

// Base root (date will be appended later)
$baseUrl = 'https://dd.weather.gc.ca/';

// Local folder to save downloaded files
$localFolder = './CAPPI/';

// Function to download a file from URL to local directory if it doesn't exist
function downloadFileIfNotExists($url, $localFolder) {
    $filename = basename($url);
    $destination = $localFolder . $filename;

    // Check if file already exists locally
    if (!file_exists($destination)) {
        file_put_contents($destination, file_get_contents($url));
    }
    
    return $filename;
}

// Function to fetch the latest prefix from directory listing
function fetchLatestPrefix($url) {
    // Get directory listing
    $contents = file_get_contents($url);

    // Regex pattern to match filenames with the prefix (YYYYMMDDHHMM_)
    $pattern = '/<a\s+(?:[^>]*?\s+)?href="([^"]*?(\d{12})_[^"]*)"/i';

    // Find all matching links
    preg_match_all($pattern, $contents, $matches);

    // Extract all prefixes
    $prefixes = $matches[2];

    // Initialize variables to find the latest prefix
    $latestPrefix = null;
    $latestTimestamp = 0;

    // Loop through found prefixes to determine the latest one
    foreach ($prefixes as $prefix) {
        // Convert prefix to a timestamp
        $timestamp = strtotime(substr($prefix, 0, 12));

        // Check if this timestamp is the latest
        if ($timestamp > $latestTimestamp) {
            $latestTimestamp = $timestamp;
            $latestPrefix = $prefix;
        }
    }

    return $latestPrefix;
}

// Function to download files with a specific prefix if they don't exist locally
function downloadFilesWithPrefix($url, $prefix, $localFolder) {
    $files = [];

    // Get directory listing
    $contents = file_get_contents($url);

    // Regex pattern to match filenames with the specified prefix
    $pattern = '/<a\s+(?:[^>]*?\s+)?href="([^"]*?' . preg_quote($prefix) . '[^"]*)"/i';

    // Find all matching links
    preg_match_all($pattern, $contents, $matches);

    // If matches found, download each file if it doesn't exist locally
    if (isset($matches[1])) {
        foreach ($matches[1] as $file) {
            $fileUrl = $url . $file;
            $files[] = downloadFileIfNotExists($fileUrl, $localFolder);
        }
    }

    return $files;
}

// Function to remove files with old prefixes from directory
function removeOldFiles($directory, $hours) {
    $dir = opendir($directory);

    // Convert hours to seconds
    $thresholdTime = time() - ($hours * 3600);

    while (($file = readdir($dir)) !== false) {
        $filePath = $directory . $file;
        
        // Check if the file is a regular file and its prefix is older than the threshold
        if (is_file($filePath)) {
            $filePrefix = substr($file, 0, 12); // Extract prefix (YYYYMMDDHHMM)
            $fileTimestamp = strtotime($filePrefix);

            // If the file prefix timestamp is older than the threshold timestamp, delete it
            if ($fileTimestamp < $thresholdTime) {
                unlink($filePath);
            }
        }
    }

    closedir($dir);
}
/*
// Fetch the latest prefix from the directory listing
$latestPrefix = fetchLatestPrefix($url);

// Download files with the latest prefix if they don't exist locally
if (!empty($latestPrefix)) {
    $downloadedFiles = downloadFilesWithPrefix($url, $latestPrefix, $localFolder);
}
*/
/**
 * STEP 1: Try today's directory first
 */
$today = gmdate('Ymd');
$url = $baseUrl . $today . '/WXO-DD/radar/CAPPI/GIF/CASCV/';

$latestPrefix = fetchLatestPrefix($url);

/**
 * STEP 2: If nothing found, try yesterday (fallback)
 */
if (empty($latestPrefix)) {
    $yesterday = gmdate('Ymd', time() - 86400);
    $url = $baseUrl . $yesterday . '/WXO-DD/radar/CAPPI/GIF/CASCV/';
    $latestPrefix = fetchLatestPrefix($url);
}

/**
 * STEP 3: If prefix found, rebuild URL using its date
 */
if (!empty($latestPrefix)) {
    $dateFromPrefix = substr($latestPrefix, 0, 8);

    $url = $baseUrl . $dateFromPrefix . '/WXO-DD/radar/CAPPI/GIF/CASCV/';

    $downloadedFiles = downloadFilesWithPrefix($url, $latestPrefix, $localFolder);
}


removeOldFiles($localFolder, 3); // Remove files older than 3 hours

?>