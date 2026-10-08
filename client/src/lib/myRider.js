// Remembers which rider uses this phone, set when they open their own
// tracker link. The board uses it to let them call squad mates.
const KEY = "fc_my_rider_id";

export function getMyRiderId() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setMyRiderId(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable — calling from the board just won't be enabled
  }
}
