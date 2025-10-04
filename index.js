import fs from "node:fs";
import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";

const calendar = await JSON.parse(fs.readFileSync("./metro/json/calendar.json"));
const routes = await JSON.parse(fs.readFileSync("./metro/json/routes.json"));
const stops = await JSON.parse(fs.readFileSync("./metro/json/stops.json"));
const stopTimes = await JSON.parse(fs.readFileSync("./metro/json/stop_times.json"));
const trips = await JSON.parse(fs.readFileSync("./metro/json/trips.json"));

const prettyTime = (realTime, arrivalTime) => {
  const realArray = realTime.split(":").map((s) => parseInt(s));
  const arrivalArray = arrivalTime.split(":").map((s) => parseInt(s));
  const realSeconds = realArray[0] * 60 * 60 + realArray[1] * 60 + realArray[2];
  const arrivalSeconds = arrivalArray[0] * 60 * 60 + arrivalArray[1] * 60 + arrivalArray[2];
  const difference = arrivalSeconds - realSeconds;
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
  return arrivalTime;
};

// Create connection to companion radio
const connection = new NodeJSSerialConnection(process.env.SERIAL_PORT);

// Initial Setup
connection.on("connected", async () => {
  console.log("Connected");

  // Sync Time
  console.log("Syncing Time...");
  await connection.syncDeviceTime();
  console.log("Time Synced");

  // Set Name
  await connection.setAdvertName(process.env.NODE_NAME);

  await connection.setAutoAddContacts(true);
});

connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();

    waitingMessages.forEach((message) => {
      if (message.contactMessage) {
        handleContactMessage(message.contactMessage);
      } else if (message.channelMessage) {
        handleChannelMessage(message.channelMessage);
      }
    });
  } catch (error) {
    console.log(error);
  }
});

const handleContactMessage = async (message) => {
  console.log("Contact Message Received");

  const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
  if (!contact) {
    console.log("No contact found for message");
    return;
  }
  const cleanedMessage = message.text.toLowerCase().trim();
  if (!cleanedMessage.length) {
    // send help message?
    return;
  }

  const separatorIndex = cleanedMessage.indexOf(" "); // Can be -1 or greater than 0, but never 0
  const messageArray =
    separatorIndex > 0
      ? [cleanedMessage.slice(0, separatorIndex), cleanedMessage.slice(separatorIndex + 1)]
      : [cleanedMessage];

  if (messageArray[0] === "help") {
    if (messageArray.length === 1) {
      await connection.sendTextMessage(
        contact.publicKey,
        "Send the stop number and optionally route number for scheduled arrivals. Ex: 120 G Line for alerts for stop 120 and G Line RapidRide.",
        Constants.TxtTypes.Plain
      );
      await connection.sendTextMessage(
        contact.publicKey,
        "Other commands: info, alerts",
        Constants.TxtTypes.Plain
      );
      return;
    }
    if (messageArray[1] === "info") {
      await connection.sendTextMessage(
        contact.publicKey,
        "Transit scheduling, geographic, and real-time data provided by permission of King County.",
        Constants.TxtTypes.Plain
      );
      return;
    }

    if (messageArray[1] === "alerts") {
      await connection.sendTextMessage(
        contact.publicKey,
        "Get alerts for a stop.\nEx: alerts 1120 for all alerts for stop 1120.\nEx: alerts 120 G Line for alerts for stop 120 and G Line RapidRide.",
        Constants.TxtTypes.Plain
      );
      return;
    }
    await connection.sendTextMessage(contact.publicKey, "No help found.", Constants.TxtTypes.Plain);
    return;
  }

  if (messageArray[0] === "alerts") {
    if (messageArray.length === 1) {
      await connection.sendTextMessage(
        contact.publicKey,
        "Get alerts for a stop.\nEx: alerts 1120 for all alerts for stop 1120.\nEx: alerts 120 G Line for alerts for stop 120 and G Line RapidRide.",
        Constants.TxtTypes.Plain
      );
      return;
    }

    if (messageArray.length === 2) {
      // all alerts for a stop
      // attempt to split messageArray[1] on a space to get stop and route
    }
  }

  if (messageArray[0] === "info") {
    await connection.sendTextMessage(
      contact.publicKey,
      "Transit scheduling, geographic, and real-time data provided by permission of King County.",
      Constants.TxtTypes.Plain
    );
    return;
  }

  // stop id and route id
  if (messageArray.length === 2) {
    const stop = stops.find((s) => s.stop_id === messageArray[0]);
    if (!stop) {
      await connection.sendTextMessage(
        contact.publicKey,
        "No stop found with that id.",
        Constants.TxtTypes.Plain
      );
      return;
    }
    const route = routes.find((r) => r.route_short_name.toLowerCase() === `\"${messageArray[1]}\"`);

    if (!route) {
      await connection.sendTextMessage(
        contact.publicKey,
        "No route found with that id.",
        Constants.TxtTypes.Plain
      );
      return;
    }
    const currentTime = new Date(Date.now()).toLocaleTimeString("en-US", { hour12: false });
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const currentDay = dayNames[new Date(Date.now()).getDay()];
    const trip = trips
      .filter((t) => t.route_id === route.route_id)
      .filter((t) => calendar.find((c) => c.service_id === t.service_id)[currentDay] === "1");
    const futureStopTimes = stopTimes
      .filter((stopTime) => stopTime.stop_id === stop.stop_id)
      .filter((stopTime) => stopTime.arrival_time >= currentTime);

    const matchingStops = [];
    futureStopTimes.forEach((s) => {
      trip.forEach((t) => {
        if (s.trip_id === t.trip_id) {
          matchingStops.push(s);
        }
      });
    });

    let response = `${stop.stop_name}`;
    if (matchingStops.length) {
      matchingStops
        .sort((a, b) => (a.arrival_time > b.arrival_time ? 1 : -1))
        .slice(0, 5)
        .map((ms) => (response += `\n${prettyTime(currentTime, ms.arrival_time)} (s)`));
    } else {
      response += "\nNo upcoming trips.";
    }

    await connection.sendTextMessage(contact.publicKey, response, Constants.TxtTypes.Plain);
    return;
  }

  // stop id
  if (messageArray.length === 1) {
    const stop = stops.find((stop) => stop.stop_id === messageArray[0]);
    if (!stop) {
      await connection.sendTextMessage(
        contact.publicKey,
        "No stop found with that id.",
        Constants.TxtTypes.Plain
      );
      return;
    }
    const currentTime = new Date(Date.now()).toLocaleTimeString("en-US", { hour12: false });
    const schedule = stopTimes
      .filter((stopTime) => stopTime.stop_id === stop.stop_id)
      .filter((stopTime) => stopTime.arrival_time >= currentTime);
    const nextArrivalByRoute = []; // { key: route_id, route_short_name, arrival_time }
    schedule.forEach((stopTime) => {
      const trip = trips.find((trip) => trip.trip_id === stopTime.trip_id);
      const route = routes.find((route) => route.route_id === trip.route_id);
      if (
        !nextArrivalByRoute[route.route_id] ||
        nextArrivalByRoute[route.route_id].arrival_time > stopTime.arrival_time
      ) {
        nextArrivalByRoute[route.route_id] = {
          route_short_name: route.route_short_name,
          arrival_time: stopTime.arrival_time,
        };
      }
    });

    let response = `${stop.stop_name}`;
    if (nextArrivalByRoute.length) {
      nextArrivalByRoute.forEach(
        (arrival) =>
          (response += `\n${arrival.route_short_name.replaceAll('"', "")} - ${prettyTime(
            currentTime,
            arrival.arrival_time
          )}`)
      );
    } else {
      response += "\nNo upcoming trips.";
    }
    await connection.sendTextMessage(contact.publicKey, response, Constants.TxtTypes.Plain);
    return;
  }

  await connection.sendTextMessage(
    contact.publicKey,
    "Transit scheduling, geographic, and real-time data provided by permission of King County.",
    Constants.TxtTypes.Plain
  );
  return;
};

const handleChannelMessage = async (message) => {
  console.log("Channel Message Received");
  const commandChannel = await connection.findChannelByName(process.env.BOT_CHANNEL);

  if (
    message.channelIdx === commandChannel.channelIdx &&
    message.text.toLowerCase().includes("bus")
  ) {
    await connection.sendChannelTextMessage(
      commandChannel.channelIdx,
      `King County Metro bus and route info available via DM.`
    );
    return;
  }
  return;
};

// Clean up contacts with auto-add contacts on
connection.on(Constants.PushCodes.Advert, async () => {
  const contacts = await connection.getContacts();
  // Filter out users and remove any room servers and repeaters
  await contacts
    .filter(({ type }) => type !== 1)
    .map(({ publicKey, advName }) => {
      console.log("Removing Contact:", advName);
      connection.removeContact(publicKey);
    });
});

connection.on("disconnected", () => {
  console.log("Disconnected");
});

// Connect to companion
await connection.connect();
