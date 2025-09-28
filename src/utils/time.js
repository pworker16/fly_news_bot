// Time helpers
export function minutesAgo(date, now = new Date()) {
return (now - date) / 60000;
}


export function isFresh(date, maxMinutes = 60) {
return minutesAgo(date) <= maxMinutes;
}