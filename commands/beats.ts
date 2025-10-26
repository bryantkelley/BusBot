export const beats = () => {
  const currentTime = new Date();
  // .beat time is UTC+1 offset, so add one and get the remainder so 25 becomes 1
  const currentHour = (currentTime.getUTCHours() + 1) % 24;
  const currentSeconds =
    currentHour * 3600 + currentTime.getUTCMinutes() * 60 + currentTime.getUTCSeconds();
  // current seconds divided by seconds in a day divided by 1000 beats per day
  const beatsTime = Math.round(currentSeconds / 86.4);
  return `.beat time: @${beatsTime}`;
};
