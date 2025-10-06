import { readFileSync } from "node:fs";
import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import { prettyTime, TimeString } from "./utils";
import { alerts, help, helpAlerts, helpBus, helpInfo, info } from "./commands";

const calendar = await JSON.parse(readFileSync("./metro/json/calendar.json", "utf8"));
const routes = await JSON.parse(readFileSync("./metro/json/routes.json", "utf8"));
const stops = await JSON.parse(readFileSync("./metro/json/stops.json", "utf8"));
const stopTimes = await JSON.parse(readFileSync("./metro/json/stop_times.json", "utf8"));
const trips = await JSON.parse(readFileSync("./metro/json/trips.json", "utf8"));

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

  await connection.setAutoAddContacts();

  console.log("Sending Advert");
  await connection.sendFloodAdvert();
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

const handleContactMessage = async (message: any) => {
  console.log("Contact Message Received");

  const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
  if (!contact) {
    console.log("No contact found for message");
    return;
  }
  const cleanedMessage = message.text.toLowerCase().trim();

  let reply = "";
  if (cleanedMessage.beginsWith("help")) {
    if (cleanedMessage === "help alerts") {
      reply = helpAlerts();
    } else if (cleanedMessage === "help bus") {
      reply = helpBus();
    } else if (cleanedMessage === "help info") {
      reply = helpInfo();
    } else {
      reply = help();
    }
  } else if (cleanedMessage.beginsWith("info")) {
    reply = info();
  } else if (cleanedMessage.beginsWith("alerts")) {
    reply = alerts();
  } else if (cleanedMessage.beginsWith("bus")) {
    const separatorIndex = cleanedMessage.indexOf(" "); // Can be -1 or greater than 0, but never 0
    const messageArray =
      separatorIndex > 0
        ? [cleanedMessage.slice(0, separatorIndex), cleanedMessage.slice(separatorIndex + 1)]
        : [cleanedMessage];

    // stop id and route id
    if (messageArray.length === 2) {
      const stop = stops.find((s: any) => s.stop_id === messageArray[0]);
      if (!stop) {
        await connection.sendTextMessage(
          contact.publicKey,
          "No stop found with that id.",
          Constants.TxtTypes.Plain
        );
        return;
      }
      const route = routes.find(
        (r: any) => r.route_short_name.toLowerCase() === `\"${messageArray[1]}\"`
      );

      if (!route) {
        await connection.sendTextMessage(
          contact.publicKey,
          "No route found with that id.",
          Constants.TxtTypes.Plain
        );
        return;
      }
      const currentTime = new Date(Date.now()).toLocaleTimeString("en-US", {
        hour12: false,
      }) as TimeString;
      const dayNames = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const currentDay = dayNames[new Date(Date.now()).getDay()];
      const trip = trips
        .filter((t: any) => t.route_id === route.route_id)
        .filter(
          (t: any) => calendar.find((c: any) => c.service_id === t.service_id)[currentDay] === "1"
        );
      const futureStopTimes = stopTimes
        .filter((stopTime: any) => stopTime.stop_id === stop.stop_id)
        .filter((stopTime: any) => stopTime.arrival_time >= currentTime);

      const matchingStops: any[] = [];
      futureStopTimes.forEach((s: any) => {
        trip.forEach((t: any) => {
          if (s.trip_id === t.trip_id) {
            matchingStops.push(s);
          }
        });
      });

      reply = `${stop.stop_name}`;
      if (matchingStops.length) {
        matchingStops
          .sort((a, b) => (a.arrival_time > b.arrival_time ? 1 : -1))
          .slice(0, 5)
          .map((ms) => (reply += `\n${prettyTime(currentTime, ms.arrival_time)} (s)`));
      } else {
        reply += "\nNo upcoming trips.";
      }
    }

    // stop id
    if (messageArray.length === 1) {
      const stop = stops.find((stop: any) => stop.stop_id === messageArray[0]);
      if (!stop) {
        await connection.sendTextMessage(
          contact.publicKey,
          "No stop found with that id.",
          Constants.TxtTypes.Plain
        );
        return;
      }
      const currentTime = new Date(Date.now()).toLocaleTimeString("en-US", {
        hour12: false,
      }) as TimeString;
      const schedule = stopTimes
        .filter((stopTime: any) => stopTime.stop_id === stop.stop_id)
        .filter((stopTime: any) => stopTime.arrival_time >= currentTime);
      const nextArrivalByRoute: any[] = []; // { key: route_id, route_short_name, arrival_time }
      schedule.forEach((stopTime: any) => {
        const trip = trips.find((trip: any) => trip.trip_id === stopTime.trip_id);
        const route = routes.find((route: any) => route.route_id === trip.route_id);
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

      reply = `${stop.stop_name}`;
      if (nextArrivalByRoute.length) {
        nextArrivalByRoute.forEach(
          (arrival) =>
            (reply += `\n${arrival.route_short_name.replaceAll('"', "")} - ${prettyTime(
              currentTime,
              arrival.arrival_time
            )}`)
        );
      } else {
        reply += "\nNo upcoming trips.";
      }
    }
  }

  await connection.sendTextMessage(contact.publicKey, reply, Constants.TxtTypes.Plain);
  return;
};

const handleChannelMessage = async (message: any) => {
  console.log("Channel Message Received");
  const commandChannel = await connection.findChannelByName(process.env.BOT_CHANNEL);

  if (message.channelIdx === commandChannel.channelIdx) {
    const separatorIndex = message.text.toLowerCase().trim().indexOf(":");
    const cleanedMessage = message.text.slice(separatorIndex + 1);

    let reply = "";
    if (cleanedMessage.beginsWith("help")) {
      if (cleanedMessage === "help alerts") {
        reply = helpAlerts();
      } else if (cleanedMessage === "help bus") {
        reply = helpBus();
      } else if (cleanedMessage === "help info") {
        reply = helpInfo();
      } else {
        reply = help();
      }
    } else if (cleanedMessage.beginsWith("info")) {
      reply = info();
    } else if (cleanedMessage.beginsWith("alerts")) {
      reply = alerts();
    } else if (cleanedMessage.beginsWith("bus")) {
    }
    await connection.sendChannelTextMessage(commandChannel.channelIdx, reply);
    return;
  }
};

// Clean up contacts with auto-add contacts on
connection.on(Constants.PushCodes.Advert, async () => {
  const contacts = await connection.getContacts();
  // Filter out users and remove any room servers and repeaters
  await contacts
    .filter(({ type }: { type: number }) => type !== 1)
    .map(({ publicKey, advName }: { publicKey: any; advName: string }) => {
      console.log("Removing Contact:", advName);
      connection.removeContact(publicKey);
    });
});

connection.on("disconnected", async () => {
  console.log("Disconnected");
  await connection.connect();
});

// Connect to companion
await connection.connect();
