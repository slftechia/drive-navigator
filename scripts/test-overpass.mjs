const query = `[out:json][timeout:15];
(
  node(around:8000,-27.59,-48.55)["traffic_calming"];
  node(around:8000,-27.59,-48.55)["highway"="speed_camera"];
  node(around:8000,-30.03,-51.23)["traffic_calming"];
);
out body;`;

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'DriveNavigator/1.0',
    Accept: 'application/json',
  },
  body: `data=${encodeURIComponent(query)}`,
});
console.log('status', res.status);
const data = await res.json();
console.log('elements', data.elements?.length ?? 0);
console.log('sample', data.elements?.slice(0, 3));
