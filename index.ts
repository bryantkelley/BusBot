import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import {
  alerts,
  busStop,
  busStopAndRoute,
  help,
  helpAlerts,
  helpBus,
  helpInfo,
  info,
} from "./commands";

let lastAdvert: number; // Date.now()

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

  // if no lastAdvert or it's been at least 12 hours, send advert
  const currentTime = Date.now();
  if (!lastAdvert || currentTime - lastAdvert > 12 * 60 * 60 * 1000) {
    console.log("Sending Advert");
    await connection.sendFloodAdvert();
    lastAdvert = currentTime;
  }
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

const handleCommand = (cleanedMessage: string): string | undefined => {
  let reply = "";
  if (cleanedMessage.startsWith("help")) {
    if (cleanedMessage === "help alerts") {
      reply = helpAlerts();
    } else if (cleanedMessage === "help bus") {
      reply = helpBus();
    } else if (cleanedMessage === "help info") {
      reply = helpInfo();
    } else {
      reply = help();
    }
  } else if (cleanedMessage.startsWith("info")) {
    reply = info();
  } else if (cleanedMessage.startsWith("alerts")) {
    reply = alerts();
  } else if (cleanedMessage.startsWith("bus")) {
    const firstSpaceIndex = cleanedMessage.indexOf(" "); // Space after the word bus
    if (firstSpaceIndex === -1) {
      // If no space found, return help
      reply = helpBus();
    } else if (firstSpaceIndex !== 3) {
      // If the first space isn't the fourth character, then this isn't a command to answer
      return;
    } else {
      const secondSpaceIndex = cleanedMessage.indexOf(" ", firstSpaceIndex + 1);
      if (secondSpaceIndex === -1) {
        // If there's no second space found, then this is a stopId only
        const stopId = cleanedMessage.slice(firstSpaceIndex + 1);
        reply = busStop(stopId);
      } else {
        const stopId = cleanedMessage.slice(firstSpaceIndex + 1, secondSpaceIndex);
        const routeId = cleanedMessage.slice(secondSpaceIndex + 1);
        reply = busStopAndRoute(stopId, routeId);
      }
    }
  } else {
    // no command found, ignore this message
    return;
  }
  return reply;
};

const handleContactMessage = async (message: any) => {
  console.log("Contact Message Received");

  const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
  if (!contact) {
    console.log("No contact found for message");
    return;
  }
  const cleanedMessage = message.text.trim().toLowerCase();

  const reply = handleCommand(cleanedMessage);

  if (reply) {
    setTimeout(async () => {
      await connection.sendTextMessage(contact.publicKey, reply, Constants.TxtTypes.Plain);
    }, 5000);
  }
  return;
};

const handleChannelMessage = async (message: any) => {
  console.log("Channel Message Received");
  const commandChannel = await connection.findChannelByName(process.env.BOT_CHANNEL);

  if (message.channelIdx === commandChannel.channelIdx) {
    const separatorIndex = message.text.trim().indexOf(":");
    const cleanedMessage: string = message.text.slice(separatorIndex + 2).toLowerCase(); // remove the colon and the following space
    const reply = handleCommand(cleanedMessage);

    if (reply) {
      setTimeout(async () => {
        await connection.sendChannelTextMessage(commandChannel.channelIdx, reply);
      }, 5000);
    }
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

  // wait at least 12 hours next advert
  const currentTime = Date.now();
  if (currentTime - lastAdvert > 12 * 60 * 60 * 1000) {
    console.log("Sending Advert");
    await connection.sendFloodAdvert();
    lastAdvert = currentTime;
  }
});

connection.on("disconnected", async () => {
  console.log("Disconnected");
  await connection.connect();
});

// Connect to companion
await connection.connect();
