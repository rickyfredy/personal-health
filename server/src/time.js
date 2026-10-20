// Wall-clock helpers. consumption_history stores plain wall-clock datetimes,
// so "today" / "the last 7 days" should follow the app timezone from .env
// (APP_TIMEZONE), not the server's own clock. We format through toLocaleString
// to get that timezone's calendar date as a string.

const TZ = process.env.APP_TIMEZONE || 'Asia/Singapore';

// Returns a Date object whose LOCAL fields represent wall-clock time in TZ.
// Trick: ask the Intl formatter for the parts, then reassemble a dummy UTC Date
// so subsequent get*() reads give the wall-clock values.
function localNow() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(new Date());
  return new Date(parts.replace(' ', 'T') + 'Z');
}

module.exports = { localNow, TZ };