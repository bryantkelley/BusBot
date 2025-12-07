// help
export const help = () => {
  return "Commands:\n• alerts\n• bus\n• info\n---\n• beats";
};

// help alerts
export const helpAlerts = () => {
  return "Get alerts for a stop. Ex:\nalerts 1120";
};

// help beats
export const helpBeats = () => {
  return "Returns the current time in .beats (Swatch Internet Time)";
};

// help bus
export const helpBus = () => {
  return "Use bus [stop] or bus [stop] [route] for scheduled arrivals. Ex:\nbus 11040\nbus 1120 11\nbus 120 G Line\nbus 1651 First Hill Streetcar";
};

// help info
export const helpInfo = () => {
  return "Transit scheduling, geographic, and real-time data provided by permission of King County.";
};
