type RegexMatchedString<Pattern extends string> = `${string & { __brand: Pattern }}`;
export type TimeString = RegexMatchedString<"d{2}:d{2}:d{2}">;

// Takes the current time and future time as HH:MM:SS local timezone strings
export const prettyTime = (currentTime: TimeString, futureTime: TimeString) => {
  const currentArray = currentTime.split(":").map((s) => parseInt(s));
  const futureArray = futureTime.split(":").map((s) => parseInt(s));
  const currentSeconds = currentArray[0] * 60 * 60 + currentArray[1] * 60 + currentArray[2];
  const arrivalSeconds = futureArray[0] * 60 * 60 + futureArray[1] * 60 + futureArray[2];
  const difference = arrivalSeconds - currentSeconds;
  if (difference < 75) {
    // less than 75 seconds
    return "now";
  }
  if (difference < 120) {
    // less than 2 minutes
    return `1 min`;
  }
  if (difference < 60 * 60) {
    // less than an hour
    return `${Math.floor(difference / 60)} mins`;
  }
  return futureTime;
};
